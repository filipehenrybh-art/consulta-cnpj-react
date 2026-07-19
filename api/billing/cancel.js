import { getSessionFromRequest, originIsAllowed, sendJson } from '../_auth.js'
import { mercadoPagoRequest, mercadoPagoSubscriptionsToken } from '../_billing.js'
import {
  applySubscriptionStatus,
  findCancelableSubscriptionByUser,
} from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }
  if (!originIsAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })

  try {
    const user = getSessionFromRequest(request)
    const order = await findCancelableSubscriptionByUser(user.id)
    if (!order) return sendJson(response, 404, { error: 'Nenhuma assinatura mensal ativa foi encontrada.' })

    const subscription = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(order.providerSubscriptionId)}`, {
      accessToken: mercadoPagoSubscriptionsToken(),
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' }),
    })
    await applySubscriptionStatus({
      orderId: order.id,
      providerSubscriptionId: subscription.id,
      status: subscription.status,
      nextPaymentDate: order.nextPaymentDate,
    })
    return sendJson(response, 200, { cancelled: true })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { error: 'Entre com sua conta Google.' })
    if (error.message === 'MERCADO_PAGO_SUBSCRIPTIONS_NOT_CONFIGURED') {
      return sendJson(response, 503, { error: 'As credenciais de Assinaturas não estão configuradas.' })
    }
    console.error('Falha ao cancelar assinatura:', error.message)
    return sendJson(response, 502, { error: 'Não foi possível cancelar a renovação agora.' })
  }
}
