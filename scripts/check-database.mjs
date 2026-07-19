import pg from 'pg'
import { verifiedDatabaseUrl } from '../database/connection-url.js'

const { Pool } = pg
const connectionString = String(process.env.DATABASE_URL || '').trim()

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
    const result = await pool.query(`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from login_events) as login_events,
        (select count(*)::int from login_events where logged_in_at > now() - interval '15 minutes') as recent_logins,
        (select count(*)::int from payment_orders) as orders,
        (select count(*)::int from entitlements where active and active_until > now()) as active_entitlements,
        (select count(*)::int from courtesy_grants where active and (active_until is null or active_until > now())) as active_courtesies,
        (select count(*)::int from webhook_events) as webhook_events,
        (
          select count(*)::int
          from payment_orders po
          left join users u on u.id = po.user_id
          where u.id is null
        ) as orphan_orders
    `)
    const summary = result.rows[0]
    if (summary.orphan_orders !== 0) throw new Error('BILLING_DATABASE_INTEGRITY_FAILED')
    console.log(JSON.stringify({ status: 'ok', ...summary }))
  } catch (error) {
    console.error('Falha ao validar o PostgreSQL:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
