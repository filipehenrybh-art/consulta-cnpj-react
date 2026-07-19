import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as postgresStore from './_billing-store-postgres.js'

const databasePath = resolve(process.env.LOCAL_BILLING_DB || 'data/dev-billing.json')
let writeQueue = Promise.resolve()

function emptyDatabase() {
  return {
    users: {},
    orders: {},
    webhookEvents: {},
    courtesyEvents: [],
    loginEvents: [],
  }
}

function postgresStorageIsEnabled() {
  const mode = String(process.env.BILLING_STORAGE_MODE || '').trim().toLowerCase()
  return mode === 'postgres' || (mode !== 'local' && Boolean(process.env.DATABASE_URL))
}

function storageIsEnabled() {
  return !postgresStorageIsEnabled()
    && (process.env.BILLING_STORAGE_MODE === 'local' || process.env.NODE_ENV !== 'production')
}

async function readDatabase() {
  if (!storageIsEnabled()) throw new Error('BILLING_DATABASE_NOT_CONFIGURED')

  try {
    const parsed = JSON.parse(await readFile(databasePath, 'utf8'))
    return {
      users: parsed.users || {},
      orders: parsed.orders || {},
      webhookEvents: parsed.webhookEvents || {},
      courtesyEvents: Array.isArray(parsed.courtesyEvents) ? parsed.courtesyEvents : [],
      loginEvents: Array.isArray(parsed.loginEvents) ? parsed.loginEvents : [],
    }
  } catch (error) {
    if (error.code === 'ENOENT') return emptyDatabase()
    throw error
  }
}

async function writeDatabase(database) {
  await mkdir(dirname(databasePath), { recursive: true })
  await writeFile(databasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8')
}

function updateDatabase(updater) {
  const operation = writeQueue.then(async () => {
    const database = await readDatabase()
    const result = await updater(database)
    await writeDatabase(database)
    return result
  })

  writeQueue = operation.catch(() => {})
  return operation
}

export async function upsertBillingUser(user) {
  if (postgresStorageIsEnabled()) return postgresStore.upsertBillingUser(user)
  if (!storageIsEnabled()) return null

  return updateDatabase((database) => {
    const now = new Date().toISOString()
    const current = database.users[user.id] || {}
    const stored = {
      ...current,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      createdAt: current.createdAt || now,
      updatedAt: now,
      lastSeenAt: now,
      lastLoginAt: current.lastLoginAt || null,
      lastLogoutAt: current.lastLogoutAt || null,
      loginCount: Number(current.loginCount || 0),
      entitlement: current.entitlement || {
        plan: 'basic',
        active: false,
        activeUntil: null,
        sourceOrderId: null,
      },
    }
    database.users[user.id] = stored
    return stored
  })
}

export async function recordUserLogin(user) {
  if (postgresStorageIsEnabled()) return postgresStore.recordUserLogin(user)
  if (!storageIsEnabled()) return null

  return updateDatabase((database) => {
    const now = new Date().toISOString()
    const current = database.users[user.id] || {}
    const stored = {
      ...current,
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      createdAt: current.createdAt || now,
      updatedAt: now,
      lastLoginAt: now,
      lastSeenAt: now,
      lastLogoutAt: current.lastLogoutAt || null,
      loginCount: Number(current.loginCount || 0) + 1,
      entitlement: current.entitlement || {
        plan: 'basic',
        active: false,
        activeUntil: null,
        sourceOrderId: null,
      },
    }
    database.users[user.id] = stored
    database.loginEvents.push({
      id: randomUUID(),
      userId: user.id,
      email: user.email,
      loggedInAt: now,
    })
    if (database.loginEvents.length > 5000) database.loginEvents.splice(0, database.loginEvents.length - 5000)
    return stored
  })
}

export async function markUserLoggedOut(userId) {
  if (postgresStorageIsEnabled()) return postgresStore.markUserLoggedOut(userId)
  if (!storageIsEnabled()) return null

  return updateDatabase((database) => {
    const user = database.users[userId]
    if (!user) return null
    const now = new Date().toISOString()
    user.lastLogoutAt = now
    user.updatedAt = now
    return user
  })
}

export async function createOrder(order) {
  if (postgresStorageIsEnabled()) return postgresStore.createOrder(order)
  return updateDatabase((database) => {
    if (database.orders[order.id]) throw new Error('ORDER_ALREADY_EXISTS')
    database.orders[order.id] = order
    return order
  })
}

export async function updateOrder(orderId, changes) {
  if (postgresStorageIsEnabled()) return postgresStore.updateOrder(orderId, changes)
  return updateDatabase((database) => {
    const current = database.orders[orderId]
    if (!current) throw new Error('ORDER_NOT_FOUND')
    const updated = { ...current, ...changes, updatedAt: new Date().toISOString() }
    database.orders[orderId] = updated
    return updated
  })
}

export async function getOrder(orderId) {
  if (postgresStorageIsEnabled()) return postgresStore.getOrder(orderId)
  const database = await readDatabase()
  return database.orders[orderId] || null
}

export async function listPendingAnnualOrdersForUser(userId, limit = 5) {
  if (postgresStorageIsEnabled()) return postgresStore.listPendingAnnualOrdersForUser(userId, limit)
  const database = await readDatabase()
  return Object.values(database.orders)
    .filter((order) => (
      order.userId === userId
      && order.plan === 'premium_annual'
      && ['creating', 'pending', 'in_process'].includes(order.status)
    ))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, Math.max(1, Math.min(Number(limit) || 5, 10)))
}

export async function findOrderByProviderSubscriptionId(providerSubscriptionId) {
  if (postgresStorageIsEnabled()) return postgresStore.findOrderByProviderSubscriptionId(providerSubscriptionId)
  const database = await readDatabase()
  return Object.values(database.orders).find(
    (order) => String(order.providerSubscriptionId || '') === String(providerSubscriptionId),
  ) || null
}

export async function findOrderByProviderPlanId(providerPlanId) {
  if (postgresStorageIsEnabled()) return postgresStore.findOrderByProviderPlanId(providerPlanId)
  const database = await readDatabase()
  return Object.values(database.orders).find(
    (order) => String(order.providerPlanId || '') === String(providerPlanId),
  ) || null
}

export async function findCancelableSubscriptionByUser(userId) {
  if (postgresStorageIsEnabled()) return postgresStore.findCancelableSubscriptionByUser(userId)
  const database = await readDatabase()
  return Object.values(database.orders)
    .filter((order) => order.userId === userId && order.plan === 'premium_monthly' && order.providerSubscriptionId)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .find((order) => ['authorized', 'active'].includes(order.status)) || null
}

function courtesyIsActive(courtesy) {
  if (!courtesy?.active) return false
  if (!courtesy.activeUntil) return true
  const activeUntil = new Date(courtesy.activeUntil)
  return !Number.isNaN(activeUntil.getTime()) && activeUntil.getTime() > Date.now()
}

function billingStatusForUser(database, user) {
  const courtesy = user?.courtesy || null
  if (courtesyIsActive(courtesy)) {
    return {
      plan: 'premium_courtesy',
      premiumActive: true,
      activeUntil: courtesy.activeUntil || null,
      subscriptionStatus: null,
      cancelable: false,
      courtesy: true,
    }
  }

  const entitlement = user?.entitlement || {
    plan: 'basic',
    active: false,
    activeUntil: null,
    sourceOrderId: null,
  }
  const activeUntil = entitlement.activeUntil ? new Date(entitlement.activeUntil) : null
  const active = Boolean(entitlement.active && activeUntil && activeUntil.getTime() > Date.now())
  const sourceOrder = entitlement.sourceOrderId ? database.orders[entitlement.sourceOrderId] : null

  return {
    plan: active ? entitlement.plan : 'basic',
    premiumActive: active,
    activeUntil: active ? entitlement.activeUntil : null,
    subscriptionStatus: sourceOrder?.plan === 'premium_monthly' ? sourceOrder.status : null,
    cancelable: Boolean(active && sourceOrder?.plan === 'premium_monthly' && ['authorized', 'active'].includes(sourceOrder.status)),
    courtesy: false,
  }
}

export async function getBillingStatus(userId) {
  if (postgresStorageIsEnabled()) return postgresStore.getBillingStatus(userId)
  const database = await readDatabase()
  const user = database.users[userId]
  return billingStatusForUser(database, user)
}

export async function listBillingUsers(emailQuery = '') {
  if (postgresStorageIsEnabled()) return postgresStore.listBillingUsers(emailQuery)
  const database = await readDatabase()
  const normalizedQuery = String(emailQuery || '').trim().toLowerCase()

  return Object.values(database.users)
    .filter((user) => !normalizedQuery || String(user.email || '').toLowerCase().includes(normalizedQuery))
    .sort((left, right) => String(right.lastSeenAt || right.lastLoginAt || '').localeCompare(String(left.lastSeenAt || left.lastLoginAt || '')))
    .slice(0, 200)
    .map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      createdAt: user.createdAt || null,
      lastLoginAt: user.lastLoginAt || null,
      lastSeenAt: user.lastSeenAt || null,
      lastLogoutAt: user.lastLogoutAt || null,
      loginCount: Number(user.loginCount || 0),
      billing: billingStatusForUser(database, user),
      courtesy: user.courtesy || null,
    }))
}

export async function grantCourtesy({ userId, admin, activeUntil, note }) {
  if (postgresStorageIsEnabled()) return postgresStore.grantCourtesy({ userId, admin, activeUntil, note })
  const normalizedActiveUntil = activeUntil ? new Date(activeUntil) : null
  if (normalizedActiveUntil && (
    Number.isNaN(normalizedActiveUntil.getTime())
    || normalizedActiveUntil.getTime() <= Date.now()
  )) throw new Error('COURTESY_DATE_INVALID')

  return updateDatabase((database) => {
    const user = database.users[userId]
    if (!user) throw new Error('USER_NOT_FOUND')
    const now = new Date().toISOString()
    user.courtesy = {
      active: true,
      activeUntil: normalizedActiveUntil?.toISOString() || null,
      grantedAt: now,
      grantedByUserId: admin.id,
      grantedByEmail: admin.email,
      note: String(note || '').trim().slice(0, 200) || null,
      revokedAt: null,
    }
    user.updatedAt = now
    database.courtesyEvents.push({
      id: randomUUID(),
      action: 'granted',
      userId,
      administratorId: admin.id,
      administratorEmail: admin.email,
      activeUntil: user.courtesy.activeUntil,
      note: user.courtesy.note,
      createdAt: now,
    })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      createdAt: user.createdAt || null,
      lastLoginAt: user.lastLoginAt || null,
      lastSeenAt: user.lastSeenAt || null,
      lastLogoutAt: user.lastLogoutAt || null,
      loginCount: Number(user.loginCount || 0),
      billing: billingStatusForUser(database, user),
      courtesy: user.courtesy,
    }
  })
}

export async function revokeCourtesy({ userId, admin }) {
  if (postgresStorageIsEnabled()) return postgresStore.revokeCourtesy({ userId, admin })
  return updateDatabase((database) => {
    const user = database.users[userId]
    if (!user) throw new Error('USER_NOT_FOUND')
    const now = new Date().toISOString()
    user.courtesy = {
      ...(user.courtesy || {}),
      active: false,
      revokedAt: now,
      revokedByUserId: admin.id,
      revokedByEmail: admin.email,
    }
    user.updatedAt = now
    database.courtesyEvents.push({
      id: randomUUID(),
      action: 'revoked',
      userId,
      administratorId: admin.id,
      administratorEmail: admin.email,
      createdAt: now,
    })
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture || null,
      createdAt: user.createdAt || null,
      lastLoginAt: user.lastLoginAt || null,
      lastSeenAt: user.lastSeenAt || null,
      lastLogoutAt: user.lastLogoutAt || null,
      loginCount: Number(user.loginCount || 0),
      billing: billingStatusForUser(database, user),
      courtesy: user.courtesy,
    }
  })
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
  if (postgresStorageIsEnabled()) {
    return postgresStore.applySubscriptionStatus({
      orderId,
      providerSubscriptionId,
      status,
      nextPaymentDate,
      paymentStatus,
      paymentDate,
    })
  }
  return updateDatabase((database) => {
    const order = database.orders[orderId]
    if (!order || order.plan !== 'premium_monthly') throw new Error('ORDER_NOT_FOUND')
    const user = database.users[order.userId]
    if (!user) throw new Error('USER_NOT_FOUND')

    order.providerSubscriptionId = String(providerSubscriptionId)
    order.status = status
    order.nextPaymentDate = nextPaymentDate || order.nextPaymentDate || null
    order.lastPaymentStatus = paymentStatus || order.lastPaymentStatus || null
    order.updatedAt = new Date().toISOString()

    // Autorizar a recorrência, sozinho, não comprova a primeira cobrança.
    // O acesso nasce ou é renovado somente com um pagamento aprovado.
    const shouldActivate = paymentStatus === 'approved'
    if (shouldActivate) {
      user.entitlement = {
        plan: 'premium_monthly',
        active: true,
        activeUntil: monthlyActiveUntil(nextPaymentDate, paymentDate),
        sourceOrderId: order.id,
      }
    }

    user.updatedAt = new Date().toISOString()
    return { order, entitlement: user.entitlement }
  })
}

export async function applyPaymentStatus({ orderId, providerPaymentId, status, approvedAt }) {
  if (postgresStorageIsEnabled()) {
    return postgresStore.applyPaymentStatus({ orderId, providerPaymentId, status, approvedAt })
  }
  return updateDatabase((database) => {
    const order = database.orders[orderId]
    if (!order) throw new Error('ORDER_NOT_FOUND')

    order.providerPaymentId = String(providerPaymentId)
    order.status = status
    order.updatedAt = new Date().toISOString()

    const user = database.users[order.userId]
    if (!user) throw new Error('USER_NOT_FOUND')

    if (status === 'approved') {
      const start = approvedAt ? new Date(approvedAt) : new Date()
      if (Number.isNaN(start.getTime())) throw new Error('PAYMENT_DATE_INVALID')
      order.approvedAt = start.toISOString()
      const activeUntil = new Date(start)
      activeUntil.setUTCFullYear(activeUntil.getUTCFullYear() + 1)

      const currentSourceOrder = user.entitlement?.sourceOrderId
        ? database.orders[user.entitlement.sourceOrderId]
        : null
      const currentApproval = currentSourceOrder?.approvedAt || currentSourceOrder?.createdAt
      const currentApprovalTime = currentApproval ? new Date(currentApproval).getTime() : 0
      const shouldUsePayment = (
        user.entitlement?.plan !== 'premium_annual'
        || !user.entitlement?.active
        || Number.isNaN(currentApprovalTime)
        || start.getTime() >= currentApprovalTime
      )

      if (shouldUsePayment) {
        user.entitlement = {
          plan: 'premium_annual',
          active: true,
          activeUntil: activeUntil.toISOString(),
          sourceOrderId: order.id,
        }
      }
    } else if (
      ['cancelled', 'charged_back', 'refunded'].includes(status)
      && user.entitlement?.sourceOrderId === order.id
    ) {
      user.entitlement = {
        plan: 'basic',
        active: false,
        activeUntil: null,
        sourceOrderId: order.id,
      }
    }

    user.updatedAt = new Date().toISOString()
    return { order, entitlement: user.entitlement }
  })
}

export async function hasWebhookEvent(eventId) {
  if (postgresStorageIsEnabled()) return postgresStore.hasWebhookEvent(eventId)
  const database = await readDatabase()
  return Boolean(database.webhookEvents[eventId])
}

export async function recordWebhookEvent(eventId, data) {
  if (postgresStorageIsEnabled()) return postgresStore.recordWebhookEvent(eventId, data)
  return updateDatabase((database) => {
    database.webhookEvents[eventId] = {
      ...data,
      processedAt: new Date().toISOString(),
    }
  })
}
