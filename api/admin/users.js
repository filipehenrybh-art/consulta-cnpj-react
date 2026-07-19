import { getAdminFromRequest, sendJson } from '../_auth.js'
import { listBillingUsers } from '../_billing-store.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  try {
    getAdminFromRequest(request)
    const url = new URL(request.url, 'http://localhost')
    const email = String(url.searchParams.get('email') || '').slice(0, 200)
    const users = await listBillingUsers(email)
    return sendJson(response, 200, { users })
  } catch (error) {
    if (error.message?.startsWith('SESSION_')) return sendJson(response, 401, { error: 'Entre com a conta administradora.' })
    if (error.message === 'ADMIN_FORBIDDEN') return sendJson(response, 403, { error: 'Esta conta não possui acesso administrativo.' })
    return sendJson(response, 503, { error: 'Não foi possível consultar os usuários agora.' })
  }
}
