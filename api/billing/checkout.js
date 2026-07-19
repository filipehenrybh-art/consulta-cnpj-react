import { randomUUID } from 'node:crypto'
import { getSessionFromRequest, originIsAllowed, readJsonBody, sendJson } from '../_auth.js'
import {
  ANNUAL_PLAN,
  MONTHLY_PLAN,
  assertMercadoPagoConfigured,
  buildAnnualPreference,
  buildMonthlySubscription,
  createOrderId,
  mercadoPagoRequest,
  mercadoPagoSubscriptionsToken,
  publicCheckoutUrl,
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
    if (![ANNUAL_PLAN.code, MONTHLY_PLAN.code].includes(body.plan)) {
      return sendJson(response, 400, { error: 'Plano Premium inválido.' })
    }

    assertMercadoPagoConfigured()
    await upsertBillingUser(user)
    const selectedPlan = body.plan === MONTHLY_PLAN.code ? MONTHLY_PLAN : ANNUAL_PLAN
    const subscriptionsAccessToken = selectedPlan.code === MONTHLY_PLAN.code
      ? mercadoPagoSubscriptionsToken()
      : null
    const orderId = createOrderId()
    const now = new Date().toISOString()
    await createOrder({
      id: orderId,
      userId: user.id,
      userEmail: user.email,
      plan: selectedPlan.code,
      amount: selectedPlan.amount,
      currency: selectedPlan.currency,
      status: 'creating',
      provider: 'mercado_pago',
      providerPreferenceId: null,
      providerPaymentId: null,
      providerSubscriptionId: null,
      createdAt: now,
      updatedAt: now,
    })

    if (selectedPlan.code === MONTHLY_PLAN.code) {
      const subscription = await mercadoPagoRequest('/preapproval', {
        accessToken: subscriptionsAccessToken,
        method: 'POST',
        headers: { 'X-Idempotency-Key': randomUUID() },
        body: JSON.stringify(buildMonthlySubscription({ orderId, user })),
      })
      if (!subscription.init_point) throw new Error('MERCADO_PAGO_CHECKOUT_URL_MISSING')
      await updateOrder(orderId, {
        status: subscription.status || 'pending',
        providerSubscriptionId: String(subscription.id),
      })
      return sendJson(response, 201, { orderId, checkoutUrl: subscription.init_point })
    }

    const preference = await mercadoPagoRequest('/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': randomUUID() },
      body: JSON.stringify(buildAnnualPreference({ orderId, user })),
    })
    const checkoutUrl = publicCheckoutUrl(preference)
    if (!checkoutUrl) throw new Error('MERCADO_PAGO_CHECKOUT_URL_MISSING')

    await updateOrder(orderId, {
      status: 'pending',
      providerPreferenceId: String(preference.id),
    })

    return sendJson(response, 201, { orderId, checkoutUrl })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { error: 'Entre com sua conta Google para continuar.' })
    if (error.message === 'MERCADO_PAGO_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'As credenciais de teste do Mercado Pago ainda não foram configuradas.' })
    }
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTIONS_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'As credenciais de teste específicas de Assinaturas ainda não foram configuradas.' })
    }
    if (error.message === 'MERCADO_PAGO_PUBLIC_RETURN_URL_MISSING') {
      return sendJson(response, 503, { error: 'A URL HTTPS temporária de retorno da assinatura ainda não foi configurada.' })
    }
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTION_PAYER_MISSING') {
      return sendJson(response, 503, { error: 'O comprador de teste da assinatura ainda não foi configurado.' })
    }
    if (error.message === 'BILLING_DATABASE_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'O banco de pagamentos ainda não foi configurado.' })
    }
    if (error.message === 'MERCADO_PAGO_REQUEST_FAILED' && [401, 403].includes(error.status)) {
      return sendJson(response, 503, { error: 'O Mercado Pago recusou a credencial. Confirme se o Access Token de teste está correto.' })
    }
    if (error.message === 'MERCADO_PAGO_REQUEST_FAILED' && error.status === 400) {
      console.error('Mercado Pago recusou os dados do checkout:', JSON.stringify(error.details))
      return sendJson(response, 502, { error: 'O Mercado Pago recusou a configuração do checkout de teste.' })
    }
    console.error('Falha ao criar checkout:', error.message, error.cause?.code || '')
    return sendJson(response, 502, { error: 'Não foi possível iniciar o pagamento agora.' })
  }
}
