import { useMemo, useRef, useState } from 'react'
import JsonExplorer, { countFilledFields } from './components/JsonExplorer.jsx'
import {
  AlertIcon,
  BuildingIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
  ShieldIcon,
} from './components/Icons.jsx'

const API_BASE_URL = 'https://publica.cnpj.ws/cnpj'

function onlyDigits(value) {
  return value.replace(/\D/g, '').slice(0, 14)
}

function maskCnpj(value) {
  const digits = onlyDigits(value)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatCnpj(value) {
  const digits = onlyDigits(String(value ?? ''))
  if (digits.length !== 14) return value || 'Não informado'
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function formatCep(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length === 8 ? digits.replace(/^(\d{5})(\d{3})$/, '$1-$2') : value || 'Não informado'
}

function formatPhone(ddd, phone) {
  const digits = `${ddd ?? ''}${phone ?? ''}`.replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3')
  if (digits.length === 10) return digits.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3')
  return digits || null
}

function formatMoney(value) {
  const number = Number(String(value ?? '').replace(',', '.'))
  if (!Number.isFinite(number)) return 'Não informado'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
}

function formatDate(value) {
  if (!value) return 'Não informado'
  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    ...(String(value).length > 10 ? { timeStyle: 'short' } : {}),
  }).format(date)
}

function validateCnpj(cnpj) {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false

  const calculateDigit = (base, weights) => {
    const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = calculateDigit(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return digits.endsWith(`${first}${second}`)
}

function getStatusStyle(status) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized.includes('ativa')) {
    return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
  }
  if (!status) return 'border-slate-400/20 bg-slate-400/10 text-slate-400'
  return 'border-amber-400/25 bg-amber-400/10 text-amber-300'
}

function buildAddress(establishment) {
  if (!establishment) return 'Não informado'
  const street = [establishment.tipo_logradouro, establishment.logradouro].filter(Boolean).join(' ')
  const line = [street, establishment.numero].filter(Boolean).join(', ')
  return [line, establishment.complemento, establishment.bairro].filter(Boolean).join(' — ') || 'Não informado'
}

function getErrorMessage(status, payload) {
  if (status === 404) return 'CNPJ não encontrado na base pública.'
  if (status === 429) return 'Limite de consultas atingido. Aguarde completar 60 segundos e tente novamente.'
  if (status >= 500) return 'A API está temporariamente indisponível. Tente novamente em alguns instantes.'
  return payload?.detalhes || payload?.message || payload?.mensagem || 'Não foi possível concluir a consulta.'
}

function SummaryItem({ label, value, wide = false }) {
  return (
    <div className={`min-w-0 ${wide ? 'md:col-span-2 xl:col-span-3' : ''}`}>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</dt>
      <dd className="mt-1.5 break-words text-sm leading-6 text-slate-200">{value || 'Não informado'}</dd>
    </div>
  )
}

function LoadingState() {
  return (
    <section aria-label="Carregando dados" className="mt-8 space-y-4">
      <div className="rounded-3xl border border-white/[0.07] bg-[#0b111d]/85 p-5 sm:p-7">
        <div className="skeleton h-5 w-28 rounded-lg" />
        <div className="skeleton mt-5 h-8 w-2/3 rounded-lg" />
        <div className="skeleton mt-3 h-4 w-1/3 rounded-lg" />
        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, index) => (
            <div key={index}>
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton mt-2 h-5 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-white/[0.07] bg-[#0b111d]/85 p-5 sm:p-7">
        <div className="skeleton h-5 w-48 rounded-lg" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton h-16 rounded-2xl" />
          ))}
        </div>
      </div>
    </section>
  )
}

const REGULARITY_CHECKS = [
  {
    title: 'Federal — RFB e PGFN',
    description: 'Tributos federais e inscrições na Dívida Ativa da União.',
    label: 'Emitir certidão federal',
    url: 'https://www.gov.br/pt-br/servicos/emitir-certidao-de-regularidade-fiscal',
  },
  {
    title: 'Trabalhista — TST',
    description: 'Débitos inadimplidos registrados no Banco Nacional de Devedores Trabalhistas.',
    label: 'Emitir CNDT',
    url: 'https://cndt-certidao.tst.jus.br/inicio.faces',
  },
  {
    title: 'FGTS — Caixa',
    description: 'Regularidade do empregador perante as obrigações do FGTS.',
    label: 'Consultar CRF',
    url: 'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
  },
]

function RegularitySection({ establishment }) {
  const city = establishment?.cidade?.nome || 'município não informado'
  const state = establishment?.estado?.sigla || 'UF não informada'

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-[#0b111d]/85 p-4 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-300">
          <ShieldIcon />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">Regularidade empresarial</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Certidões e indícios de dívidas</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            A confirmação é feita nas fontes oficiais. Alguns portais exigem CAPTCHA; por isso, a certidão deve ser emitida pelo usuário e não pode ser inferida apenas pelos dados cadastrais do CNPJ.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {REGULARITY_CHECKS.map((check) => (
          <article key={check.title} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <span className="w-fit rounded-full border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-200">
              Consulta externa
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-100">{check.title}</h3>
            <p className="mt-2 flex-1 text-xs leading-5 text-slate-500">{check.description}</p>
            <a href={check.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-3 text-sm font-medium text-cyan-200 transition hover:bg-cyan-300/[0.11]">
              {check.label}
              <ExternalLinkIcon />
            </a>
          </article>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-sm font-semibold text-slate-200">Estadual — {state}</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">Consulte a certidão de débitos tributários e de dívida ativa no portal da Secretaria da Fazenda e da Procuradoria do estado.</p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <p className="text-sm font-semibold text-slate-200">Municipal — {city}</p>
          <p className="mt-1.5 text-xs leading-5 text-slate-500">Consulte a certidão mobiliária de débitos no portal da prefeitura do domicílio do estabelecimento.</p>
        </div>
      </div>

      <p className="mt-4 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] px-4 py-3 text-xs leading-5 text-amber-100/70">
        “Situação ativa” no CNPJ não significa ausência de dívidas. Somente as certidões vigentes de cada órgão comprovam a regularidade nos respectivos âmbitos.
      </p>
    </section>
  )
}

export default function App() {
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const resultsRef = useRef(null)

  const establishment = data?.estabelecimento
  const fieldCount = useMemo(() => (data ? countFilledFields(data) : 0), [data])
  const rawJson = useMemo(() => (data ? JSON.stringify(data, null, 2) : ''), [data])

  const phones = useMemo(() => {
    if (!establishment) return []
    return [
      formatPhone(establishment.ddd1, establishment.telefone1),
      formatPhone(establishment.ddd2, establishment.telefone2),
    ].filter(Boolean)
  }, [establishment])

  const stateRegistrations = useMemo(() => {
    const registrations = establishment?.inscricoes_estaduais
    if (!Array.isArray(registrations) || registrations.length === 0) return 'Não informado'
    return registrations
      .map((item) => `${item.inscricao_estadual || 'Sem número'}${item.estado?.sigla ? `/${item.estado.sigla}` : ''}${item.ativo === false ? ' (inativa)' : ''}`)
      .join(' · ')
  }, [establishment])

  async function handleSubmit(event) {
    event.preventDefault()
    const cleanCnpj = onlyDigits(cnpj)

    if (!validateCnpj(cleanCnpj)) {
      setError('Digite um CNPJ válido com 14 números.')
      setData(null)
      return
    }

    setLoading(true)
    setError('')
    setData(null)
    setShowRaw(false)
    setCopied(false)

    try {
      const response = await fetch(`${API_BASE_URL}/${cleanCnpj}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }

      if (!response.ok) {
        throw new Error(getErrorMessage(response.status, payload))
      }

      if (!payload || typeof payload !== 'object') {
        throw new Error('A API respondeu, mas não retornou um JSON válido.')
      }

      setData(payload)
      window.setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } catch (requestError) {
      const isNetworkError = requestError instanceof TypeError
      setError(
        isNetworkError
          ? 'Falha de conexão com a API. Verifique sua internet ou se o navegador bloqueou a requisição.'
          : requestError.message,
      )
    } finally {
      setLoading(false)
    }
  }

  async function copyJson() {
    if (!rawJson) return

    try {
      await navigator.clipboard.writeText(rawJson)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = rawJson
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      textArea.remove()
    }

    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-[-26rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full border border-cyan-300/[0.07]" />
      <div className="pointer-events-none absolute left-1/2 top-[-21rem] h-[32rem] w-[32rem] -translate-x-1/2 rounded-full border border-indigo-300/[0.07]" />

      <header className="relative z-10 border-b border-white/[0.06] bg-[#060a12]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-300/20 bg-gradient-to-br from-cyan-400/15 to-indigo-500/15 text-cyan-300 shadow-glow">
              <BuildingIcon />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">Consulta CNPJ</p>
              <p className="text-xs text-slate-500">Dados públicos empresariais</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.85)]" />
            API pública CNPJ.ws
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8">
        <section className="mx-auto max-w-4xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-200">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Consulta completa e organizada
          </div>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
            Consulte qualquer CNPJ com uma visão{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent">
              clara e profissional
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-400 sm:text-lg">
            Pesquise dados cadastrais, endereço, atividade econômica, inscrições e todo o conteúdo retornado pela API em uma estrutura dinâmica.
          </p>
        </section>

        <section className="mx-auto mt-10 max-w-4xl rounded-3xl border border-white/[0.08] bg-[#0b111d]/80 p-3 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="cnpj" className="sr-only">CNPJ</label>
              <div className="pointer-events-none absolute inset-y-0 left-0 grid w-12 place-items-center text-slate-500">
                <BuildingIcon className="h-5 w-5" />
              </div>
              <input
                id="cnpj"
                name="cnpj"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cnpj}
                onChange={(event) => {
                  setCnpj(maskCnpj(event.target.value))
                  if (error) setError('')
                }}
                placeholder="00.000.000/0000-00"
                maxLength={18}
                aria-describedby="cnpj-help"
                className="h-14 w-full rounded-2xl border border-white/[0.08] bg-black/20 pl-12 pr-4 text-base font-medium tracking-wide text-white placeholder:text-slate-600 transition focus:border-cyan-400/50 focus:bg-black/30"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-sky-500 px-7 font-semibold text-slate-950 shadow-lg shadow-cyan-500/10 transition hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/25 border-t-slate-950" />
                  Consultando
                </>
              ) : (
                <>
                  <SearchIcon />
                  Consultar
                </>
              )}
            </button>
          </form>
          <div id="cnpj-help" className="flex flex-col gap-1 px-2 pb-1 pt-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Digite os 14 números. A máscara é aplicada automaticamente.</span>
            <span>Exemplo: 27.865.757/0001-02</span>
          </div>
        </section>

        {error && (
          <div role="alert" className="mx-auto mt-5 flex max-w-4xl items-start gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3.5 text-sm text-rose-200">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {loading && <LoadingState />}

        {data && !loading && (
          <div ref={resultsRef} className="scroll-mt-6 mt-8 space-y-5">
            <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b111d]/85 shadow-2xl shadow-black/25 backdrop-blur-xl">
              <div className="border-b border-white/[0.07] bg-gradient-to-r from-cyan-400/[0.07] via-transparent to-indigo-400/[0.07] px-5 py-6 sm:px-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusStyle(establishment?.situacao_cadastral)}`}>
                        {establishment?.situacao_cadastral || 'Situação não informada'}
                      </span>
                      <span className="text-xs text-slate-500">CNPJ {formatCnpj(establishment?.cnpj)}</span>
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
                      {data.razao_social || 'Razão social não informada'}
                    </h2>
                    {establishment?.nome_fantasia && (
                      <p className="mt-2 text-base text-slate-400">{establishment.nome_fantasia}</p>
                    )}
                  </div>

                  <div className="hidden" aria-hidden="true">
                    <button
                      type="button"
                      onClick={() => setShowRaw((current) => !current)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 text-sm font-medium text-slate-300 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.06] hover:text-cyan-200"
                    >
                      <CodeIcon />
                      {showRaw ? 'Ocultar JSON' : 'Ver JSON bruto'}
                    </button>
                    <button
                      type="button"
                      onClick={copyJson}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 text-sm font-medium text-slate-300 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.06] hover:text-cyan-200"
                    >
                      {copied ? <CheckIcon /> : <CopyIcon />}
                      {copied ? 'Copiado' : 'Copiar JSON'}
                    </button>
                  </div>
                </div>
              </div>

              <dl className="grid grid-cols-1 gap-x-8 gap-y-6 p-5 md:grid-cols-2 sm:p-7 xl:grid-cols-3">
                <SummaryItem label="Razão social" value={data.razao_social} />
                <SummaryItem label="Nome fantasia" value={establishment?.nome_fantasia} />
                <SummaryItem label="Situação cadastral" value={establishment?.situacao_cadastral} />
                <SummaryItem label="Capital social" value={formatMoney(data.capital_social)} />
                <SummaryItem label="Porte" value={data.porte?.descricao} />
                <SummaryItem label="Natureza jurídica" value={data.natureza_juridica?.descricao} />
                <SummaryItem
                  label="CNAE principal"
                  value={
                    establishment?.atividade_principal
                      ? `${establishment.atividade_principal.subclasse || establishment.atividade_principal.id || ''} — ${establishment.atividade_principal.descricao || 'Descrição não informada'}`
                      : 'Não informado'
                  }
                  wide
                />
                <SummaryItem label="Endereço" value={buildAddress(establishment)} wide />
                <SummaryItem
                  label="Cidade / UF"
                  value={[establishment?.cidade?.nome, establishment?.estado?.sigla].filter(Boolean).join(' / ') || 'Não informado'}
                />
                <SummaryItem label="CEP" value={formatCep(establishment?.cep)} />
                <SummaryItem label="Telefone" value={phones.join(' · ') || 'Não informado'} />
                <SummaryItem label="E-mail" value={establishment?.email} />
                <SummaryItem label="Inscrições estaduais" value={stateRegistrations} wide />
                <SummaryItem label="Simples Nacional" value={data.simples?.simples || 'Não informado'} />
                <SummaryItem label="MEI" value={data.simples?.mei || 'Não informado'} />
                <SummaryItem label="Última atualização" value={formatDate(data.atualizado_em || establishment?.atualizado_em)} />
              </dl>
            </section>

            {showRaw && (
              <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#070b12]/95">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">JSON bruto</h2>
                    <p className="mt-0.5 text-xs text-slate-500">Resposta integral da API</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyJson}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-xs font-medium text-slate-400 transition hover:text-cyan-200"
                  >
                    {copied ? <CheckIcon /> : <CopyIcon />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
                <pre className="max-h-[34rem] overflow-auto p-5 text-xs leading-6 text-slate-300 sm:text-[13px]">
                  <code>{rawJson}</code>
                </pre>
              </section>
            )}

            <RegularitySection establishment={establishment} />

            <section className="rounded-3xl border border-white/[0.08] bg-[#0b111d]/85 p-4 shadow-2xl shadow-black/20 sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Leitura dinâmica</p>
                  <h2 className="mt-2 text-xl font-semibold text-white">Todos os dados retornados</h2>
                  <p className="mt-1 text-sm text-slate-500">Objetos e listas são organizados automaticamente, inclusive campos futuros da API.</p>
                </div>
                <div className="shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-2 text-sm text-slate-400">
                  <span className="font-semibold text-cyan-300">{fieldCount}</span>{' '}
                  {fieldCount === 1 ? 'campo preenchido' : 'campos preenchidos'}
                </div>
              </div>
              <JsonExplorer data={data} />
            </section>
          </div>
        )}

        <section className="mx-auto mt-8 max-w-4xl rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-center text-xs leading-5 text-slate-500">
          A API pública possui limite de até 3 consultas por minuto por IP. Os dados exibidos são fornecidos pela CNPJ.ws.
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] px-4 py-7 text-center text-xs text-slate-600">
        <p>Desenvolvido por Pilar Finanças by Filipe Henry</p>
        <p className="mt-2">
          Acesse nosso site de finanças e controle pessoal,{' '}
          <a
            href="https://www.pilarfinancaspro.com.br"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-300/80 transition hover:text-cyan-200 hover:underline"
          >
            www.pilarfinancaspro.com.br
          </a>
        </p>
      </footer>
    </div>
  )
}
