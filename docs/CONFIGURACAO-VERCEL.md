# Configuração atual da Vercel

## Endereço público

```text
https://consulta-cnpj-react.vercel.app
```

## Variáveis públicas ou não sigilosas

Configure nos ambientes Production, Preview e Development:

```env
BILLING_STORAGE_MODE=postgres
DATABASE_POOL_MAX=2
AUTH_ALLOWED_ORIGINS=https://consulta-cnpj-react.vercel.app
APP_BASE_URL=https://consulta-cnpj-react.vercel.app
MERCADO_PAGO_WEBHOOK_URL=https://consulta-cnpj-react.vercel.app/api/webhooks/mercadopago
ADMIN_GOOGLE_EMAILS=filipehenrybh@gmail.com
```

`DATABASE_URL` é fornecida automaticamente pela integração Neon e não deve ser copiada para arquivos versionados.

## Variáveis sigilosas

Devem ser cadastradas diretamente na Vercel, com valores novos antes da publicação:

```text
SESSION_SECRET
MERCADO_PAGO_ACCESS_TOKEN
MERCADO_PAGO_WEBHOOK_SECRET
MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN
MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET
```

Também são necessárias as variáveis públicas de integração:

```text
VITE_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_ID
VITE_MERCADO_PAGO_PUBLIC_KEY
```

Não copie valores do `.env` local para conversas, capturas de tela ou arquivos versionados. Credenciais expostas durante o backtest devem ser revogadas e substituídas.

## Google OAuth

Adicione como origem JavaScript autorizada:

```text
https://consulta-cnpj-react.vercel.app
```

Não é necessário cadastrar uma URI de redirecionamento para o fluxo atual do Google Identity Services, pois o token é recebido no frontend e validado pela API.

## Mercado Pago

Configure nos dois aplicativos usados pelo projeto o Webhook HTTPS:

```text
https://consulta-cnpj-react.vercel.app/api/webhooks/mercadopago
```

Depois de alterar variáveis ou integrações na Vercel, faça um novo deployment; deployments anteriores não recebem as novas configurações automaticamente.
