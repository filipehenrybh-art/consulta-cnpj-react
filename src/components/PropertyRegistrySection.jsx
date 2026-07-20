import { useCallback, useEffect, useMemo, useState } from 'react'
import { BuildingIcon, CheckIcon, ExternalLinkIcon, ShieldIcon } from './Icons.jsx'

const PREVIOUS_SEARCH_STATES = new Set(['DF', 'ES', 'MG', 'MS', 'PR', 'RJ', 'RO', 'RS', 'SC', 'SP'])

const serviceOptions = [
  {
    value: 'previous',
    label: 'Pesquisa Prévia',
    description: 'Localiza possíveis matrículas associadas ao CNPJ nos cartórios selecionados, quando disponível.',
    url: 'https://www.ridigital.org.br/PO/DefaultPO.aspx?from=menu',
  },
  {
    value: 'qualified',
    label: 'Pesquisa Qualificada',
    description: 'Solicita verificação detalhada do vínculo atual perante os cartórios escolhidos.',
    url: 'https://www.ridigital.org.br/CE/DefaultCE.aspx?from=menu',
  },
  {
    value: 'registration_view',
    label: 'Visualização de matrícula',
    description: 'Indicada quando o número da matrícula e o cartório já são conhecidos.',
    url: 'https://www.ridigital.org.br/VisualizarMatricula/DefaultVM.aspx?from=menu',
  },
  {
    value: 'digital_certificate',
    label: 'Certidão Digital',
    description: 'Solicita o documento oficial emitido pelo Registro de Imóveis competente.',
    url: 'https://www.ridigital.org.br/CertidaoDigital/frmPedidosCertidao.aspx?from=menu',
  },
]

const purposes = [
  ['supplier_analysis', 'Análise de fornecedor ou parceiro'],
  ['credit_analysis', 'Análise de crédito empresarial'],
  ['rights_protection', 'Proteção ou exercício regular de direitos'],
  ['authorized_due_diligence', 'Análise cadastral autorizada'],
  ['other_legitimate', 'Outra finalidade legítima'],
]

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

function digits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14)
}

function formatCnpj(value) {
  const valueDigits = digits(value)
  return valueDigits.length === 14
    ? valueDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
    : valueDigits
}

function serviceLabel(value) {
  return serviceOptions.find((item) => item.value === value)?.label || 'Pesquisa imobiliária'
}

function formatDate(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

async function apiJson(response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || 'Não foi possível concluir esta operação.')
  return payload
}

export default function PropertyRegistrySection({ data, establishment, premiumActive }) {
  const currentCnpj = digits(establishment?.cnpj)
  const companyName = String(data?.razao_social || establishment?.nome_fantasia || '').trim()
  const defaultState = String(establishment?.estado?.sigla || '').toUpperCase()
  const defaultCity = String(establishment?.cidade?.nome || '').trim()
  const [serviceType, setServiceType] = useState(PREVIOUS_SEARCH_STATES.has(defaultState) ? 'previous' : 'qualified')
  const [state, setState] = useState(defaultState)
  const [city, setCity] = useState(defaultCity)
  const [purpose, setPurpose] = useState('supplier_analysis')
  const [confirmed, setConfirmed] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setState(defaultState)
    setCity(defaultCity)
    setServiceType(PREVIOUS_SEARCH_STATES.has(defaultState) ? 'previous' : 'qualified')
    setConfirmed(false)
    setMessage('')
  }, [currentCnpj, defaultCity, defaultState])

  const loadHistory = useCallback(async () => {
    if (!premiumActive) return
    setHistoryLoading(true)
    try {
      const result = await apiJson(await fetch('/api/property-searches', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }))
      setHistory(Array.isArray(result.searches) ? result.searches : [])
    } catch (error) {
      setMessage(error.message)
    } finally {
      setHistoryLoading(false)
    }
  }, [premiumActive])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const selectedService = useMemo(
    () => serviceOptions.find((item) => item.value === serviceType) || serviceOptions[0],
    [serviceType],
  )

  const previousSearchAvailable = PREVIOUS_SEARCH_STATES.has(state)

  useEffect(() => {
    if (serviceType === 'previous' && state && !previousSearchAvailable) setServiceType('qualified')
  }, [previousSearchAvailable, serviceType, state])

  async function prepareSearch(event) {
    event.preventDefault()
    if (!confirmed) {
      setMessage('Confirme que a consulta será utilizada para uma finalidade legítima.')
      return
    }

    // O portal oficial é aberto diretamente pelo clique do usuário para evitar bloqueio de pop-up.
    window.open(selectedService.url, '_blank', 'noopener,noreferrer')
    setSubmitting(true)
    setMessage('')
    try {
      const result = await apiJson(await fetch('/api/property-searches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          cnpj: currentCnpj,
          companyName,
          serviceType,
          state,
          city,
          purpose,
          legitimateUseConfirmed: true,
        }),
      }))
      setHistory((current) => [result.search, ...current.filter((item) => item.id !== result.search.id)].slice(0, 20))
      setMessage('Pesquisa preparada e registrada. Conclua a solicitação e o pagamento dos emolumentos diretamente no RI Digital.')
    } catch (error) {
      setMessage(`O RI Digital foi aberto, mas o histórico não pôde ser salvo: ${error.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function removeHistory(id) {
    try {
      await apiJson(await fetch('/api/property-searches', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id }),
      }))
      setHistory((current) => current.filter((item) => item.id !== id))
      setMessage('Registro removido do histórico.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  if (!premiumActive) {
    return (
      <section className="overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.08] via-[#0b111d] to-emerald-400/[0.05] p-5 shadow-2xl shadow-black/20 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">Novo recurso Premium</span>
            <h2 className="mt-4 text-xl font-semibold text-white">Central de consulta imobiliária</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Prepare pesquisas de imóveis vinculadas ao CNPJ, escolha o serviço registral e organize o histórico de acesso ao RI Digital.</p>
          </div>
          <a href="/premium-preview.html" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
            Liberar no Premium
          </a>
        </div>
      </section>
    )
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-300/15 bg-[#0b111d]/90 shadow-2xl shadow-black/25">
      <div className="border-b border-white/[0.07] bg-gradient-to-r from-emerald-400/[0.08] via-transparent to-violet-400/[0.07] p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-400/[0.08] text-emerald-300">
            <BuildingIcon />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-300/80">Análise patrimonial</p>
              <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-violet-200">Premium</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold text-white">Central de consulta imobiliária</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">Prepare a pesquisa deste CNPJ e conclua a solicitação diretamente no RI Digital, ambiente oficial do Registro de Imóveis.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 xl:grid-cols-[1.1fr_0.9fr]">
        <form onSubmit={prepareSearch} className="space-y-5">
          <div className="rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.04] px-4 py-3 text-xs leading-5 text-slate-400">
            Esta ferramenta organiza o acesso; ela não envia o pedido ao cartório nem consulta automaticamente o patrimônio. Custas e emolumentos oficiais são pagos separadamente no RI Digital.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">CNPJ pesquisado</span>
              <input value={formatCnpj(currentCnpj)} readOnly className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-sm text-slate-400" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Serviço desejado</span>
              <select value={serviceType} onChange={(event) => setServiceType(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#080d17] px-4 text-sm text-slate-200 focus:border-cyan-400/50">
                {serviceOptions.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.value === 'previous' && !previousSearchAvailable}>
                    {option.label}{option.value === 'previous' && !previousSearchAvailable ? ' — indisponível nesta UF' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Estado da pesquisa</span>
              <select required value={state} onChange={(event) => setState(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#080d17] px-4 text-sm text-slate-200 focus:border-cyan-400/50">
                <option value="">Selecione a UF</option>
                {states.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Cidade</span>
              <input required minLength="2" maxLength="120" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Cidade onde deseja pesquisar" className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-black/20 px-4 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50" />
            </label>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
            <p className="text-xs font-semibold text-emerald-200">{selectedService.label}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">{selectedService.description} A seleção final dos cartórios é feita no portal oficial.</p>
            {!previousSearchAvailable && (
              <p className="mt-2 text-[11px] leading-5 text-amber-200/70">A Pesquisa Prévia não está disponível nesta UF; por isso, indicamos a Pesquisa Qualificada.</p>
            )}
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-slate-400">Finalidade da consulta</span>
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-[#080d17] px-4 text-sm text-slate-200 focus:border-cyan-400/50">
              {purposes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] px-4 py-3">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
            <span className="text-xs leading-5 text-amber-100/75">Confirmo que possuo finalidade legítima para esta pesquisa e que utilizarei os dados de acordo com a legislação e os termos do serviço oficial.</span>
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="submit" disabled={submitting || !currentCnpj || !companyName} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-400 px-5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Registrando acesso...' : 'Continuar no RI Digital'}
              {!submitting && <ExternalLinkIcon />}
            </button>
            <a href={selectedService.url} target="_blank" rel="noreferrer" className="text-center text-xs text-slate-500 underline decoration-slate-700 underline-offset-4 transition hover:text-cyan-200">Abrir serviço oficial sem registrar</a>
          </div>

          {message && (
            <p role="status" className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-xs leading-5 text-slate-300">{message}</p>
          )}
        </form>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sua organização</p>
              <h3 className="mt-1 text-base font-semibold text-white">Histórico de acessos preparados</h3>
            </div>
            <button type="button" onClick={loadHistory} disabled={historyLoading} className="rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-slate-400 transition hover:text-cyan-200 disabled:opacity-50">
              {historyLoading ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>

          {history.length > 0 ? (
            <div className="mt-4 space-y-3">
              {history.map((item) => (
                <article key={item.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckIcon className="h-3 w-3" /></span>
                        <p className="text-sm font-semibold text-slate-200">{serviceLabel(item.serviceType)}</p>
                      </div>
                      <p className="mt-2 truncate text-xs text-slate-400">{item.companyName}</p>
                      <p className="mt-1 text-[11px] text-slate-600">{formatCnpj(item.cnpj)} · {item.city}/{item.state}</p>
                      <p className="mt-1 text-[10px] text-slate-600">Preparada em {formatDate(item.createdAt)}</p>
                    </div>
                    <button type="button" onClick={() => removeHistory(item.id)} className="shrink-0 text-[10px] text-slate-600 transition hover:text-rose-300">Remover</button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-5 py-8 text-center">
              <ShieldIcon className="mx-auto h-6 w-6 text-slate-600" />
              <p className="mt-3 text-sm text-slate-400">Nenhum acesso imobiliário preparado.</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">O histórico registra somente a preparação e o acesso ao portal, não o resultado oficial.</p>
            </div>
          )}

          <p className="mt-4 text-[11px] leading-5 text-slate-600">A busca pode não ser exaustiva e pode exigir confirmação por certidão. Registros anteriores a 1976 e bases ainda não integradas podem não aparecer.</p>
        </div>
      </div>
    </section>
  )
}
