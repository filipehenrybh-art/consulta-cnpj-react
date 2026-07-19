import { ANNUAL_PLAN, mercadoPagoRequest } from './_billing.js'
import { applyPaymentStatus, listPendingAnnualOrdersForUser } from './_billing-store.js'

export function selectAnnualPaymentForOrder(order, payments) {
  const matching = (Array.isArray(payments) ? payments : []).filter((payment) => (
    String(payment.external_reference || '') === String(order.id)
    && Number(payment.transaction_amount) === Number(order.amount)
    && payment.currency_id === order.currency
    && order.plan === ANNUAL_PLAN.code
  ))

  return matching.find((payment) => payment.status === 'approved') || matching[0] || null
}

export async function reconcileAnnualPaymentsForUser(userId) {
  const pendingOrders = await listPendingAnnualOrdersForUser(userId)
  const reconciled = []

  // Processa do mais antigo para o mais recente, mantendo a compra mais nova
  // como fonte do direito quando houver mais de uma aprovação para a conta.
  for (const order of [...pendingOrders].reverse()) {
    const query = new URLSearchParams({
      external_reference: order.id,
      sort: 'date_created',
      criteria: 'desc',
      limit: '10',
    })
    const search = await mercadoPagoRequest(`/v1/payments/search?${query.toString()}`)
    const payment = selectAnnualPaymentForOrder(order, search.results)
    if (!payment) continue

    await applyPaymentStatus({
      orderId: order.id,
      providerPaymentId: payment.id,
      status: payment.status,
      approvedAt: payment.date_approved,
    })
    reconciled.push({ orderId: order.id, paymentId: String(payment.id), status: payment.status })
  }

  return reconciled
}
