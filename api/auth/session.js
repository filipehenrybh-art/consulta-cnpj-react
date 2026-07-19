import { getSessionFromRequest, sendJson, sessionUserIsAdmin } from '../_auth.js'
import { upsertBillingUser } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  try {
    const user = getSessionFromRequest(request)
    await upsertBillingUser(user).catch(() => {})
    return sendJson(response, 200, { user: { ...user, admin: sessionUserIsAdmin(user) } })
  } catch {
    return sendJson(response, 401, { user: null })
  }
}
