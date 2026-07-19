export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    response.statusCode = 405
    response.end('Método não permitido.')
    return
  }

  const baseUrl = String(process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '')
  response.statusCode = 302
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Location', `${baseUrl}/premium-preview.html?subscription=return`)
  response.end()
}
