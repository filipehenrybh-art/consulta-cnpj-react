import { getSessionFromRequest, sendJson } from '../_auth.js'
import { getBillingStatus, upsertBillingUser } from '../_billing-store.js'
import { reconcileAnnualPaymentsForUser } from '../_billing-reconcile.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  try {
    const user = getSessionFromRequest(request)
    await upsertBillingUser(user)
    await reconcileAnnualPaymentsForUser(user.id).catch((error) => {
      console.warn('Não foi possível reconciliar pagamentos anuais agora:', error.message)
    })
    const billing = await getBillingStatus(user.id)
    return sendJson(response, 200, { billing })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { billing: null })
    return sendJson(response, 503, { error: 'Não foi possível consultar o plano agora.' })
  }
}
