import { readJsonBody, sendJson } from '../_auth.js'
import {
  ANNUAL_PLAN,
  MONTHLY_PLAN,
  mercadoPagoRequest,
  mercadoPagoSubscriptionsToken,
  verifyMercadoPagoWebhook,
} from '../_billing.js'
import {
  applyPaymentStatus,
  applySubscriptionStatus,
  findOrderByProviderPlanId,
  findOrderByProviderSubscriptionId,
  getOrder,
  hasWebhookEvent,
  recordWebhookEvent,
} from '../_billing-store.js'

function notificationData(request, body) {
  const url = new URL(request.url, 'http://localhost')
  return {
    dataId: url.searchParams.get('data.id') || body?.data?.id || null,
    type: body?.type || url.searchParams.get('type') || 'payment',
  }
}

function monthlyValuesMatch(entity) {
  return Number(entity.transaction_amount ?? entity.auto_recurring?.transaction_amount) === MONTHLY_PLAN.amount
    && (entity.currency_id ?? entity.auto_recurring?.currency_id) === MONTHLY_PLAN.currency
}

async function processAnnualPayment(dataId) {
  const payment = await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(dataId)}`)
  const orderId = String(payment.external_reference || '')
  const order = await getOrder(orderId)
  if (!order) return { ignored: true, status: payment.status }

  const amountMatches = Number(payment.transaction_amount) === ANNUAL_PLAN.amount
  const currencyMatches = payment.currency_id === ANNUAL_PLAN.currency
  if (order.plan !== ANNUAL_PLAN.code || !amountMatches || !currencyMatches) {
    throw new Error('PAYMENT_ORDER_MISMATCH')
  }

  await applyPaymentStatus({
    orderId,
    providerPaymentId: payment.id,
    status: payment.status,
    approvedAt: payment.date_approved,
  })
  return { status: payment.status, providerPaymentId: String(payment.id) }
}

async function processSubscription(dataId) {
  const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(dataId)}`, {
    accessToken: mercadoPagoSubscriptionsToken(),
  })
  const orderId = String(subscription.external_reference || '')
  const order = await getOrder(orderId)
    || await findOrderByProviderPlanId(subscription.preapproval_plan_id)
  if (!order) return { ignored: true, status: subscription.status }

  const frequencyMatches = Number(subscription.auto_recurring?.frequency) === 1
    && subscription.auto_recurring?.frequency_type === 'months'
  if (order.plan !== MONTHLY_PLAN.code || !frequencyMatches || !monthlyValuesMatch(subscription)) {
    throw new Error('SUBSCRIPTION_ORDER_MISMATCH')
  }

  await applySubscriptionStatus({
    orderId,
    providerSubscriptionId: subscription.id,
    status: subscription.status,
    nextPaymentDate: subscription.next_payment_date,
  })
  return { status: subscription.status, providerSubscriptionId: String(subscription.id) }
}

async function processAuthorizedPayment(dataId) {
  const subscriptionsAccessToken = mercadoPagoSubscriptionsToken()
  const invoice = await mercadoPagoRequest(`/authorized_payments/${encodeURIComponent(dataId)}`, {
    accessToken: subscriptionsAccessToken,
  })
  const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(invoice.preapproval_id)}`, {
    accessToken: subscriptionsAccessToken,
  })
  const order = await getOrder(String(invoice.external_reference || ''))
    || await findOrderByProviderSubscriptionId(invoice.preapproval_id)
    || await findOrderByProviderPlanId(subscription.preapproval_plan_id)
  if (!order) return { ignored: true, status: invoice.payment?.status || invoice.status }
  if (order.plan !== MONTHLY_PLAN.code || !monthlyValuesMatch(invoice)) {
    throw new Error('SUBSCRIPTION_PAYMENT_MISMATCH')
  }
  await applySubscriptionStatus({
    orderId: order.id,
    providerSubscriptionId: subscription.id,
    status: subscription.status,
    nextPaymentDate: subscription.next_payment_date,
    paymentStatus: invoice.payment?.status || invoice.status,
    paymentDate: invoice.debit_date || invoice.date_created,
  })
  return {
    status: invoice.payment?.status || invoice.status,
    providerSubscriptionId: String(subscription.id),
    providerPaymentId: invoice.payment?.id ? String(invoice.payment.id) : null,
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  try {
    const body = await readJsonBody(request)
    const { dataId, type } = notificationData(request, body)
    const isSubscriptionEvent = type === 'subscription_preapproval' || type === 'subscription_authorized_payment'
    const webhookSecret = isSubscriptionEvent
      ? process.env.MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET
      : process.env.MERCADO_PAGO_WEBHOOK_SECRET
    if (!webhookSecret) throw new Error('MERCADO_PAGO_WEBHOOK_SECRET_MISSING')
    if (!dataId || !verifyMercadoPagoWebhook(request, dataId, webhookSecret)) {
      return sendJson(response, 401, { error: 'Notificação inválida.' })
    }

    const eventId = String(body.id || `${type}:${dataId}:${body.action || 'updated'}`)
    if (await hasWebhookEvent(eventId)) return sendJson(response, 200, { received: true })

    let result
    if (type === 'subscription_preapproval') result = await processSubscription(dataId)
    else if (type === 'subscription_authorized_payment') result = await processAuthorizedPayment(dataId)
    else result = await processAnnualPayment(dataId)

    await recordWebhookEvent(eventId, {
      provider: 'mercado_pago',
      type,
      dataId: String(dataId),
      ...result,
    })
    return sendJson(response, result.ignored ? 202 : 200, { received: true })
  } catch (error) {
    if (error.message === 'MERCADO_PAGO_WEBHOOK_SECRET_MISSING') {
      return sendJson(response, 503, { error: 'Webhook ainda não configurado.' })
    }
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTIONS_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'Credenciais de Assinaturas ainda não configuradas.' })
    }
    if (error.message?.endsWith('_MISMATCH')) {
      return sendJson(response, 409, { error: 'Notificação não corresponde ao plano contratado.' })
    }
    console.error('Falha ao processar webhook Mercado Pago:', error.message)
    return sendJson(response, 500, { error: 'Falha ao processar a notificação.' })
  }
}
