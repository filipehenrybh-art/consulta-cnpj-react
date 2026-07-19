import { getSessionFromRequest, sendJson } from '../_auth.js'
import { upsertBillingUser } from '../_billing-store.js'

const CNPJ_API_BASE_URL = 'https://publica.cnpj.ws/cnpj'

async function requestWithWindowsTrust(url) {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  const { stdout } = await run('curl.exe', [
    '--ssl-no-revoke',
    '--silent',
    '--show-error',
    '--max-time',
    '25',
    '--header',
    'Accept: application/json',
    '--write-out',
    '\n%{http_code}',
    url,
  ], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  })

  const statusSeparator = stdout.lastIndexOf('\n')
  if (statusSeparator < 0) throw new Error('CNPJ_API_INVALID_CURL_RESPONSE')

  const body = stdout.slice(0, statusSeparator).trim()
  const status = Number(stdout.slice(statusSeparator + 1).trim())
  if (!Number.isInteger(status) || status < 100) throw new Error('CNPJ_API_INVALID_STATUS')

  return {
    ok: status >= 200 && status < 300,
    status,
    payload: body ? JSON.parse(body) : null,
  }
}

async function requestProvider(cnpj) {
  const url = `${CNPJ_API_BASE_URL}/${cnpj}`

  // O Node local no Windows pode não reconhecer a cadeia de certificados
  // instalada no sistema. curl.exe usa o repositório confiável do Windows.
  if (process.platform === 'win32' && !process.env.VERCEL) {
    return requestWithWindowsTrust(url)
  }

  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  return {
    ok: response.ok,
    status: response.status,
    payload: await response.json().catch(() => null),
  }
}

function requestedCnpj(request) {
  const queryValue = request.query?.cnpj
  if (typeof queryValue === 'string') return queryValue.replace(/\D/g, '')

  const pathname = new URL(request.url, 'http://localhost').pathname
  return String(pathname.split('/').pop() || '').replace(/\D/g, '')
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return sendJson(response, 405, { error: 'Método não permitido.' })
  }

  try {
    const user = getSessionFromRequest(request)
    await upsertBillingUser(user).catch(() => {})
  } catch {
    return sendJson(response, 401, { error: 'Entre com sua conta Google para realizar a consulta.' })
  }

  const cnpj = requestedCnpj(request)
  if (!/^\d{14}$/.test(cnpj)) return sendJson(response, 400, { error: 'Informe um CNPJ válido com 14 números.' })

  try {
    const providerResponse = await requestProvider(cnpj)
    const payload = providerResponse.payload

    if (!providerResponse.ok) {
      const error = payload?.detalhes || payload?.message || payload?.mensagem
      return sendJson(response, providerResponse.status, {
        error: error || 'Não foi possível concluir a consulta.',
      })
    }
    if (!payload || typeof payload !== 'object') {
      return sendJson(response, 502, { error: 'A fonte consultada retornou uma resposta inválida.' })
    }

    return sendJson(response, 200, payload)
  } catch {
    return sendJson(response, 502, { error: 'Não foi possível conectar à fonte da consulta agora.' })
  }
}
