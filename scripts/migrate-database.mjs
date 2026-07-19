import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
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
    const schema = await readFile(resolve('database/schema.sql'), 'utf8')
    await pool.query(schema)
    console.log('Estrutura PostgreSQL criada/atualizada com sucesso.')
  } catch (error) {
    console.error('Falha ao aplicar a estrutura PostgreSQL:', error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
