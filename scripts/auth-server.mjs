import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'

function loadLocalEnvironment() {
  if (!existsSync('.env')) return

  for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!(key in process.env)) process.env[key] = value
  }
}

loadLocalEnvironment()

function loadGoogleKeysThroughWindows() {
  if (process.platform !== 'win32' || process.env.GOOGLE_JWKS_JSON) return

  try {
    const googleKeys = execFileSync(
      'curl.exe',
      ['--ssl-no-revoke', '--silent', '--show-error', '--max-time', '20', 'https://www.googleapis.com/oauth2/v3/certs'],
      { encoding: 'utf8', timeout: 25_000, windowsHide: true },
    ).trim()
    const parsedKeys = JSON.parse(googleKeys)
    if (!Array.isArray(parsedKeys.keys) || parsedKeys.keys.length === 0) throw new Error('GOOGLE_KEYS_EMPTY')
    process.env.GOOGLE_JWKS_JSON = googleKeys
  } catch {
    try {
      const command = "$ProgressPreference='SilentlyContinue'; (Invoke-WebRequest -UseBasicParsing -Uri 'https://www.googleapis.com/oauth2/v3/certs' -TimeoutSec 15).Content"
      process.env.GOOGLE_JWKS_JSON = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { encoding: 'utf8', timeout: 20_000, windowsHide: true },
      ).trim()
    } catch {
      console.warn('Não foi possível carregar as chaves públicas do Google para o teste local.')
    }
  }
}

loadGoogleKeysThroughWindows()

const { default: googleHandler } = await import('../api/auth/google.js')
const { default: sessionHandler } = await import('../api/auth/session.js')
const { default: adminUsersHandler } = await import('../api/admin/users.js')
const { default: adminCourtesyHandler } = await import('../api/admin/courtesy.js')
const { default: checkoutHandler } = await import('../api/billing/checkout.js')
const { default: subscribeHandler } = await import('../api/billing/subscribe.js')
const { default: cancelSubscriptionHandler } = await import('../api/billing/cancel.js')
const { default: billingReturnHandler } = await import('../api/billing/return.js')
const { default: billingStatusHandler } = await import('../api/billing/status.js')
const { default: propertySearchesHandler } = await import('../api/property-searches.js')
const { default: mercadoPagoWebhookHandler } = await import('../api/webhooks/mercadopago.js')
const { default: cnpjHandler } = await import('../api/cnpj/[cnpj].js')

const handlers = new Map([
  ['/api/auth/google', googleHandler],
  ['/api/auth/session', sessionHandler],
  ['/api/admin/users', adminUsersHandler],
  ['/api/admin/courtesy', adminCourtesyHandler],
  ['/api/billing/checkout', checkoutHandler],
  ['/api/billing/subscribe', subscribeHandler],
  ['/api/billing/cancel', cancelSubscriptionHandler],
  ['/api/billing/return', billingReturnHandler],
  ['/api/billing/status', billingStatusHandler],
  ['/api/property-searches', propertySearchesHandler],
  ['/api/webhooks/mercadopago', mercadoPagoWebhookHandler],
])

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname
  const handler = handlers.get(pathname) || (/^\/api\/cnpj\/\d{14}$/.test(pathname) ? cnpjHandler : null)

  if (!handler) {
    response.statusCode = 404
    response.end('Not found')
    return
  }

  try {
    await handler(request, response)
  } catch {
    if (!response.headersSent) {
      response.statusCode = 500
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    response.end(JSON.stringify({ error: 'Erro interno de autenticação.' }))
  }
})

const port = Number(process.env.AUTH_PORT || 8788)
server.listen(port, '127.0.0.1', () => {
  console.log(`Servidor de autenticação local: http://127.0.0.1:${port}`)
})
