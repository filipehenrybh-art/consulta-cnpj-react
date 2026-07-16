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
