import { randomUUID } from 'node:crypto'
import { getSessionFromRequest, originIsAllowed, readJsonBody, sendJson } from '../_auth.js'
import {
  MONTHLY_PLAN,
  buildAuthorizedMonthlySubscription,
  createOrderId,
  mercadoPagoRequest,
  mercadoPagoSubscriptionsHeaders,
  mercadoPagoSubscriptionsToken,
} from '../_billing.js'
import { createOrder, updateOrder, upsertBillingUser } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }
  if (!originIsAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })

  try {
    const user = getSessionFromRequest(request)
    const body = await readJsonBody(request)
    const orderId = createOrderId()
    const now = new Date().toISOString()
    const payload = buildAuthorizedMonthlySubscription({
      orderId,
      user,
      cardToken: body.cardToken,
    })

    await upsertBillingUser(user)
    await createOrder({
      id: orderId,
      userId: user.id,
      userEmail: user.email,
      plan: MONTHLY_PLAN.code,
      amount: MONTHLY_PLAN.amount,
      currency: MONTHLY_PLAN.currency,
      status: 'creating',
      provider: 'mercado_pago',
      providerPreferenceId: null,
      providerPaymentId: null,
      providerSubscriptionId: null,
      providerPlanId: null,
      createdAt: now,
      updatedAt: now,
    })

    const subscriptionsToken = mercadoPagoSubscriptionsToken()
    const subscription = await mercadoPagoRequest('/preapproval', {
      accessToken: subscriptionsToken,
      method: 'POST',
      headers: {
        'X-Idempotency-Key': randomUUID(),
        ...mercadoPagoSubscriptionsHeaders(subscriptionsToken),
      },
      body: JSON.stringify(payload),
    })

    await updateOrder(orderId, {
      status: subscription.status,
      providerSubscriptionId: String(subscription.id),
      nextPaymentDate: subscription.next_payment_date || null,
    })

    return sendJson(response, 201, {
      orderId,
      subscriptionStatus: subscription.status,
    })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { error: 'Entre com sua conta Google para continuar.' })
    if (error.message === 'MERCADO_PAGO_CARD_TOKEN_INVALID') {
      return sendJson(response, 400, { error: 'O token seguro do cartão é inválido ou expirou.' })
    }
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTION_PAYER_MISSING') {
      return sendJson(response, 503, { error: 'O comprador de teste da assinatura ainda não foi configurado.' })
    }
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTIONS_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'As credenciais de Assinaturas não estão configuradas.' })
    }
    if (error.message === 'MERCADO_PAGO_REQUEST_FAILED') {
      console.error(
        'Mercado Pago recusou a assinatura com cartão:',
        JSON.stringify({ status: error.status, details: error.details }),
      )
      if (error.status === 503) {
        return sendJson(response, 503, {
          error: 'O ambiente de testes de Assinaturas do Mercado Pago está temporariamente indisponível. O cartão não foi recusado; tente novamente mais tarde.',
        })
      }
      if (error.details?.message === 'Card token service not found') {
        return sendJson(response, 503, {
          error: 'O Mercado Pago não encontrou o token de teste no ambiente de Assinaturas. Confira se a Public Key e o Access Token pertencem à mesma aplicação.',
        })
      }
      return sendJson(response, error.status === 400 ? 422 : 502, {
        error: 'O Mercado Pago recusou a autorização do cartão de teste.',
      })
    }
    console.error('Falha ao autorizar assinatura mensal:', error.message)
    return sendJson(response, 502, { error: 'Não foi possível autorizar a assinatura agora.' })
  }
}
