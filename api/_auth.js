import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto'

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
const SESSION_COOKIE = 'pilar_session'
const SESSION_ISSUER = 'pilar-financas'
const SESSION_AUDIENCE = 'consulta-cnpj'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7
const DEFAULT_ADMIN_GOOGLE_EMAILS = ['filipehenrybh@gmail.com']

let cachedKeys = null
let cachedKeysExpireAt = 0

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url')
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url')
}

function parseJwt(token) {
  const parts = String(token || '').split('.')
  if (parts.length !== 3) throw new Error('TOKEN_MALFORMED')

  let header
  let payload
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'))
    payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'))
  } catch {
    throw new Error('TOKEN_MALFORMED')
  }

  return {
    header,
    payload,
    signature: base64UrlDecode(parts[2]),
    signingInput: `${parts[0]}.${parts[1]}`,
  }
}

function getMaxAge(cacheControl) {
  const match = String(cacheControl || '').match(/max-age=(\d+)/i)
  return match ? Number(match[1]) : 3600
}

async function getGoogleKeys() {
  if (cachedKeys && Date.now() < cachedKeysExpireAt) return cachedKeys

  if (process.env.GOOGLE_JWKS_JSON) {
    try {
      const localData = JSON.parse(process.env.GOOGLE_JWKS_JSON)
      if (Array.isArray(localData.keys) && localData.keys.length > 0) {
        cachedKeys = localData.keys
        cachedKeysExpireAt = Date.now() + 60 * 60 * 1000
        return cachedKeys
      }
    } catch {
      throw new Error('GOOGLE_KEYS_UNAVAILABLE')
    }
  }

  const response = await fetch(GOOGLE_CERTS_URL, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) throw new Error('GOOGLE_KEYS_UNAVAILABLE')

  const data = await response.json()
  if (!Array.isArray(data.keys) || data.keys.length === 0) {
    throw new Error('GOOGLE_KEYS_UNAVAILABLE')
  }

  cachedKeys = data.keys
  cachedKeysExpireAt = Date.now() + getMaxAge(response.headers.get('cache-control')) * 1000
  return cachedKeys
}

function matchesAudience(audience, clientId) {
  return Array.isArray(audience) ? audience.includes(clientId) : audience === clientId
}

export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID_MISSING')

  const parsed = parseJwt(idToken)
  if (parsed.header.alg !== 'RS256' || !parsed.header.kid) throw new Error('TOKEN_ALGORITHM_INVALID')

  const keys = await getGoogleKeys()
  const jwk = keys.find((key) => key.kid === parsed.header.kid && key.kty === 'RSA')
  if (!jwk) throw new Error('TOKEN_KEY_NOT_FOUND')

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
  const signatureIsValid = verifySignature(
    'RSA-SHA256',
    Buffer.from(parsed.signingInput),
    publicKey,
    parsed.signature,
  )

  if (!signatureIsValid) throw new Error('TOKEN_SIGNATURE_INVALID')

  const now = Math.floor(Date.now() / 1000)
  const allowedIssuers = ['accounts.google.com', 'https://accounts.google.com']

  if (!allowedIssuers.includes(parsed.payload.iss)) throw new Error('TOKEN_ISSUER_INVALID')
  if (!matchesAudience(parsed.payload.aud, clientId)) throw new Error('TOKEN_AUDIENCE_INVALID')
  if (!Number.isFinite(parsed.payload.exp) || parsed.payload.exp <= now) throw new Error('TOKEN_EXPIRED')
  if (Number.isFinite(parsed.payload.iat) && parsed.payload.iat > now + 300) throw new Error('TOKEN_ISSUED_IN_FUTURE')
  if (!parsed.payload.sub || !parsed.payload.email || parsed.payload.email_verified !== true) {
    throw new Error('TOKEN_PROFILE_INVALID')
  }

  return {
    id: parsed.payload.sub,
    name: parsed.payload.name || parsed.payload.email,
    email: parsed.payload.email,
    picture: parsed.payload.picture || null,
    demo: false,
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET_MISSING')
  return secret
}

function sign(value) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64UrlEncode(JSON.stringify({
    sub: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    iss: SESSION_ISSUER,
    aud: SESSION_AUDIENCE,
    iat: now,
    exp: now + SESSION_DURATION_SECONDS,
  }))
  const unsignedToken = `${header}.${payload}`
  return `${unsignedToken}.${sign(unsignedToken)}`
}

export function verifySessionToken(token) {
  const parsed = parseJwt(token)
  if (parsed.header.alg !== 'HS256') throw new Error('SESSION_ALGORITHM_INVALID')

  const expected = Buffer.from(sign(parsed.signingInput))
  const received = Buffer.from(String(token).split('.')[2] || '')
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error('SESSION_SIGNATURE_INVALID')
  }

  const now = Math.floor(Date.now() / 1000)
  if (parsed.payload.iss !== SESSION_ISSUER || parsed.payload.aud !== SESSION_AUDIENCE) throw new Error('SESSION_CLAIMS_INVALID')
  if (!Number.isFinite(parsed.payload.exp) || parsed.payload.exp <= now) throw new Error('SESSION_EXPIRED')

  return {
    id: parsed.payload.sub,
    name: parsed.payload.name,
    email: parsed.payload.email,
    picture: parsed.payload.picture || null,
    demo: false,
  }
}

export function parseCookies(request) {
  return String(request.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=')
      if (separator > 0) cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1))
      return cookies
    }, {})
}

export function getSessionFromRequest(request) {
  const token = parseCookies(request)[SESSION_COOKIE]
  if (!token) throw new Error('SESSION_NOT_FOUND')
  return verifySessionToken(token)
}

export function sessionUserIsAdmin(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  const configuredEmails = String(process.env.ADMIN_GOOGLE_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
  return Boolean(email && [...DEFAULT_ADMIN_GOOGLE_EMAILS, ...configuredEmails].includes(email))
}

export function getAdminFromRequest(request) {
  const user = getSessionFromRequest(request)
  if (!sessionUserIsAdmin(user)) throw new Error('ADMIN_FORBIDDEN')
  return user
}

export function sessionCookie(token, request) {
  const forwardedProtocol = request.headers['x-forwarded-proto']
  const secure = process.env.NODE_ENV === 'production' || forwardedProtocol === 'https'
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export function expiredSessionCookie(request) {
  const forwardedProtocol = request.headers['x-forwarded-proto']
  const secure = process.env.NODE_ENV === 'production' || forwardedProtocol === 'https'
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ')
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body

  let raw = ''
  for await (const chunk of request) {
    raw += chunk
    if (raw.length > 20_000) throw new Error('BODY_TOO_LARGE')
  }

  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error('BODY_INVALID')
  }
}

export function originIsAllowed(request) {
  const origin = request.headers.origin
  if (!origin) return false

  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173']
  const configured = String(process.env.AUTH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return [...defaults, ...configured].includes(origin)
}

export function sendJson(response, status, body) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}
