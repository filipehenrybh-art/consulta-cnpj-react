import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const ANNUAL_PLAN = Object.freeze({
  code: 'premium_annual',
  title: 'Plano Premium Anual - Pilar Finanças',
  amount: 200,
  currency: 'BRL',
})

export const MONTHLY_PLAN = Object.freeze({
  code: 'premium_monthly',
  title: 'Plano Premium Mensal - Pilar Finanças',
  amount: 19.9,
  currency: 'BRL',
})

export function createOrderId() {
  return `ord_${randomUUID()}`
}

export function mercadoPagoSandboxEnabled() {
  return String(process.env.MERCADO_PAGO_USE_SANDBOX || 'true').toLowerCase() !== 'false'
}

function mercadoPagoToken(explicitToken) {
  const token = explicitToken || process.env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) throw new Error('MERCADO_PAGO_NOT_CONFIGURED')
  return token
}

export function mercadoPagoSubscriptionsToken() {
  const token = String(process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN || '').trim()
  if (!token) throw new Error('MERCADO_PAGO_SUBSCRIPTIONS_NOT_CONFIGURED')
  return token
}

export function mercadoPagoSubscriptionsHeaders(token = mercadoPagoSubscriptionsToken()) {
  return String(token).startsWith('TEST-') ? { 'X-scope': 'stage' } : {}
}

export function assertMercadoPagoConfigured() {
  mercadoPagoToken()
}

function mercadoPagoRequestThroughWindows(path, options) {
  const command = String.raw`
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $requestData = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $headers = @{
      Accept = 'application/json'
      Authorization = "Bearer $($requestData.accessToken)"
    }
    if ($requestData.idempotencyKey) {
      $headers['X-Idempotency-Key'] = [string]$requestData.idempotencyKey
    }
    if ($requestData.scope) {
      $headers['X-scope'] = [string]$requestData.scope
    }
    try {
      $parameters = @{
        Uri = "https://api.mercadopago.com$($requestData.path)"
        Method = [string]$requestData.method
        Headers = $headers
        UseBasicParsing = $true
        TimeoutSec = 30
      }
      if ($requestData.body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = [string]$requestData.body
      }
      $apiResponse = Invoke-WebRequest @parameters
      [pscustomobject]@{
        status = [int]$apiResponse.StatusCode
        body = [string]$apiResponse.Content
      } | ConvertTo-Json -Compress
    } catch {
      $status = 0
      $responseBody = ''
      if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
        try {
          $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
          $responseBody = $reader.ReadToEnd()
          $reader.Dispose()
        } catch {}
      }
      [pscustomobject]@{
        status = $status
        body = $responseBody
        transportError = if ($status -eq 0) { $_.Exception.Message } else { $null }
      } | ConvertTo-Json -Compress
    }
  `

  const input = JSON.stringify({
    path,
    method: options.method || 'GET',
    body: options.body || null,
    idempotencyKey: options.headers?.['X-Idempotency-Key'] || null,
    scope: options.headers?.['X-scope'] || null,
    accessToken: mercadoPagoToken(options.accessToken),
  })
  const rawResult = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', command],
    {
      encoding: 'utf8',
      env: process.env,
      input,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 35_000,
      windowsHide: true,
    },
  )
  const result = JSON.parse(rawResult)
  if (result.transportError) throw new Error('MERCADO_PAGO_TRANSPORT_FAILED')

  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    data: result.body ? JSON.parse(result.body) : {},
  }
}

export async function mercadoPagoRequest(path, options = {}) {
  const { accessToken, ...requestOptions } = options
  const token = mercadoPagoToken(accessToken)
  let result
  try {
    const response = await fetch(`https://api.mercadopago.com${path}`, {
      ...requestOptions,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...requestOptions.headers,
      },
    })
    result = {
      ok: response.ok,
      status: response.status,
      data: await response.json().catch(() => ({})),
    }
  } catch (error) {
    const certificateError = error.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    if (process.platform !== 'win32' || !certificateError) throw error
    result = mercadoPagoRequestThroughWindows(path, { ...requestOptions, accessToken: token })
  }

  if (!result.ok) {
    const error = new Error('MERCADO_PAGO_REQUEST_FAILED')
    error.status = result.status
    error.details = result.data
    throw error
  }
  return result.data
}

export function buildAnnualPreference({ orderId, user }) {
  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
  const webhookUrl = String(process.env.MERCADO_PAGO_WEBHOOK_URL || '').trim()
  const preference = {
    items: [{
      id: ANNUAL_PLAN.code,
      title: ANNUAL_PLAN.title,
      quantity: 1,
      currency_id: ANNUAL_PLAN.currency,
      unit_price: ANNUAL_PLAN.amount,
    }],
    external_reference: orderId,
    statement_descriptor: 'PILAR FINANCAS',
    payment_methods: { installments: 1 },
    back_urls: {
      success: `${baseUrl}/premium-preview.html?payment=success`,
      pending: `${baseUrl}/premium-preview.html?payment=pending`,
      failure: `${baseUrl}/premium-preview.html?payment=failure`,
    },
  }

  // Nunca associe o e-mail Google real a uma compra Sandbox. O comprador deve
  // entrar no Mercado Pago usando a conta de teste criada para esta aplicação.
  if (!mercadoPagoSandboxEnabled()) preference.payer = { email: user.email }

  if (baseUrl.startsWith('https://')) preference.auto_return = 'approved'
  if (webhookUrl.startsWith('https://')) preference.notification_url = webhookUrl
  return preference
}

export function buildMonthlySubscription({ orderId, user }) {
  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
  const webhookUrl = String(process.env.MERCADO_PAGO_WEBHOOK_URL || '').trim()
  let backUrl = `${baseUrl}/premium-preview.html?subscription=return`

  if (!baseUrl.startsWith('https://')) {
    if (!webhookUrl.startsWith('https://')) throw new Error('MERCADO_PAGO_PUBLIC_RETURN_URL_MISSING')
    const publicUrl = new URL(webhookUrl)
    publicUrl.pathname = '/api/billing/return'
    publicUrl.search = ''
    backUrl = publicUrl.toString()
  }

  const payerEmail = mercadoPagoSandboxEnabled()
    ? String(process.env.MERCADO_PAGO_TEST_PAYER_EMAIL || '').trim()
    : String(user?.email || '').trim()
  if (!payerEmail) throw new Error('MERCADO_PAGO_SUBSCRIPTION_PAYER_MISSING')

  return {
    // A API de Assinaturas rejeita alguns caracteres acentuados no campo reason.
    reason: 'Plano Premium Mensal Pilar Financas',
    external_reference: orderId,
    payer_email: payerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: MONTHLY_PLAN.amount,
      currency_id: MONTHLY_PLAN.currency,
    },
    back_url: backUrl,
    status: 'pending',
  }
}

export function buildAuthorizedMonthlySubscription({ orderId, user, cardToken }) {
  const normalizedToken = String(cardToken || '').trim()
  if (normalizedToken.length < 20 || normalizedToken.length > 300) {
    throw new Error('MERCADO_PAGO_CARD_TOKEN_INVALID')
  }

  return {
    ...buildMonthlySubscription({ orderId, user }),
    card_token_id: normalizedToken,
    status: 'authorized',
  }
}

function safeHexComparison(expectedHex, receivedHex) {
  if (!/^[a-f0-9]{64}$/i.test(receivedHex || '')) return false
  const expected = Buffer.from(expectedHex, 'hex')
  const received = Buffer.from(receivedHex, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export function verifyMercadoPagoWebhook(request, dataId, explicitSecret) {
  const secret = explicitSecret || process.env.MERCADO_PAGO_WEBHOOK_SECRET
  if (!secret) throw new Error('MERCADO_PAGO_WEBHOOK_SECRET_MISSING')

  const signature = String(request.headers['x-signature'] || '')
  const requestId = String(request.headers['x-request-id'] || '')
  const parts = Object.fromEntries(
    signature.split(',').map((part) => part.trim().split('=', 2)),
  )

  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')
  return safeHexComparison(expected, parts.v1)
}

export function publicCheckoutUrl(preference) {
  // O Checkout Pro atual realiza os testes pelo init_point normal usando as
  // credenciais e contas de teste. O sandbox_init_point legado pode entrar em
  // loop de autenticação no domínio sandbox.mercadopago.com.br.
  return preference.init_point || preference.sandbox_init_point
}
