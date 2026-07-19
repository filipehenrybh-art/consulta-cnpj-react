import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'
import { verifiedDatabaseUrl } from '../database/connection-url.js'

const { Pool } = pg
const connectionString = String(process.env.DATABASE_URL || '').trim()
const sourcePath = resolve(process.env.LOCAL_BILLING_DB || 'data/dev-billing.json')

if (!connectionString) {
  console.error('DATABASE_URL não foi configurada.')
  process.exitCode = 1
} else {
  const pool = new Pool({
    connectionString: verifiedDatabaseUrl(connectionString),
    max: 1,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })

  try {
    const local = JSON.parse(await readFile(sourcePath, 'utf8'))
    const client = await pool.connect()
    try {
      await client.query('begin')

      for (const user of Object.values(local.users || {})) {
        await client.query(
          `insert into users (
             google_sub, email, name, picture_url, last_login_at, last_seen_at,
             last_logout_at, login_count, created_at, updated_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (google_sub) do update set
             email = excluded.email,
             name = excluded.name,
             picture_url = excluded.picture_url,
             last_login_at = coalesce(excluded.last_login_at, users.last_login_at),
             last_seen_at = coalesce(excluded.last_seen_at, users.last_seen_at),
             last_logout_at = coalesce(excluded.last_logout_at, users.last_logout_at),
             login_count = greatest(users.login_count, excluded.login_count),
             updated_at = greatest(users.updated_at, excluded.updated_at)`,
          [
            user.id,
            user.email,
            user.name || user.email,
            user.picture || null,
            user.lastLoginAt || null,
            user.lastSeenAt || null,
            user.lastLogoutAt || null,
            Number(user.loginCount || 0),
            user.createdAt || new Date(),
            user.updatedAt || new Date(),
          ],
        )
      }

      for (const order of Object.values(local.orders || {})) {
        await client.query(
          `insert into payment_orders (
             public_id, user_id, provider, provider_preference_id, provider_plan_id,
             provider_payment_id, provider_subscription_id, plan_code, amount_cents,
             currency, status, next_payment_at, last_payment_status, approved_at,
             created_at, updated_at
           )
           select $1, u.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
           from users u where u.google_sub = $2
           on conflict (public_id) do update set
             provider_preference_id = excluded.provider_preference_id,
             provider_plan_id = excluded.provider_plan_id,
             provider_payment_id = excluded.provider_payment_id,
             provider_subscription_id = excluded.provider_subscription_id,
             status = excluded.status,
             next_payment_at = excluded.next_payment_at,
             last_payment_status = excluded.last_payment_status,
             approved_at = excluded.approved_at,
             updated_at = greatest(payment_orders.updated_at, excluded.updated_at)`,
          [
            order.id,
            order.userId,
            order.provider || 'mercado_pago',
            order.providerPreferenceId || null,
            order.providerPlanId || null,
            order.providerPaymentId || null,
            order.providerSubscriptionId || null,
            order.plan,
            Math.round(Number(order.amount) * 100),
            order.currency || 'BRL',
            order.status,
            order.nextPaymentDate || null,
            order.lastPaymentStatus || null,
            order.approvedAt || null,
            order.createdAt || new Date(),
            order.updatedAt || new Date(),
          ],
        )
      }

      for (const user of Object.values(local.users || {})) {
        const entitlement = user.entitlement
        if (entitlement) {
          await client.query(
            `insert into entitlements (user_id, plan_code, active, active_until, source_order_id)
             select u.id, $2, $3, $4, po.id
             from users u
             left join payment_orders po on po.public_id = $5
             where u.google_sub = $1
             on conflict (user_id) do update set
               plan_code = excluded.plan_code,
               active = excluded.active,
               active_until = excluded.active_until,
               source_order_id = excluded.source_order_id,
               updated_at = now()`,
            [
              user.id,
              entitlement.plan || 'basic',
              Boolean(entitlement.active),
              entitlement.activeUntil || null,
              entitlement.sourceOrderId || null,
            ],
          )
        }

        const courtesy = user.courtesy
        if (courtesy?.grantedByUserId && courtesy?.grantedByEmail) {
          await client.query(
            `insert into users (google_sub, email, name, last_seen_at)
             values ($1, $2, $2, now())
             on conflict (google_sub) do nothing`,
            [courtesy.grantedByUserId, courtesy.grantedByEmail],
          )
          await client.query(
            `insert into courtesy_grants (
               user_id, granted_by_user_id, active, active_until, note, granted_at,
               revoked_at, revoked_by_user_id
             )
             select recipient.id, administrator.id, $3, $4, $5, $6, $7, revoked_by.id
             from users recipient
             join users administrator on administrator.google_sub = $2
             left join users revoked_by on revoked_by.google_sub = $8
             where recipient.google_sub = $1
               and not exists (
                 select 1 from courtesy_grants existing
                 where existing.user_id = recipient.id
                   and existing.granted_at = $6
               )`,
            [
              user.id,
              courtesy.grantedByUserId,
              Boolean(courtesy.active),
              courtesy.activeUntil || null,
              courtesy.note || null,
              courtesy.grantedAt || new Date(),
              courtesy.revokedAt || null,
              courtesy.revokedByUserId || null,
            ],
          )
        }
      }

      for (const [storedEventId, event] of Object.entries(local.webhookEvents || {})) {
        const eventId = event.id || event.providerEventId || storedEventId
        if (!eventId) continue
        await client.query(
          `insert into webhook_events (provider, provider_event_id, payload, processed_at)
           values ($1, $2, $3::jsonb, $4)
           on conflict (provider, provider_event_id) do nothing`,
          [event.provider || 'mercado_pago', String(eventId), JSON.stringify(event), event.processedAt || new Date()],
        )
      }

      await client.query('commit')
      console.log(`Dados locais importados com sucesso de ${sourcePath}.`)
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Falha ao importar os dados locais:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
