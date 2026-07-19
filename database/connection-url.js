export function verifiedDatabaseUrl(value = process.env.DATABASE_URL) {
  const connectionString = String(value || '').trim()
  if (!connectionString) throw new Error('BILLING_DATABASE_NOT_CONFIGURED')

  return connectionString.replace(
    /([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/i,
    '$1sslmode=verify-full',
  )
}
