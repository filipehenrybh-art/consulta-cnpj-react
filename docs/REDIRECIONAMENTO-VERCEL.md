# Redirecionamento da Vercel para domínio próprio

## Objetivo

Fazer com que todo acesso ao endereço público `*.vercel.app` seja redirecionado permanentemente para o domínio próprio, preservando o caminho e os parâmetros da URL.

Exemplo:

```text
https://projeto.vercel.app/consulta?cnpj=123
https://seudominio.com.br/consulta?cnpj=123
```

## Informações pendentes

- Endereço atual completo da Vercel: `https://consulta-cnpj-react.vercel.app`
- Domínio próprio de destino: `PREENCHER`

## Configuração planejada

1. Adicionar e verificar o domínio próprio em **Vercel > Project > Settings > Domains**.
2. Configurar no provedor do domínio os registros DNS indicados pela Vercel.
3. Em **Vercel > Project > Firewall**, criar uma regra para o host `*.vercel.app`.
4. Usar a ação **Redirect** para o domínio próprio.
5. Selecionar o código **308 Permanent Redirect**.
6. Preservar o caminho e os parâmetros da URL.
7. Definir o domínio próprio como endereço canônico para mecanismos de busca.
8. Validar que o domínio próprio não redireciona para ele mesmo, evitando um ciclo de redirecionamento.

## Testes após a configuração

- Abrir a página inicial pelo endereço da Vercel.
- Abrir uma rota interna pelo endereço da Vercel.
- Testar uma URL com parâmetros.
- Confirmar que todos os casos chegam ao mesmo caminho no domínio próprio.
- Confirmar o retorno HTTP `308` no endereço antigo.

Referência: https://examples.vercel.com/kb/guide/avoiding-duplicate-content-with-vercel-app-urls
