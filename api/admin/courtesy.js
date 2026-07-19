import {
  getAdminFromRequest,
  originIsAllowed,
  readJsonBody,
  sendJson,
} from '../_auth.js'
import { grantCourtesy, revokeCourtesy } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }
  if (!originIsAllowed(request)) return sendJson(response, 403, { error: 'Origem não autorizada.' })

  try {
    const admin = getAdminFromRequest(request)
    const body = await readJsonBody(request)
    const userId = String(body.userId || '').trim()
    if (!userId || userId.length > 200) return sendJson(response, 400, { error: 'Usuário inválido.' })

    let user
    if (body.action === 'grant') {
      user = await grantCourtesy({
        userId,
        admin,
        activeUntil: body.activeUntil || null,
        note: body.note,
      })
    } else if (body.action === 'revoke') {
      user = await revokeCourtesy({ userId, admin })
    } else {
      return sendJson(response, 400, { error: 'Ação administrativa inválida.' })
    }

    return sendJson(response, 200, { user })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { error: 'Entre com a conta administradora.' })
    if (error.message === 'ADMIN_FORBIDDEN') return sendJson(response, 403, { error: 'Esta conta não possui acesso administrativo.' })
    if (error.message === 'USER_NOT_FOUND') return sendJson(response, 404, { error: 'O usuário precisa entrar com Google pelo menos uma vez antes de receber a cortesia.' })
    if (error.message === 'COURTESY_DATE_INVALID') return sendJson(response, 400, { error: 'Escolha uma validade futura ou cortesia permanente.' })
    return sendJson(response, 503, { error: 'Não foi possível atualizar a cortesia agora.' })
  }
}
