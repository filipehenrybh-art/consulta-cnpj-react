import {
  getSessionFromRequest,
  originIsAllowed,
  readJsonBody,
  sendJson,
} from './_auth.js'
import { getBillingStatus, upsertBillingUser } from './_billing-store.js'
import {
  createPropertySearch,
  deletePropertySearch,
  listPropertySearches,
} from './_property-search-store.js'

const OFFICIAL_URLS = {
  previous: 'https://www.ridigital.org.br/PO/DefaultPO.aspx?from=menu',
  qualified: 'https://www.ridigital.org.br/CE/DefaultCE.aspx?from=menu',
  registration_view: 'https://www.ridigital.org.br/VisualizarMatricula/DefaultVM.aspx?from=menu',
  digital_certificate: 'https://www.ridigital.org.br/CertidaoDigital/frmPedidosCertidao.aspx?from=menu',
}
const SERVICE_TYPES = new Set(['previous', 'qualified', 'registration_view', 'digital_certificate'])
const PURPOSES = new Set(['supplier_analysis', 'credit_analysis', 'rights_protection', 'authorized_due_diligence', 'other_legitimate'])

function text(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength)
}

export function normalizePropertyRequest(body = {}) {
  const cnpj = String(body.cnpj || '').replace(/\D/g, '')
  const companyName = text(body.companyName, 200)
  const serviceType = text(body.serviceType, 40)
  const state = text(body.state, 20).toUpperCase()
  const city = text(body.city, 120)
  const purpose = text(body.purpose, 50)

  if (!/^\d{14}$/.test(cnpj)) throw new Error('PROPERTY_CNPJ_INVALID')
  if (!companyName) throw new Error('PROPERTY_COMPANY_INVALID')
  if (!SERVICE_TYPES.has(serviceType)) throw new Error('PROPERTY_SERVICE_INVALID')
  if (!/^[A-Z]{2}$/.test(state)) throw new Error('PROPERTY_STATE_INVALID')
  if (city.length < 2) throw new Error('PROPERTY_CITY_INVALID')
  if (!PURPOSES.has(purpose)) throw new Error('PROPERTY_PURPOSE_INVALID')
  if (body.legitimateUseConfirmed !== true) throw new Error('PROPERTY_CONFIRMATION_REQUIRED')

  return { cnpj, companyName, serviceType, state, city, purpose }
}

export function officialUrlForService(serviceType) {
  return OFFICIAL_URLS[serviceType] || OFFICIAL_URLS.qualified
}

async function premiumUser(request) {
  const user = getSessionFromRequest(request)
  await upsertBillingUser(user)
  const billing = await getBillingStatus(user.id)
  if (!billing?.premiumActive) throw new Error('PREMIUM_REQUIRED')
  return user
}

function requestError(error) {
  if (error.message?.startsWith('SESSION_')) return [401, 'Entre com sua conta Google para continuar.']
  if (error.message === 'PREMIUM_REQUIRED') return [403, 'Este recurso está disponível somente para contas Premium.']
  if (error.message === 'PROPERTY_CONFIRMATION_REQUIRED') return [400, 'Confirme que a pesquisa possui finalidade legítima.']
  if (error.message?.startsWith('PROPERTY_')) return [400, 'Revise os dados informados para a pesquisa imobiliária.']
  return [503, 'Não foi possível atualizar o histórico imobiliário agora.']
}

export default async function handler(request, response) {
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, DELETE')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  if (request.method !== 'GET' && !originIsAllowed(request)) {
    return sendJson(response, 403, { error: 'Origem não autorizada.' })
  }

  try {
    const user = await premiumUser(request)

    if (request.method === 'GET') {
      return sendJson(response, 200, {
        searches: await listPropertySearches(user.id),
      })
    }

    const body = await readJsonBody(request)
    if (request.method === 'POST') {
      const search = await createPropertySearch(user.id, normalizePropertyRequest(body))
      return sendJson(response, 201, { search, officialUrl: officialUrlForService(search.serviceType) })
    }

    const searchId = text(body.id, 80)
    if (!/^[0-9a-f-]{36}$/i.test(searchId)) throw new Error('PROPERTY_ID_INVALID')
    const removed = await deletePropertySearch(user.id, searchId)
    if (!removed) return sendJson(response, 404, { error: 'Registro não encontrado.' })
    return sendJson(response, 200, { removed: true })
  } catch (error) {
    const [status, message] = requestError(error)
    return sendJson(response, status, { error: message })
  }
}
