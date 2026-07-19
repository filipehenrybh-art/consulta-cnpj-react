import { expiredSessionCookie, getSessionFromRequest, originIsAllowed, sendJson } from '../_auth.js'
import { markUserLoggedOut } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

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
