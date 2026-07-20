import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

process.env.BILLING_STORAGE_MODE = 'local'
process.env.LOCAL_BILLING_DB = join(tmpdir(), `consulta-cnpj-billing-test-${process.pid}.json`)
process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'test-webhook-secret'
process.env.MERCADO_PAGO_TEST_PAYER_EMAIL = 'buyer@testuser.com'
process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN = 'APP_USR-test-seller'
process.env.ADMIN_GOOGLE_EMAILS = 'admin@example.com'
process.env.SESSION_SECRET = 'test-session-secret-with-at-least-32-characters'
process.env.APP_BASE_URL = 'http://localhost:5173'
process.env.MERCADO_PAGO_WEBHOOK_URL = ''

const billing = await import('../api/_billing.js')
const reconciliation = await import('../api/_billing-reconcile.js')
const auth = await import('../api/_auth.js')
const store = await import('../api/_billing-store.js')
const { default: adminUsersHandler } = await import('../api/admin/users.js')
const { default: adminCourtesyHandler } = await import('../api/admin/courtesy.js')
const { default: cnpjHandler } = await import('../api/cnpj/[cnpj].js')

function mockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value
    },
    end(value) {
      this.body = value ? JSON.parse(value) : null
    },
  }
}

test.beforeEach(async () => {
  await rm(process.env.LOCAL_BILLING_DB, { force: true })
})

test.after(async () => {
  await rm(process.env.LOCAL_BILLING_DB, { force: true })
})

test('produção exige PostgreSQL quando o armazenamento local não está habilitado', async () => {
  const previousMode = process.env.BILLING_STORAGE_MODE
  const previousNodeEnv = process.env.NODE_ENV
  const previousDatabaseUrl = process.env.DATABASE_URL
  process.env.BILLING_STORAGE_MODE = ''
  process.env.NODE_ENV = 'production'
  delete process.env.DATABASE_URL

  try {
    await assert.rejects(
      () => store.getBillingStatus('google-production-check'),
      /BILLING_DATABASE_NOT_CONFIGURED/,
    )
  } finally {
    process.env.BILLING_STORAGE_MODE = previousMode
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previousDatabaseUrl
  }
})

test('preferência anual mantém preço e referência definidos pelo servidor', () => {
  const preference = billing.buildAnnualPreference({
    orderId: 'ord_test',
    user: { email: 'comprador@example.com' },
  })

  assert.equal(preference.external_reference, 'ord_test')
  assert.equal(preference.items[0].unit_price, 200)
  assert.equal(preference.items[0].currency_id, 'BRL')
  assert.equal(preference.payment_methods.installments, 1)
  assert.equal(preference.notification_url, undefined)
  assert.equal(preference.payer, undefined)
  assert.equal(billing.publicCheckoutUrl({
    init_point: 'https://www.mercadopago.com.br/checkout',
    sandbox_init_point: 'https://sandbox.mercadopago.com.br/checkout',
  }), 'https://www.mercadopago.com.br/checkout')
})

test('reconciliação anual aceita somente pagamento correspondente ao pedido', () => {
  const order = {
    id: 'ord_reconcile',
    plan: 'premium_annual',
    amount: 200,
    currency: 'BRL',
  }
  const payment = reconciliation.selectAnnualPaymentForOrder(order, [
    { id: 1, external_reference: 'outro', transaction_amount: 200, currency_id: 'BRL', status: 'approved' },
    { id: 2, external_reference: 'ord_reconcile', transaction_amount: 100, currency_id: 'BRL', status: 'approved' },
    { id: 3, external_reference: 'ord_reconcile', transaction_amount: 200, currency_id: 'BRL', status: 'pending' },
    { id: 4, external_reference: 'ord_reconcile', transaction_amount: 200, currency_id: 'BRL', status: 'approved' },
  ])

  assert.equal(payment.id, 4)
})

test('assinatura mensal pendente usa preço, comprador e referência do servidor', () => {
  process.env.MERCADO_PAGO_WEBHOOK_URL = 'https://tunnel.example.com/api/webhooks/mercadopago'
  const subscription = billing.buildMonthlySubscription({
    orderId: 'ord_monthly_test',
    user: { email: 'google@example.com' },
  })

  assert.equal(subscription.external_reference, 'ord_monthly_test')
  assert.equal(subscription.payer_email, 'buyer@testuser.com')
  assert.equal(subscription.auto_recurring.frequency, 1)
  assert.equal(subscription.auto_recurring.frequency_type, 'months')
  assert.equal(subscription.auto_recurring.transaction_amount, 19.9)
  assert.equal(subscription.auto_recurring.currency_id, 'BRL')
  assert.equal(subscription.back_url, 'https://tunnel.example.com/api/billing/return')
  assert.equal(subscription.status, 'pending')
})

test('assinatura mensal de produção usa o e-mail Google autenticado', () => {
  process.env.MERCADO_PAGO_USE_SANDBOX = 'false'
  process.env.MERCADO_PAGO_WEBHOOK_URL = 'https://consulta.example.com/api/webhooks/mercadopago'

  try {
    const subscription = billing.buildMonthlySubscription({
      orderId: 'ord_production',
      user: { email: 'cliente@example.com' },
    })
    assert.equal(subscription.payer_email, 'cliente@example.com')
    assert.equal(subscription.external_reference, 'ord_production')
  } finally {
    process.env.MERCADO_PAGO_USE_SANDBOX = 'true'
  }
})

test('assinatura mensal com credenciais TEST usa a conta compradora de teste', () => {
  process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN = 'TEST-automatic-stage-token'
  process.env.MERCADO_PAGO_WEBHOOK_URL = 'https://tunnel.example.com/api/webhooks/mercadopago'

  try {
    const subscription = billing.buildMonthlySubscription({
      orderId: 'ord_stage',
      user: { email: 'cliente-google@example.com' },
    })
    assert.equal(subscription.payer_email, 'buyer@testuser.com')
    assert.deepEqual(
      billing.mercadoPagoSubscriptionsHeaders(process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN),
      { 'X-scope': 'stage' },
    )
  } finally {
    process.env.MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN = 'APP_USR-test-seller'
  }
})

test('assinatura com credencial APP_USR não envia o escopo exclusivo de stage', () => {
  assert.deepEqual(billing.mercadoPagoSubscriptionsHeaders('APP_USR-seller-token'), {})
})

test('somente a conta Google configurada recebe permissão administrativa', () => {
  assert.equal(auth.sessionUserIsAdmin({ email: 'ADMIN@example.com' }), true)
  assert.equal(auth.sessionUserIsAdmin({ email: 'FILIPEHENRYBH@gmail.com' }), true)
  assert.equal(auth.sessionUserIsAdmin({ email: 'outro@example.com' }), false)
})

test('login e logout ficam registrados para a gestão administrativa', async () => {
  const user = { id: 'google-access-audit', email: 'acesso@example.com', name: 'Acesso' }
  await store.recordUserLogin(user)
  await store.recordUserLogin(user)

  let [listedUser] = await store.listBillingUsers('acesso@example.com')
  assert.equal(listedUser.loginCount, 2)
  assert.ok(listedUser.lastLoginAt)
  assert.ok(listedUser.lastSeenAt)
  assert.equal(listedUser.lastLogoutAt, null)

  await store.markUserLoggedOut(user.id)
  ;[listedUser] = await store.listBillingUsers('acesso@example.com')
  assert.ok(listedUser.lastLogoutAt)
})

test('consulta de CNPJ recusa acesso sem autenticação Google', async () => {
  const response = mockResponse()
  await cnpjHandler({
    method: 'GET',
    url: '/api/cnpj/27865757000102',
    headers: {},
  }, response)

  assert.equal(response.statusCode, 401)
  assert.match(response.body.error, /Google/i)
})

test('consulta autenticada valida o CNPJ antes de acessar a fonte externa', async () => {
  const user = { id: 'google-query-test', email: 'consulta@example.com', name: 'Consulta' }
  const cookie = `pilar_session=${encodeURIComponent(auth.createSessionToken(user))}`
  const response = mockResponse()
  await cnpjHandler({
    method: 'GET',
    url: '/api/cnpj/invalido',
    headers: { cookie },
  }, response)

  assert.equal(response.statusCode, 400)
  assert.match(response.body.error, /CNPJ/i)
})

test('administrador concede e revoga cortesia vinculada ao identificador Google', async () => {
  const admin = { id: 'google-admin', email: 'admin@example.com', name: 'Admin' }
  const recipient = { id: 'google-recipient', email: 'presente@example.com', name: 'Presente' }
  await store.upsertBillingUser(admin)
  await store.upsertBillingUser(recipient)

  await store.grantCourtesy({
    userId: recipient.id,
    admin,
    activeUntil: null,
    note: 'Cortesia de teste',
  })
  const active = await store.getBillingStatus(recipient.id)
  assert.equal(active.premiumActive, true)
  assert.equal(active.plan, 'premium_courtesy')
  assert.equal(active.courtesy, true)
  assert.equal(active.activeUntil, null)

  await store.revokeCourtesy({ userId: recipient.id, admin })
  const revoked = await store.getBillingStatus(recipient.id)
  assert.equal(revoked.premiumActive, false)
  assert.equal(revoked.plan, 'basic')
  assert.equal(revoked.courtesy, false)
})

test('endpoints administrativos exigem sessão Google autorizada', async () => {
  const admin = { id: 'google-admin-api', email: 'admin@example.com', name: 'Admin API' }
  const recipient = { id: 'google-recipient-api', email: 'api@example.com', name: 'API Presente' }
  await store.upsertBillingUser(admin)
  await store.upsertBillingUser(recipient)
  const cookie = `pilar_session=${encodeURIComponent(auth.createSessionToken(admin))}`

  const listResponse = mockResponse()
  await adminUsersHandler({
    method: 'GET',
    url: '/api/admin/users?email=api%40example.com',
    headers: { cookie },
  }, listResponse)
  assert.equal(listResponse.statusCode, 200)
  assert.equal(listResponse.body.users.length, 1)
  assert.equal(listResponse.body.users[0].id, recipient.id)

  const grantResponse = mockResponse()
  await adminCourtesyHandler({
    method: 'POST',
    url: '/api/admin/courtesy',
    headers: { cookie, origin: 'http://localhost:5173' },
    body: { action: 'grant', userId: recipient.id, activeUntil: null, note: 'API' },
  }, grantResponse)
  assert.equal(grantResponse.statusCode, 200)
  assert.equal(grantResponse.body.user.billing.courtesy, true)

  const unauthorizedResponse = mockResponse()
  await adminUsersHandler({
    method: 'GET',
    url: '/api/admin/users',
    headers: {},
  }, unauthorizedResponse)
  assert.equal(unauthorizedResponse.statusCode, 401)
})

test('assinatura mensal autorizada recebe somente o token seguro do cartão', () => {
  process.env.MERCADO_PAGO_WEBHOOK_URL = 'https://tunnel.example.com/api/webhooks/mercadopago'
  const subscription = billing.buildAuthorizedMonthlySubscription({
    orderId: 'ord_authorized',
    user: { email: 'google@example.com' },
    cardToken: 'card_token_generated_by_mercado_pago_123',
  })

  assert.equal(subscription.status, 'authorized')
  assert.equal(subscription.card_token_id, 'card_token_generated_by_mercado_pago_123')
  assert.equal(subscription.external_reference, 'ord_authorized')
  assert.equal(subscription.payer_email, 'buyer@testuser.com')
  assert.equal('card_number' in subscription, false)
  assert.equal('security_code' in subscription, false)
})

test('assinatura válida do Webhook é aceita e adulteração é recusada', () => {
  const dataId = 'PAYMENT-123'
  const requestId = 'request-abc'
  const timestamp = '1721131200'
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${timestamp};`
  const signature = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex')

  const request = {
    headers: {
      'x-request-id': requestId,
      'x-signature': `ts=${timestamp},v1=${signature}`,
    },
  }
  assert.equal(billing.verifyMercadoPagoWebhook(request, dataId), true)

  request.headers['x-signature'] = `ts=${timestamp},v1=${'0'.repeat(64)}`
  assert.equal(billing.verifyMercadoPagoWebhook(request, dataId), false)
})

test('pagamento aprovado ativa somente o usuário vinculado e estorno remove acesso', async () => {
  const user = {
    id: 'google-sub-test',
    email: 'usuario@example.com',
    name: 'Usuário Teste',
    picture: null,
  }
  await store.upsertBillingUser(user)
  await store.createOrder({
    id: 'ord_test',
    userId: user.id,
    plan: 'premium_annual',
    amount: 200,
    currency: 'BRL',
    status: 'pending',
    createdAt: '2026-07-16T12:00:00.000Z',
    updatedAt: '2026-07-16T12:00:00.000Z',
  })

  await store.applyPaymentStatus({
    orderId: 'ord_test',
    providerPaymentId: 'payment-1',
    status: 'approved',
    approvedAt: '2026-07-16T12:00:00.000Z',
  })
  const active = await store.getBillingStatus(user.id)
  assert.equal(active.premiumActive, true)
  assert.equal(active.plan, 'premium_annual')
  assert.equal(active.activeUntil, '2027-07-16T12:00:00.000Z')

  await store.applyPaymentStatus({
    orderId: 'ord_test',
    providerPaymentId: 'payment-1',
    status: 'refunded',
    approvedAt: '2026-07-16T12:00:00.000Z',
  })
  const refunded = await store.getBillingStatus(user.id)
  assert.equal(refunded.premiumActive, false)
  assert.equal(refunded.plan, 'basic')
})

test('confirmação anual antiga não substitui uma compra anual mais recente', async () => {
  const user = { id: 'google-annual-ordering', email: 'ordem@example.com', name: 'Ordem' }
  await store.upsertBillingUser(user)
  for (const [id, createdAt] of [
    ['ord_annual_old', '2026-07-10T12:00:00.000Z'],
    ['ord_annual_new', '2026-07-11T12:00:00.000Z'],
  ]) {
    await store.createOrder({
      id,
      userId: user.id,
      plan: 'premium_annual',
      amount: 200,
      currency: 'BRL',
      status: 'pending',
      createdAt,
      updatedAt: createdAt,
    })
  }

  await store.applyPaymentStatus({
    orderId: 'ord_annual_new',
    providerPaymentId: 'payment-new',
    status: 'approved',
    approvedAt: '2026-07-11T12:00:00.000Z',
  })
  await store.applyPaymentStatus({
    orderId: 'ord_annual_old',
    providerPaymentId: 'payment-old',
    status: 'approved',
    approvedAt: '2026-07-10T12:00:00.000Z',
  })

  const status = await store.getBillingStatus(user.id)
  assert.equal(status.activeUntil, '2027-07-11T12:00:00.000Z')
})

test('mensal aprovado ativa a conta e cancelamento mantém acesso até o fim do período', async () => {
  const user = {
    id: 'google-sub-monthly',
    email: 'mensal@example.com',
    name: 'Usuário Mensal',
    picture: null,
  }
  await store.upsertBillingUser(user)
  await store.createOrder({
    id: 'ord_monthly',
    userId: user.id,
    plan: 'premium_monthly',
    amount: 19.9,
    currency: 'BRL',
    status: 'pending',
    createdAt: '2026-07-17T12:00:00.000Z',
    updatedAt: '2026-07-17T12:00:00.000Z',
  })

  await store.applySubscriptionStatus({
    orderId: 'ord_monthly',
    providerSubscriptionId: 'subscription-1',
    status: 'authorized',
    nextPaymentDate: '2099-08-17T12:00:00.000Z',
  })
  const merelyAuthorized = await store.getBillingStatus(user.id)
  assert.equal(merelyAuthorized.premiumActive, false)

  await store.applySubscriptionStatus({
    orderId: 'ord_monthly',
    providerSubscriptionId: 'subscription-1',
    status: 'authorized',
    nextPaymentDate: '2099-08-17T12:00:00.000Z',
    paymentStatus: 'approved',
    paymentDate: '2099-07-17T12:00:00.000Z',
  })
  const active = await store.getBillingStatus(user.id)
  assert.equal(active.premiumActive, true)
  assert.equal(active.plan, 'premium_monthly')
  assert.equal(active.cancelable, true)

  await store.applySubscriptionStatus({
    orderId: 'ord_monthly',
    providerSubscriptionId: 'subscription-1',
    status: 'cancelled',
    nextPaymentDate: '2099-08-17T12:00:00.000Z',
  })
  const cancelled = await store.getBillingStatus(user.id)
  assert.equal(cancelled.premiumActive, true)
  assert.equal(cancelled.plan, 'premium_monthly')
  assert.equal(cancelled.subscriptionStatus, 'cancelled')
  assert.equal(cancelled.cancelable, false)
})
