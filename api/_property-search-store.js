import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import pg from 'pg'
import { verifiedDatabaseUrl } from '../database/connection-url.js'

const { Pool } = pg
const localDatabasePath = resolve(process.env.LOCAL_PROPERTY_SEARCH_DB || 'data/dev-property-searches.json')
let pool
let writeQueue = Promise.resolve()

function postgresStorageIsEnabled() {
  const mode = String(process.env.BILLING_STORAGE_MODE || '').trim().toLowerCase()
  return mode === 'postgres' || (mode !== 'local' && Boolean(process.env.DATABASE_URL))
}

function getPool() {
  if (pool) return pool
  pool = new Pool({
    connectionString: verifiedDatabaseUrl(),
    max: Math.max(1, Math.min(Number(process.env.DATABASE_POOL_MAX) || 2, 10)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })
  pool.on('error', (error) => console.error('Conexão PostgreSQL imobiliária falhou:', error.message))
  return pool
}

function fromRow(row) {
  if (!row) return null
  return {
    id: row.public_id,
    cnpj: row.cnpj,
    companyName: row.company_name,
    serviceType: row.service_type,
    state: row.state,
    city: row.city,
    purpose: row.purpose,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

async function readLocalDatabase() {
  try {
    const parsed = JSON.parse(await readFile(localDatabasePath, 'utf8'))
    return { searches: Array.isArray(parsed.searches) ? parsed.searches : [] }
  } catch (error) {
    if (error.code === 'ENOENT') return { searches: [] }
    throw error
  }
}

async function updateLocalDatabase(updater) {
  const operation = writeQueue.then(async () => {
    const database = await readLocalDatabase()
    const result = await updater(database)
    await mkdir(dirname(localDatabasePath), { recursive: true })
    await writeFile(localDatabasePath, `${JSON.stringify(database, null, 2)}\n`, 'utf8')
    return result
  })
  writeQueue = operation.catch(() => {})
  return operation
}

export async function createPropertySearch(userId, search) {
  if (postgresStorageIsEnabled()) {
    const result = await getPool().query(
      `insert into property_searches (
         public_id, user_id, cnpj, company_name, service_type, state, city, purpose
       )
       select $1, u.id, $3, $4, $5, $6, $7, $8
       from users u where u.google_sub = $2
       returning *`,
      [
        randomUUID(),
        userId,
        search.cnpj,
        search.companyName,
        search.serviceType,
        search.state,
        search.city,
        search.purpose,
      ],
    )
    if (!result.rowCount) throw new Error('USER_NOT_FOUND')
    return fromRow(result.rows[0])
  }

  return updateLocalDatabase((database) => {
    const item = {
      id: randomUUID(),
      userId,
      ...search,
      status: 'prepared',
      createdAt: new Date().toISOString(),
    }
    database.searches.push(item)
    if (database.searches.length > 1000) database.searches.splice(0, database.searches.length - 1000)
    return item
  })
}

export async function listPropertySearches(userId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100))
  if (postgresStorageIsEnabled()) {
    const result = await getPool().query(
      `select ps.*
       from property_searches ps
       join users u on u.id = ps.user_id
       where u.google_sub = $1 and ps.deleted_at is null
       order by ps.created_at desc
       limit $2`,
      [userId, safeLimit],
    )
    return result.rows.map(fromRow)
  }

  const database = await readLocalDatabase()
  return database.searches
    .filter((item) => item.userId === userId && !item.deletedAt)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, safeLimit)
}

export async function deletePropertySearch(userId, searchId) {
  if (postgresStorageIsEnabled()) {
    const result = await getPool().query(
      `update property_searches ps
       set deleted_at = now()
       from users u
       where ps.user_id = u.id
         and u.google_sub = $1
         and ps.public_id = $2
         and ps.deleted_at is null
       returning ps.public_id`,
      [userId, searchId],
    )
    return Boolean(result.rowCount)
  }

  return updateLocalDatabase((database) => {
    const item = database.searches.find((entry) => entry.id === searchId && entry.userId === userId && !entry.deletedAt)
    if (!item) return false
    item.deletedAt = new Date().toISOString()
    return true
  })
}
