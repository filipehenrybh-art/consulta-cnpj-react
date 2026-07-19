# Consulta CNPJ — React + Tailwind

Frontend moderno e responsivo para consultar CNPJ pela API pública da CNPJ.ws.

## Recursos

- Máscara e validação de CNPJ
- Consulta com loading e mensagens de erro para 404, 429 e falhas de servidor/rede
- Resumo profissional com dados empresariais principais
- Renderização recursiva de todos os campos do JSON, incluindo objetos, listas e listas de objetos
- Formatação automática de CNPJ, CEP, datas, booleanos, telefones e capital social
- Visualização e cópia do JSON bruto
- Contador de campos preenchidos
- Sem biblioteca externa de ícones; os ícones são SVGs locais

## Executar

```bash
npm install
npm run dev
```

## Testar autenticação Google localmente

1. Crie um cliente OAuth 2.0 do tipo **Aplicativo da Web** no Google Cloud.
2. Adicione `http://localhost:5173` às origens JavaScript autorizadas.
3. Copie `.env.example` para `.env` e preencha:

```env
VITE_GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
SESSION_SECRET=um-segredo-aleatorio-com-pelo-menos-32-caracteres
```

4. Inicie frontend e servidor de autenticação juntos:

```bash
npm run dev:full
```

O servidor local das APIs usa a porta `8788`. Antes de iniciar, feche execuções antigas do projeto que ainda estejam abertas em outros terminais.

5. Acesse `http://localhost:5173/premium-preview.html`.

O token do Google é validado no servidor. A sessão fica em cookie `HttpOnly`, com `SameSite=Lax` e `Secure` automaticamente habilitado em produção. A prévia também mantém um modo simulado quando não há Client ID configurado.

## Testar pagamentos no Mercado Pago

Estão disponíveis o Premium anual de R$ 200,00 à vista e o Premium mensal recorrente de R$ 19,90. Os dois usam credenciais e contas de teste e só ativam o acesso após a confirmação do Webhook.

1. Use a aplicação já criada para o Checkout Pro anual e crie outra aplicação no Mercado Pago Developers selecionando o produto **Assinaturas** para o plano mensal.
2. Acrescente ao `.env` o `MERCADO_PAGO_ACCESS_TOKEN` usado no anual. Para o mensal, copie da mesma tela de **Credenciais de teste** da aplicação de Assinaturas o par `MERCADO_PAGO_SUBSCRIPTIONS_ACCESS_TOKEN=TEST-...` e `VITE_MERCADO_PAGO_PUBLIC_KEY=TEST-...`. A Public Key é usada pelo Card Payment Brick no navegador; os dados completos do cartão nunca passam pelo servidor da aplicação.
3. Configure um endereço HTTPS temporário apontando para o servidor local e informe a rota `/api/webhooks/mercadopago` no painel do Mercado Pago.
4. Na aplicação do Checkout Pro, marque **Pagamentos (legacy)** e preencha `MERCADO_PAGO_WEBHOOK_SECRET`. Na aplicação de Assinaturas, marque **Planos e assinaturas** e preencha `MERCADO_PAGO_SUBSCRIPTIONS_WEBHOOK_SECRET`. As duas podem usar a mesma `MERCADO_PAGO_WEBHOOK_URL`.
5. Mantenha `MERCADO_PAGO_USE_SANDBOX=true` e execute `npm run dev:full`.
6. Crie uma conta de teste do tipo **Comprador** na aplicação de Assinaturas.
7. Entre com uma conta Google real, escolha **Anual** ou **Mensal** e inicie o pagamento em ambiente de teste. O mensal usa o Card Payment Brick dentro do site para gerar um token PCI e criar a assinatura recorrente autorizada.

Para concluir a compra Sandbox, crie ou utilize uma conta de teste do tipo **Comprador** em `Suas integrações > Sua aplicação > Testes > Contas de teste`. Abra o projeto em uma janela anônima e faça login no checkout com o usuário e a senha dessa conta de teste. Não use sua conta Mercado Pago real como comprador.

No plano mensal, a primeira cobrança aprovada libera o Premium somente para a conta Google que iniciou a assinatura. O botão **Cancelar renovação** interrompe as cobranças futuras e mantém o acesso até o fim do período já pago.

No plano anual, o Webhook continua sendo a confirmação principal. Como proteção adicional, a consulta de status reconcilia pedidos pendentes diretamente com o Mercado Pago, conferindo referência externa, valor e moeda antes de liberar o Premium. Isso evita que uma indisponibilidade temporária do túnel local deixe um pagamento aprovado sem acesso.

O arquivo `data/dev-billing.json` é criado automaticamente e serve somente ao backtest local. Ele está ignorado pelo Git. Preview e produção usam PostgreSQL com a estrutura de `database/schema.sql`.

### Preparar PostgreSQL para Preview e produção

1. Crie um PostgreSQL no Neon pela integração da Vercel e copie a conexão **pooled** para `DATABASE_URL`.
2. No `.env` local, troque temporariamente `BILLING_STORAGE_MODE` para `postgres`, preencha `DATABASE_URL` e execute:

```bash
npm run db:migrate
```

3. Para levar ao PostgreSQL os usuários, pedidos e acessos Premium já validados no arquivo local, faça uma única importação:

```bash
npm run db:import-local
```

5. Confirme a conexão e a integridade básica sem exibir dados pessoais:

```bash
npm run db:check
```

6. Na Vercel, configure `BILLING_STORAGE_MODE=postgres`, `DATABASE_URL` e `DATABASE_POOL_MAX=2` nos ambientes Preview e Production. A variável `DATABASE_URL` é exclusiva do servidor e nunca pode receber o prefixo `VITE_`.

As migrações são idempotentes. A importação local usa as chaves únicas do banco para poder ser repetida sem duplicar usuários ou pedidos.

### Administrar cortesias Premium

Configure em `.env` uma ou mais contas Google administradoras:

```env
ADMIN_GOOGLE_EMAILS=administrador@exemplo.com
```

Depois de entrar com essa conta Google, a página Premium mostra o painel **Cortesias Premium**. O administrador pode buscar uma conta pelo e-mail, definir validade de 30 dias, 90 dias, um ano ou permanente, conceder e revogar o acesso. O usuário destinatário precisa ter entrado com Google pelo menos uma vez para que seu identificador seguro esteja registrado.

O mesmo painel funciona como gestão de acessos: mostra as contas Google registradas, último login, última atividade, quantidade de logins e plano atual. O indicador **Ativo recentemente** representa atividade observada nos últimos 15 minutos; ele não é uma presença em tempo real por conexão permanente.

A autorização é validada no servidor pela sessão Google e não utiliza senha administrativa paralela. Em produção, as cortesias e o histórico de concessão são armazenados no PostgreSQL.

### Túnel temporário para o Webhook

Durante o desenvolvimento local, execute `npm run tunnel:webhook` em outro PowerShell. O comando cria uma URL HTTPS temporária da Cloudflare apontando para a API local na porta `8788`. Configure no Mercado Pago somente a rota `/api/webhooks/mercadopago`. O túnel é exclusivo para testes e deve permanecer aberto enquanto as notificações forem validadas.

## Gerar produção

```bash
npm run build
npm run preview
```

A compilação ficará na pasta `dist`.

## API

- Endpoint: `https://publica.cnpj.ws/cnpj/{cnpj}`
- O CNPJ é enviado somente com números.
- A API pública informa limite de até 3 consultas por minuto por IP.
