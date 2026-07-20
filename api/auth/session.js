import {
  expiredSessionCookie,
  getSessionFromRequest,
  originIsAllowed,
  sendJson,
  sessionUserIsAdmin,
} from '../_auth.js'
import { markUserLoggedOut, upsertBillingUser } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method === 'POST') {
    if (!originIsAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })

    try {
      const user = getSessionFromRequest(request)
      await markUserLoggedOut(user.id)
    } catch {
      // A ausência de sessão não impede a limpeza do cookie no navegador.
    }

    response.setHeader('Set-Cookie', expiredSessionCookie(request))
    return sendJson(response, 200, { ok: true })
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, POST')
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
