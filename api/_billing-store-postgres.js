import pg from 'pg'
import { verifiedDatabaseUrl } from '../database/connection-url.js'

const { Pool } = pg

let pool

function databaseUrl() {
  return verifiedDatabaseUrl()
}

function getPool() {
  if (pool) return pool

  pool = new Pool({
    connectionString: databaseUrl(),
    max: Math.max(1, Math.min(Number(process.env.DATABASE_POOL_MAX) || 2, 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })
  pool.on('error', (error) => console.error('Conexão PostgreSQL ociosa falhou:', error.message))
  return pool
}

function iso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function amountInCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error('ORDER_AMOUNT_INVALID')
  return Math.round(amount * 100)
}

async function withTransaction(callback) {
  const client = await getPool().connect()
  try {
    await client.query('begin')
    const result = await callback(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

const ORDER_SELECT = `
  select
    po.*,
    u.google_sub as user_google_sub,
    u.email as user_email
  from payment_orders po
  join users u on u.id = po.user_id
`

function orderFromRow(row) {
  if (!row) return null
  return {
    id: row.public_id,
    userId: row.user_google_sub,
    userEmail: row.user_email,
    plan: row.plan_code,
    amount: Number(row.amount_cents) / 100,
    currency: row.currency,
    status: row.status,
    provider: row.provider,
    providerPreferenceId: row.provider_preference_id || null,
    providerPlanId: row.provider_plan_id || null,
    providerPaymentId: row.provider_payment_id || null,
    providerSubscriptionId: row.provider_subscription_id || null,
    nextPaymentDate: iso(row.next_payment_at),
    lastPaymentStatus: row.last_payment_status || null,
    approvedAt: iso(row.approved_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

async function orderRow(executor, publicId, lock = false) {
  const result = await executor.query(
    `${ORDER_SELECT} where po.public_id = $1${lock ? ' for update of po' : ''}`,
    [publicId],
  )
  return result.rows[0] || null
}

const USER_SELECT = `
  select
    u.*,
    e.plan_code as entitlement_plan,
    e.active as entitlement_active,
    e.active_until as entitlement_active_until,
    e.source_order_id as entitlement_source_order_id,
    source_order.public_id as entitlement_source_order_public_id,
    source_order.plan_code as source_order_plan,
    source_order.status as source_order_status,
    courtesy.id as courtesy_id,
    courtesy.active as courtesy_active,
    courtesy.active_until as courtesy_active_until,
    courtesy.note as courtesy_note,
    courtesy.granted_at as courtesy_granted_at,
    courtesy.revoked_at as courtesy_revoked_at,
    granted_by.google_sub as courtesy_granted_by_user_id,
    granted_by.email as courtesy_granted_by_email,
    revoked_by.google_sub as courtesy_revoked_by_user_id,
    revoked_by.email as courtesy_revoked_by_email
  from users u
  left join entitlements e on e.user_id = u.id
  left join payment_orders source_order on source_order.id = e.source_order_id
  left join lateral (
    select cg.*
    from courtesy_grants cg
    where cg.user_id = u.id
    order by cg.granted_at desc
    limit 1
  ) courtesy on true
  left join users granted_by on granted_by.id = courtesy.granted_by_user_id
  left join users revoked_by on revoked_by.id = courtesy.revoked_by_user_id
`

function courtesyFromRow(row) {
  if (!row?.courtesy_id) return null
  return {
    active: Boolean(row.courtesy_active),
    activeUntil: iso(row.courtesy_active_until),
    grantedAt: iso(row.courtesy_granted_at),
    grantedByUserId: row.courtesy_granted_by_user_id || null,
    grantedByEmail: row.courtesy_granted_by_email || null,
    note: row.courtesy_note || null,
    revokedAt: iso(row.courtesy_revoked_at),
    revokedByUserId: row.courtesy_revoked_by_user_id || null,
    revokedByEmail: row.courtesy_revoked_by_email || null,
  }
}

function courtesyIsActive(courtesy) {
  if (!courtesy?.active) return false
  if (!courtesy.activeUntil) return true
  const activeUntil = new Date(courtesy.activeUntil)
  return !Number.isNaN(activeUntil.getTime()) && activeUntil.getTime() > Date.now()
}

function billingStatusFromRow(row) {
  const courtesy = courtesyFromRow(row)
  if (courtesyIsActive(courtesy)) {
    return {
      plan: 'premium_courtesy',
      premiumActive: true,
      activeUntil: courtesy.activeUntil,
      subscriptionStatus: null,
      cancelable: false,
      courtesy: true,
    }
  }

  const activeUntil = row?.entitlement_active_until ? new Date(row.entitlement_active_until) : null
  const active = Boolean(
    row?.entitlement_active
    && activeUntil
    && !Number.isNaN(activeUntil.getTime())
    && activeUntil.getTime() > Date.now(),
  )

  return {
    plan: active ? row.entitlement_plan : 'basic',
    premiumActive: active,
    activeUntil: active ? activeUntil.toISOString() : null,
    subscriptionStatus: row?.source_order_plan === 'premium_monthly' ? row.source_order_status : null,
    cancelable: Boolean(
      active
      && row?.source_order_plan === 'premium_monthly'
      && ['authorized', 'active'].includes(row.source_order_status),
    ),
    courtesy: false,
  }
}

function storedUserFromRow(row) {
  if (!row) return null
  return {
    id: row.google_sub,
    email: row.email,
    name: row.name,
    picture: row.picture_url || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastLoginAt: iso(row.last_login_at),
    lastSeenAt: iso(row.last_seen_at),
    lastLogoutAt: iso(row.last_logout_at),
    loginCount: Number(row.login_count || 0),
    entitlement: {
      plan: row.entitlement_plan || 'basic',
      active: Boolean(row.entitlement_active),
      activeUntil: iso(row.entitlement_active_until),
      sourceOrderId: row.entitlement_source_order_public_id || null,
    },
    courtesy: courtesyFromRow(row),
  }
}

async function userRow(executor, googleSub) {
  const result = await executor.query(`${USER_SELECT} where u.google_sub = $1`, [googleSub])
  return result.rows[0] || null
}

export async function upsertBillingUser(user) {
  await getPool().query(
    `insert into users (google_sub, email, name, picture_url, last_seen_at)
     values ($1, $2, $3, $4, now())
     on conflict (google_sub) do update set
       email = excluded.email,
       name = excluded.name,
       picture_url = excluded.picture_url,
       last_seen_at = now(),
       updated_at = now()`,
    [user.id, user.email, user.name, user.picture || null],
  )
  return storedUserFromRow(await userRow(getPool(), user.id))
}

export async function recordUserLogin(user) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `insert into users (
         google_sub, email, name, picture_url, last_login_at, last_seen_at, login_count
       ) values ($1, $2, $3, $4, now(), now(), 1)
       on conflict (google_sub) do update set
         email = excluded.email,
         name = excluded.name,
         picture_url = excluded.picture_url,
         last_login_at = now(),
         last_seen_at = now(),
         login_count = users.login_count + 1,
         updated_at = now()
       returning id`,
      [user.id, user.email, user.name, user.picture || null],
    )
    await client.query('insert into login_events (user_id) values ($1)', [result.rows[0].id])
    await client.query(`
      delete from login_events
      where id in (
        select id from login_events order by logged_in_at desc offset 5000
      )
    `)
    return storedUserFromRow(await userRow(client, user.id))
  })
}

export async function markUserLoggedOut(userId) {
  const result = await getPool().query(
    `update users
     set last_logout_at = now(), updated_at = now()
     where google_sub = $1
     returning google_sub`,
    [userId],
  )
  if (!result.rowCount) return null
  return storedUserFromRow(await userRow(getPool(), userId))
}

export async function createOrder(order) {
  try {
    const result = await getPool().query(
      `insert into payment_orders (
         public_id, user_id, provider, provider_preference_id, provider_plan_id,
         provider_payment_id, provider_subscription_id, plan_code, amount_cents,
         currency, status, next_payment_at, last_payment_status, approved_at,
         created_at, updated_at
       )
       select $1, u.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
       from users u where u.google_sub = $2
       returning public_id`,
      [
        order.id,
        order.userId,
        order.provider || 'mercado_pago',
        order.providerPreferenceId || null,
        order.providerPlanId || null,
        order.providerPaymentId || null,
        order.providerSubscriptionId || null,
        order.plan,
        amountInCents(order.amount),
        order.currency || 'BRL',
        order.status,
        order.nextPaymentDate || null,
        order.lastPaymentStatus || null,
        order.approvedAt || null,
        order.createdAt || new Date(),
        order.updatedAt || new Date(),
      ],
    )
    if (!result.rowCount) throw new Error('USER_NOT_FOUND')
    return orderFromRow(await orderRow(getPool(), order.id))
  } catch (error) {
    if (error.code === '23505') throw new Error('ORDER_ALREADY_EXISTS')
    throw error
  }
}

export async function updateOrder(orderId, changes) {
  const columns = {
    status: ['status', (value) => value],
    providerPreferenceId: ['provider_preference_id', (value) => value || null],
    providerPlanId: ['provider_plan_id', (value) => value || null],
    providerPaymentId: ['provider_payment_id', (value) => value || null],
    providerSubscriptionId: ['provider_subscription_id', (value) => value || null],
    nextPaymentDate: ['next_payment_at', (value) => value || null],
    lastPaymentStatus: ['last_payment_status', (value) => value || null],
    approvedAt: ['approved_at', (value) => value || null],
  }
  const values = [orderId]
  const assignments = []
  for (const [key, value] of Object.entries(changes || {})) {
    if (!columns[key]) continue
    const [column, normalize] = columns[key]
    values.push(normalize(value))
    assignments.push(`${column} = $${values.length}`)
  }
  assignments.push('updated_at = now()')
  const result = await getPool().query(
    `update payment_orders set ${assignments.join(', ')} where public_id = $1 returning public_id`,
    values,
  )
  if (!result.rowCount) throw new Error('ORDER_NOT_FOUND')
  return orderFromRow(await orderRow(getPool(), orderId))
}

export async function getOrder(orderId) {
  return orderFromRow(await orderRow(getPool(), orderId))
}

export async function listPendingAnnualOrdersForUser(userId, limit = 5) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 5, 10))
  const result = await getPool().query(
    `${ORDER_SELECT}
     where u.google_sub = $1
       and po.plan_code = 'premium_annual'
       and po.status = any($2::text[])
     order by po.created_at desc
     limit $3`,
    [userId, ['creating', 'pending', 'in_process'], safeLimit],
  )
  return result.rows.map(orderFromRow)
}

export async function findOrderByProviderSubscriptionId(providerSubscriptionId) {
  const result = await getPool().query(
    `${ORDER_SELECT} where po.provider_subscription_id = $1 order by po.updated_at desc limit 1`,
    [String(providerSubscriptionId)],
  )
  return orderFromRow(result.rows[0])
}

export async function findOrderByProviderPlanId(providerPlanId) {
  const result = await getPool().query(
    `${ORDER_SELECT} where po.provider_plan_id = $1 order by po.updated_at desc limit 1`,
    [String(providerPlanId)],
  )
  return orderFromRow(result.rows[0])
}

export async function findCancelableSubscriptionByUser(userId) {
  const result = await getPool().query(
    `${ORDER_SELECT}
     where u.google_sub = $1
       and po.plan_code = 'premium_monthly'
       and po.provider_subscription_id is not null
       and po.status = any($2::text[])
     order by po.updated_at desc
     limit 1`,
    [userId, ['authorized', 'active']],
  )
  return orderFromRow(result.rows[0])
}

export async function getBillingStatus(userId) {
  const row = await userRow(getPool(), userId)
  return billingStatusFromRow(row)
}

export async function listBillingUsers(emailQuery = '') {
  const normalizedQuery = String(emailQuery || '').trim().toLowerCase()
  const result = await getPool().query(
    `${USER_SELECT}
     where ($1 = '' or lower(u.email) like $2)
     order by coalesce(u.last_seen_at, u.last_login_at, u.created_at) desc
     limit 200`,
    [normalizedQuery, `%${normalizedQuery}%`],
  )
  return result.rows.map((row) => {
    const user = storedUserFromRow(row)
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastSeenAt: user.lastSeenAt,
      lastLogoutAt: user.lastLogoutAt,
      loginCount: user.loginCount,
      billing: billingStatusFromRow(row),
      courtesy: user.courtesy,
    }
  })
}

export async function grantCourtesy({ userId, admin, activeUntil, note }) {
  const normalizedActiveUntil = activeUntil ? new Date(activeUntil) : null
  if (normalizedActiveUntil && (
    Number.isNaN(normalizedActiveUntil.getTime())
    || normalizedActiveUntil.getTime() <= Date.now()
  )) throw new Error('COURTESY_DATE_INVALID')

  await withTransaction(async (client) => {
    const people = await client.query(
      `select id, google_sub from users where google_sub = any($1::text[])`,
      [[userId, admin.id]],
    )
    const recipient = people.rows.find((row) => row.google_sub === userId)
    const administrator = people.rows.find((row) => row.google_sub === admin.id)
    if (!recipient) throw new Error('USER_NOT_FOUND')
    if (!administrator) throw new Error('ADMIN_NOT_FOUND')

    await client.query(
      `update courtesy_grants
       set active = false, revoked_at = now(), revoked_by_user_id = $2
       where user_id = $1 and active = true`,
      [recipient.id, administrator.id],
    )
    await client.query(
      `insert into courtesy_grants (
         user_id, granted_by_user_id, active, active_until, note
       ) values ($1, $2, true, $3, $4)`,
      [
        recipient.id,
        administrator.id,
        normalizedActiveUntil,
        String(note || '').trim().slice(0, 200) || null,
      ],
    )
    await client.query('update users set updated_at = now() where id = $1', [recipient.id])
  })

  const row = await userRow(getPool(), userId)
  const user = storedUserFromRow(row)
  return { ...user, billing: billingStatusFromRow(row) }
}

export async function revokeCourtesy({ userId, admin }) {
  await withTransaction(async (client) => {
    const people = await client.query(
      `select id, google_sub from users where google_sub = any($1::text[])`,
      [[userId, admin.id]],
    )
    const recipient = people.rows.find((row) => row.google_sub === userId)
    const administrator = people.rows.find((row) => row.google_sub === admin.id)
    if (!recipient) throw new Error('USER_NOT_FOUND')
    if (!administrator) throw new Error('ADMIN_NOT_FOUND')

    await client.query(
      `with latest as (
         select id from courtesy_grants
         where user_id = $1 and active = true
         order by granted_at desc
         limit 1
       )
       update courtesy_grants
       set active = false, revoked_at = now(), revoked_by_user_id = $2
       where id in (select id from latest)`,
      [recipient.id, administrator.id],
    )
    await client.query('update users set updated_at = now() where id = $1', [recipient.id])
  })

  const row = await userRow(getPool(), userId)
  const user = storedUserFromRow(row)
  return { ...user, billing: billingStatusFromRow(row) }
}

function monthlyActiveUntil(nextPaymentDate, fallbackDate) {
  const providerDate = nextPaymentDate ? new Date(nextPaymentDate) : null
  if (providerDate && !Number.isNaN(providerDate.getTime()) && providerDate.getTime() > Date.now()) {
    return providerDate.toISOString()
  }

  const base = fallbackDate ? new Date(fallbackDate) : new Date()
  if (Number.isNaN(base.getTime())) throw new Error('SUBSCRIPTION_DATE_INVALID')
  base.setUTCMonth(base.getUTCMonth() + 1)
  return base.toISOString()
}

export async function applySubscriptionStatus({
  orderId,
  providerSubscriptionId,
  status,
  nextPaymentDate,
  paymentStatus,
  paymentDate,
}) {
  await withTransaction(async (client) => {
    const order = await orderRow(client, orderId, true)
    if (!order || order.plan_code !== 'premium_monthly') throw new Error('ORDER_NOT_FOUND')

    await client.query(
      `update payment_orders set
         provider_subscription_id = $2,
         status = $3,
         next_payment_at = coalesce($4, next_payment_at),
         last_payment_status = coalesce($5, last_payment_status),
         updated_at = now()
       where public_id = $1`,
      [orderId, String(providerSubscriptionId), status, nextPaymentDate || null, paymentStatus || null],
    )

    if (paymentStatus === 'approved') {
      await client.query(
        `insert into entitlements (user_id, plan_code, active, active_until, source_order_id)
         values ($1, 'premium_monthly', true, $2, $3)
         on conflict (user_id) do update set
           plan_code = excluded.plan_code,
           active = true,
           active_until = excluded.active_until,
           source_order_id = excluded.source_order_id,
           updated_at = now()`,
        [order.user_id, monthlyActiveUntil(nextPaymentDate, paymentDate), order.id],
      )
    }
    await client.query('update users set updated_at = now() where id = $1', [order.user_id])
  })

  const order = await getOrder(orderId)
  const user = await userRow(getPool(), order.userId)
  return { order, entitlement: storedUserFromRow(user).entitlement }
}

export async function applyPaymentStatus({ orderId, providerPaymentId, status, approvedAt }) {
  await withTransaction(async (client) => {
    const order = await orderRow(client, orderId, true)
    if (!order) throw new Error('ORDER_NOT_FOUND')

    const approvalDate = status === 'approved' ? new Date(approvedAt || Date.now()) : null
    if (approvalDate && Number.isNaN(approvalDate.getTime())) throw new Error('PAYMENT_DATE_INVALID')
    await client.query(
      `update payment_orders set
         provider_payment_id = $2,
         status = $3,
         approved_at = case when $3 = 'approved' then $4 else approved_at end,
         updated_at = now()
       where public_id = $1`,
      [orderId, String(providerPaymentId), status, approvalDate],
    )

    if (status === 'approved') {
      const currentResult = await client.query(
        `select
           e.plan_code,
           e.active,
           source.approved_at as source_approved_at,
           source.created_at as source_created_at
         from entitlements e
         left join payment_orders source on source.id = e.source_order_id
         where e.user_id = $1
         for update of e`,
        [order.user_id],
      )
      const current = currentResult.rows[0]
      const currentApproval = current?.source_approved_at || current?.source_created_at
      const currentApprovalTime = currentApproval ? new Date(currentApproval).getTime() : 0
      const shouldUsePayment = (
        current?.plan_code !== 'premium_annual'
        || !current?.active
        || Number.isNaN(currentApprovalTime)
        || approvalDate.getTime() >= currentApprovalTime
      )
      if (shouldUsePayment) {
        const activeUntil = new Date(approvalDate)
        activeUntil.setUTCFullYear(activeUntil.getUTCFullYear() + 1)
        await client.query(
          `insert into entitlements (user_id, plan_code, active, active_until, source_order_id)
           values ($1, 'premium_annual', true, $2, $3)
           on conflict (user_id) do update set
             plan_code = excluded.plan_code,
             active = true,
             active_until = excluded.active_until,
             source_order_id = excluded.source_order_id,
             updated_at = now()`,
          [order.user_id, activeUntil, order.id],
        )
      }
    } else if (['cancelled', 'charged_back', 'refunded'].includes(status)) {
      await client.query(
        `update entitlements set
           plan_code = 'basic', active = false, active_until = null, updated_at = now()
         where user_id = $1 and source_order_id = $2`,
        [order.user_id, order.id],
      )
    }
    await client.query('update users set updated_at = now() where id = $1', [order.user_id])
  })

  const order = await getOrder(orderId)
  const user = await userRow(getPool(), order.userId)
  return { order, entitlement: storedUserFromRow(user).entitlement }
}

export async function hasWebhookEvent(eventId) {
  const result = await getPool().query(
    `select 1 from webhook_events
     where provider = 'mercado_pago' and provider_event_id = $1
     limit 1`,
    [String(eventId)],
  )
  return Boolean(result.rowCount)
}

export async function recordWebhookEvent(eventId, data) {
  await getPool().query(
    `insert into webhook_events (provider, provider_event_id, payload)
     values ($1, $2, $3::jsonb)
     on conflict (provider, provider_event_id) do nothing`,
    [data?.provider || 'mercado_pago', String(eventId), JSON.stringify(data || {})],
  )
}
