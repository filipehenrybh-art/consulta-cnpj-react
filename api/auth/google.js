import {
  createSessionToken,
  originIsAllowed,
  readJsonBody,
  sendJson,
  sessionUserIsAdmin,
  sessionCookie,
  verifyGoogleIdToken,
} from '../_auth.js'
import { recordUserLogin } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  if (!originIsAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })

  try {
    const body = await readJsonBody(request)
    if (typeof body.credential !== 'string' || body.credential.length > 10_000) {
      return sendJson(response, 400, { error: 'Credencial do Google ausente ou inválida.' })
    }

    const user = await verifyGoogleIdToken(body.credential)
    await recordUserLogin(user).catch(() => {})
    const session = createSessionToken(user)
    response.setHeader('Set-Cookie', sessionCookie(session, request))
    return sendJson(response, 200, { user: { ...user, admin: sessionUserIsAdmin(user) } })
  } catch (error) {
    if (error.message === 'GOOGLE_CLIENT_ID_MISSING' || error.message === 'SESSION_SECRET_MISSING') {
      return sendJson(response, 503, { error: 'Autenticação ainda não configurada neste ambiente.' })
    }
    if (error.message === 'GOOGLE_KEYS_UNAVAILABLE') {
      return sendJson(response, 503, { error: 'Não foi possível validar a credencial agora. Tente novamente.' })
    }
    return sendJson(response, 401, { error: 'Credencial do Google inválida ou expirada.' })
  }
}
