import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import JsonExplorer, { countFilledFields, formatValue, humanizeKey } from './components/JsonExplorer.jsx'
import GoogleAuthPanel from './components/GoogleAuthPanel.jsx'
import PropertyRegistrySection from './components/PropertyRegistrySection.jsx'
import SampleReportPreview from './components/SampleReportPreview.jsx'
import {
  AlertIcon,
  BuildingIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
} from './components/Icons.jsx'

const API_BASE_URL = '/api/cnpj'

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
  if (status === 401) return payload?.error || 'Entre com sua conta Google para realizar a consulta.'
  if (status === 404) return 'CNPJ não encontrado na base pública.'
  if (status === 429) return 'Limite de consultas atingido. Aguarde completar 60 segundos e tente novamente.'
  if (status >= 500) return payload?.error || 'A API está temporariamente indisponível. Tente novamente em alguns instantes.'
  return payload?.error || payload?.detalhes || payload?.message || payload?.mensagem || 'Não foi possível concluir a consulta.'
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
    description: 'Tributos federais e inscrições na Dívida Ativa da União. A emissão depende da situação fiscal registrada pela Receita.',
    note: 'Se aparecer “informações insuficientes”, existem pendências. Use “Como resolver” no portal e consulte o Relatório de Situação Fiscal no e-CAC.',
    label: 'Consultar certidão federal',
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
            {check.note && (
              <p className="mt-3 rounded-xl border border-amber-300/10 bg-amber-300/[0.04] px-3 py-2.5 text-[11px] leading-5 text-amber-100/70">
                {check.note}
              </p>
            )}
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

function PartnersSection({ partners, responsibleRole }) {
  const hasPartners = Array.isArray(partners) && partners.length > 0

  return (
    <section className="rounded-3xl border border-white/[0.08] bg-[#0b111d]/85 p-4 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-indigo-300/20 bg-indigo-400/[0.08] text-indigo-300">
          <UsersIcon />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-300/80">Quadro societário</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Sócios e responsáveis</h2>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Pessoas e empresas vinculadas ao CNPJ conforme os dados disponibilizados pela Receita Federal.
          </p>
        </div>
      </div>

      {responsibleRole && (
        <div className="mt-5 rounded-xl border border-indigo-300/15 bg-indigo-300/[0.05] px-4 py-3 text-sm text-slate-300">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Qualificação do responsável</span>
          <p className="mt-1 font-medium text-indigo-200">{responsibleRole}</p>
        </div>
      )}

      {hasPartners ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {partners.map((partner, index) => {
            const qualification = partner?.qualificacao_socio?.descricao || partner?.qualificacao_socio
            const representativeQualification = partner?.qualificacao_representante?.descricao || partner?.qualificacao_representante

            return (
              <article key={`${partner?.nome || 'socio'}-${index}`} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.04] text-sm font-semibold text-indigo-200">
                    {(partner?.nome || '?').trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-semibold leading-5 text-slate-100">{partner?.nome || 'Nome não informado'}</h3>
                    <p className="mt-1 text-xs font-medium text-indigo-300">{qualification || 'Qualificação não informada'}</p>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Tipo</dt>
                    <dd className="text-right text-slate-300">{partner?.tipo || 'Não informado'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Entrada</dt>
                    <dd className="text-right text-slate-300">{formatDate(partner?.data_entrada)}</dd>
                  </div>
                  {partner?.faixa_etaria && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">Faixa etária</dt>
                      <dd className="text-right text-slate-300">{partner.faixa_etaria}</dd>
                    </div>
                  )}
                  {partner?.pais?.nome && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">País</dt>
                      <dd className="text-right text-slate-300">{partner.pais.nome}</dd>
                    </div>
                  )}
                </dl>

                {partner?.nome_representante && (
                  <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Representante legal</p>
                    <p className="mt-1 text-xs font-medium text-slate-200">{partner.nome_representante}</p>
                    {representativeQualification && <p className="mt-0.5 text-[11px] text-slate-500">{representativeQualification}</p>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center">
          <p className="text-sm text-slate-400">Nenhum sócio ou responsável foi informado pela fonte para este CNPJ.</p>
          <p className="mt-1 text-xs text-slate-600">A disponibilidade varia conforme a natureza jurídica e a atualização cadastral da empresa.</p>
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-slate-600">
        CPFs de pessoas físicas não são exibidos. A API descaracteriza esses documentos conforme as regras de proteção de dados da fonte oficial.
      </p>
    </section>
  )
}

function PrintableDataNode({ label, value, depth = 0 }) {
  if (Array.isArray(value)) {
    return (
      <section className="print-data-group">
        <h3>{humanizeKey(label)} <small>({value.length} {value.length === 1 ? 'item' : 'itens'})</small></h3>
        {value.length === 0 ? <p className="print-data-empty">Lista vazia</p> : value.map((item, index) => (
          <div key={index} className="print-data-array-item">
            <h4>Item {index + 1}</h4>
            {item && typeof item === 'object'
              ? <PrintableDataNode label={`item_${index + 1}`} value={item} depth={depth + 1} />
              : <div className="print-data-field"><span>Valor</span><strong>{formatValue(label, item)}</strong></div>}
          </div>
        ))}
      </section>
    )
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    const primitives = entries.filter(([, item]) => !item || typeof item !== 'object')
    const nested = entries.filter(([, item]) => item && typeof item === 'object')

    return (
      <section className={`print-data-group print-data-depth-${Math.min(depth, 3)}`}>
        <h3>{humanizeKey(label)}</h3>
        {primitives.length > 0 && (
          <div className="print-data-grid">
            {primitives.map(([key, item]) => (
              <div key={key} className="print-data-field">
                <span>{humanizeKey(key)}</span>
                <strong>{formatValue(key, item)}</strong>
              </div>
            ))}
          </div>
        )}
        {nested.map(([key, item]) => <PrintableDataNode key={key} label={key} value={item} depth={depth + 1} />)}
      </section>
    )
  }

  return (
    <div className="print-data-field">
      <span>{humanizeKey(label)}</span>
      <strong>{formatValue(label, value)}</strong>
    </div>
  )
}

function PrintableReport({ data, establishment, phones, stateRegistrations }) {
  const partners = Array.isArray(data?.socios) ? data.socios : []

  return (
    <article className="print-report" aria-hidden="true">
      <header className="print-report-header">
        <div>
          <p className="print-report-brand">Pilar Finanças</p>
          <h1>Relatório Empresarial Premium</h1>
          <p>Consulta cadastral e roteiro de regularidade</p>
        </div>
        <div className="print-report-date">
          Gerado em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date())}
        </div>
      </header>

      <section className="print-report-section">
        <h2>Identificação da empresa</h2>
        <div className="print-report-grid">
          <div><span>Razão social</span><strong>{data?.razao_social || 'Não informado'}</strong></div>
          <div><span>Nome fantasia</span><strong>{establishment?.nome_fantasia || 'Não informado'}</strong></div>
          <div><span>CNPJ</span><strong>{formatCnpj(establishment?.cnpj)}</strong></div>
          <div><span>Situação cadastral</span><strong>{establishment?.situacao_cadastral || 'Não informado'}</strong></div>
          <div><span>Capital social</span><strong>{formatMoney(data?.capital_social)}</strong></div>
          <div><span>Porte</span><strong>{data?.porte?.descricao || 'Não informado'}</strong></div>
          <div><span>Natureza jurídica</span><strong>{data?.natureza_juridica?.descricao || 'Não informado'}</strong></div>
          <div><span>Inscrições estaduais</span><strong>{stateRegistrations}</strong></div>
        </div>
      </section>

      <section className="print-report-section">
        <h2>Endereço e contato</h2>
        <div className="print-report-grid">
          <div className="print-report-wide"><span>Endereço</span><strong>{buildAddress(establishment)}</strong></div>
          <div><span>Cidade / UF</span><strong>{[establishment?.cidade?.nome, establishment?.estado?.sigla].filter(Boolean).join(' / ') || 'Não informado'}</strong></div>
          <div><span>CEP</span><strong>{formatCep(establishment?.cep)}</strong></div>
          <div><span>Telefone</span><strong>{phones.join(' · ') || 'Não informado'}</strong></div>
          <div><span>E-mail</span><strong>{establishment?.email || 'Não informado'}</strong></div>
        </div>
      </section>

      <section className="print-report-section">
        <h2>Atividade econômica principal</h2>
        <p>
          {establishment?.atividade_principal
            ? `${establishment.atividade_principal.subclasse || establishment.atividade_principal.id || ''} — ${establishment.atividade_principal.descricao || 'Descrição não informada'}`
            : 'Não informado'}
        </p>
      </section>

      <section className="print-report-section">
        <h2>Sócios e responsáveis</h2>
        {partners.length > 0 ? (
          <table>
            <thead><tr><th>Nome</th><th>Qualificação</th><th>Entrada</th></tr></thead>
            <tbody>
              {partners.map((partner, index) => (
                <tr key={`${partner?.nome || 'socio'}-${index}`}>
                  <td>{partner?.nome || 'Não informado'}</td>
                  <td>{partner?.qualificacao_socio?.descricao || partner?.qualificacao_socio || 'Não informado'}</td>
                  <td>{formatDate(partner?.data_entrada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p>Nenhum sócio ou responsável informado.</p>}
      </section>

      <section className="print-report-section">
        <h2>Certidões e indícios de dívidas</h2>
        <ul className="print-report-checklist">
          {REGULARITY_CHECKS.map((check) => <li key={check.title}><strong>{check.title}:</strong> consulta necessária na fonte oficial.</li>)}
          <li><strong>Estadual:</strong> consultar SEFAZ e Procuradoria do estado de {establishment?.estado?.sigla || 'domicílio'}.</li>
          <li><strong>Municipal:</strong> consultar a prefeitura de {establishment?.cidade?.nome || 'domicílio'}.</li>
        </ul>
        <p className="print-report-note">A situação ativa do CNPJ não comprova ausência de dívidas. A regularidade depende das certidões vigentes emitidas pelos órgãos competentes.</p>
      </section>

      <section className="print-report-section print-report-analysis">
        <h2>Informações analíticas completas</h2>
        <p className="print-report-analysis-intro">
          A seção abaixo reproduz e organiza todos os campos disponíveis na resposta da consulta, incluindo dados adicionais, objetos e listas.
        </p>
        <div className="print-data-root">
          {Object.entries(data || {}).map(([key, value]) => (
            <PrintableDataNode key={key} label={key} value={value} />
          ))}
        </div>
      </section>

      <footer className="print-report-footer">Desenvolvido por Pilar Finanças by Filipe Henry</footer>
    </article>
  )
}

function LoginModal({ onClose, onAuthenticated }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#03060c]/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="login-title">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#0b111d] shadow-2xl shadow-black/60">
        <div className="grid lg:grid-cols-[0.82fr_1.18fr]">
          <div className="p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">Plano Básico</span>
                <h2 id="login-title" className="mt-4 text-2xl font-semibold text-white">Entre para consultar</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">A conta Google é gratuita e identifica com segurança seu plano atual.</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-lg text-slate-500 transition hover:text-white">×</button>
            </div>

            <div className="my-5 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-4 py-3 text-xs leading-5 text-slate-400">
              Consulte dados cadastrais e sócios no plano Básico. Certidões, indícios de dívidas e relatórios ficam disponíveis no Premium.
            </div>

            <GoogleAuthPanel onAuthenticated={onAuthenticated} allowDemo={false} />
            <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">Entrar não inicia nenhuma cobrança.</p>
          </div>
          <div className="border-t border-white/[0.08] bg-white/[0.015] p-4 sm:p-5 lg:border-l lg:border-t-0">
            <SampleReportPreview />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [cnpj, setCnpj] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const [billingStatus, setBillingStatus] = useState({
    plan: 'basic',
    premiumActive: false,
    activeUntil: null,
    subscriptionStatus: null,
    cancelable: false,
  })
  const [user, setUser] = useState(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [accountNotice, setAccountNotice] = useState('')
  const [pendingSearch, setPendingSearch] = useState('')
  const resultsRef = useRef(null)

  const loadAccount = useCallback(async () => {
    const [sessionResponse, billingResponse] = await Promise.all([
      fetch('/api/auth/session', { credentials: 'include' }),
      fetch('/api/billing/status', { credentials: 'include' }),
    ])

    if (sessionResponse.ok) {
      const sessionResult = await sessionResponse.json()
      setUser(sessionResult.user)
    } else {
      setUser(null)
    }

    if (billingResponse.ok) {
      const billingResult = await billingResponse.json()
      setBillingStatus(billingResult.billing)
    } else {
      setBillingStatus({ plan: 'basic', premiumActive: false, activeUntil: null, subscriptionStatus: null, cancelable: false })
    }
  }, [])

  useEffect(() => {
    loadAccount().catch(() => {})
  }, [loadAccount])

  const handleAuthenticated = useCallback((profile) => {
    setUser(profile)
    setAuthOpen(false)
    setAccountNotice(pendingSearch ? 'Login confirmado. Iniciando sua consulta...' : 'Login confirmado. Você já pode consultar gratuitamente.')
    loadAccount().catch(() => {})
  }, [loadAccount, pendingSearch])

  async function signOut() {
    try {
      await fetch('/api/auth/session', { method: 'POST', credentials: 'include' })
    } catch {
      // A interface encerra a sessão visual mesmo se a API local estiver indisponível.
    }
    window.google?.accounts?.id?.disableAutoSelect()
    setUser(null)
    setBillingStatus({ plan: 'basic', premiumActive: false, activeUntil: null, subscriptionStatus: null, cancelable: false })
    setAccountNotice('')
    setPendingSearch('')
  }

  async function cancelMonthlyRenewal() {
    if (!window.confirm('Deseja cancelar a renovação mensal? O Premium continuará disponível até o fim do período já pago.')) return

    setCancelLoading(true)
    setAccountNotice('')
    try {
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
        credentials: 'include',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Não foi possível cancelar a renovação.')
      await loadAccount()
      setAccountNotice('Renovação mensal cancelada. Seu acesso permanece ativo até a data indicada.')
    } catch (cancelError) {
      setAccountNotice(cancelError.message || 'Não foi possível cancelar a renovação agora.')
    } finally {
      setCancelLoading(false)
    }
  }

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

  const performSearch = useCallback(async (cleanCnpj) => {
    setLoading(true)
    setError('')
    setData(null)
    setShowRaw(false)
    setCopied(false)

    try {
      const response = await fetch(`${API_BASE_URL}/${cleanCnpj}`, {
        method: 'GET',
        credentials: 'include',
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
  }, [])

  useEffect(() => {
    if (!user || !pendingSearch) return
    const cleanCnpj = pendingSearch
    setPendingSearch('')
    performSearch(cleanCnpj)
  }, [pendingSearch, performSearch, user])

  async function handleSubmit(event) {
    event.preventDefault()
    const cleanCnpj = onlyDigits(cnpj)

    if (!validateCnpj(cleanCnpj)) {
      setError('Digite um CNPJ válido com 14 números.')
      setData(null)
      return
    }

    if (!user) {
      setPendingSearch(cleanCnpj)
      setAccountNotice('Entre gratuitamente com sua conta Google para continuar a consulta.')
      setAuthOpen(true)
      return
    }

    await performSearch(cleanCnpj)
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

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#060a12]/90 shadow-lg shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Voltar ao topo"
              title="Voltar ao topo"
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-emerald-300/20 bg-[#030711] shadow-glow transition hover:border-emerald-300/40 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              <img src="/pilar-financas-pro-logo.png" alt="" className="pointer-events-none absolute -left-[50px] -top-[17px] h-[72px] w-[216px] max-w-none" />
            </button>
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">Consulta CNPJ</p>
              <p className="text-xs text-slate-500">Dados públicos empresariais</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-2">
                {user.picture ? (
                  <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-lg" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/15 text-xs font-bold text-cyan-200">{user.name?.charAt(0) || '?'}</span>
                )}
                <div className="hidden max-w-28 text-left sm:block">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{user.name}</p>
                  <button type="button" onClick={signOut} className="text-[10px] text-slate-500 transition hover:text-rose-300">Sair</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAuthOpen(true)} className="rounded-xl border border-cyan-300/15 bg-cyan-300/[0.05] px-3.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/[0.1]">
                Entrar com Google
              </button>
            )}

            {user?.admin && (
              <a href="/premium-preview.html#admin-panel" className="inline-flex rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/[0.12] sm:px-3">
                <span className="hidden sm:inline">Painel Admin</span><span className="sm:hidden">Admin</span>
              </a>
            )}

            {billingStatus.premiumActive ? (
              <a href="/premium-preview.html" className="flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/[0.07] px-3 py-2 text-xs font-semibold text-violet-200 transition hover:bg-violet-300/[0.12]">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                Premium ativo
              </a>
            ) : (
              <a href="/premium-preview.html" className="rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">
                Seja Premium
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-[8.25rem] sm:px-6 sm:pt-[9.5rem] lg:px-8">
        {billingStatus.premiumActive && (
          <section className="mx-auto mb-8 max-w-4xl rounded-2xl border border-violet-300/20 bg-gradient-to-r from-violet-400/[0.1] via-indigo-400/[0.06] to-cyan-400/[0.06] px-5 py-4 shadow-lg shadow-violet-950/20 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-violet-200">
                <ShieldIcon />
                {billingStatus.plan === 'premium_monthly' ? 'Premium mensal confirmado' : 'Premium anual confirmado'}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Faça sua consulta completa com dados cadastrais, sócios, responsáveis, certidões e todos os campos disponíveis.
              </p>
            </div>
            <div className="mt-3 shrink-0 text-xs font-medium text-violet-200 sm:mt-0 sm:text-right">
              <div className="rounded-xl border border-violet-300/15 bg-black/15 px-3.5 py-2">
                Válido até {new Intl.DateTimeFormat('pt-BR').format(new Date(billingStatus.activeUntil))}
              </div>
              {billingStatus.plan === 'premium_monthly' && billingStatus.cancelable && (
                <button type="button" onClick={cancelMonthlyRenewal} disabled={cancelLoading} className="mt-2 text-[11px] text-slate-400 underline decoration-slate-600 underline-offset-4 transition hover:text-rose-300 disabled:cursor-wait disabled:opacity-60">
                  {cancelLoading ? 'Cancelando...' : 'Cancelar renovação'}
                </button>
              )}
              {billingStatus.plan === 'premium_monthly' && billingStatus.subscriptionStatus === 'cancelled' && (
                <p className="mt-2 text-[11px] text-amber-200/80">Renovação cancelada</p>
              )}
            </div>
          </section>
        )}

        {accountNotice && (
          <p role="status" className="mx-auto mb-8 max-w-4xl rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3 text-center text-xs text-violet-200">{accountNotice}</p>
        )}

        {!billingStatus.premiumActive && user && (
          <section className="mx-auto mb-8 max-w-4xl rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.05] px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-cyan-200">Plano Básico ativo</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-400">Você pode consultar gratuitamente. No Premium, tenha leitura integral, relatórios, histórico e acompanhamento.</p>
            </div>
            <a href="/premium-preview.html" className="mt-3 inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 sm:mt-0">
              Conhecer o Premium
            </a>
          </section>
        )}

        {!user && (
          <section className="mx-auto mb-8 max-w-4xl overflow-hidden rounded-2xl border border-cyan-300/25 bg-gradient-to-r from-cyan-300/[0.11] via-sky-300/[0.06] to-indigo-300/[0.08] shadow-lg shadow-cyan-950/20 sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div className="self-stretch bg-cyan-300 px-2 py-1 text-center text-[10px] font-black uppercase tracking-[0.18em] text-slate-950 sm:grid sm:w-12 sm:place-items-center sm:px-0 sm:py-3 sm:[writing-mode:vertical-rl]">
              Acesso
            </div>
            <div className="px-5 py-4 sm:flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-cyan-200">Login obrigatório para pesquisar</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-300">Entre gratuitamente com sua conta Google. O login libera a consulta Básica e não inicia nenhuma cobrança.</p>
            </div>
            <button type="button" onClick={() => setAuthOpen(true)} className="mx-5 mb-5 inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300 px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:bg-cyan-200 sm:mx-0 sm:mb-0 sm:mr-5">
              Entrar com Google agora
            </button>
          </section>
        )}

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
          {!user ? (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="mb-3 flex w-full items-center justify-between gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-3 text-left transition hover:bg-cyan-300/[0.12]"
            >
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.12em] text-cyan-200">Antes de pesquisar</span>
                <span className="mt-1 block text-sm text-slate-300">Faça login gratuito com o Google para consultar.</span>
              </span>
              <span className="shrink-0 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-bold text-slate-950">Fazer login</span>
            </button>
          ) : (
            <div className="mb-3 flex items-center gap-2 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-200">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-300 text-[11px] font-black text-slate-950">✓</span>
              Login confirmado. Sua consulta será vinculada à conta {user.email}.
            </div>
          )}
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
                  {user ? 'Consultar' : 'Entrar para consultar'}
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

                  {billingStatus.premiumActive && (
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                    >
                      Gerar relatório PDF
                    </button>
                  )}

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

            <PartnersSection
              partners={data.socios}
              responsibleRole={data.qualificacao_do_responsavel?.descricao || data.qualificacao_do_responsavel}
            />

            {billingStatus.premiumActive ? (
              <RegularitySection establishment={establishment} />
            ) : (
              <section className="rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.08] to-[#0b111d] p-5 shadow-2xl shadow-black/20 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-2xl">
                    <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">Recurso Premium</span>
                    <h2 className="mt-4 text-xl font-semibold text-white">Certidões e indícios de dívidas</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Desbloqueie os acessos organizados para consultas Federal, Trabalhista, FGTS, Estadual e Municipal.</p>
                  </div>
                  <a href="/premium-preview.html" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
                    Liberar no Premium
                  </a>
                </div>
              </section>
            )}

            <PropertyRegistrySection
              data={data}
              establishment={establishment}
              premiumActive={billingStatus.premiumActive}
            />

            {billingStatus.premiumActive ? (
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
            ) : (
              <section className="overflow-hidden rounded-3xl border border-violet-300/15 bg-gradient-to-br from-violet-400/[0.08] to-[#0b111d] p-5 shadow-2xl shadow-black/20 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="max-w-2xl">
                    <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">Disponível no Premium</span>
                    <h2 className="mt-4 text-xl font-semibold text-white">Aprofunde sua análise empresarial</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Desbloqueie a leitura integral de todos os campos, relatórios profissionais, histórico de consultas e futuros alertas cadastrais.</p>
                  </div>
                  <a href="/premium-preview.html" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110">
                    Tornar-se Premium
                  </a>
                </div>
              </section>
            )}

            {billingStatus.premiumActive && (
              <PrintableReport
                data={data}
                establishment={establishment}
                phones={phones}
                stateRegistrations={stateRegistrations}
              />
            )}
          </div>
        )}

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

      {authOpen && <LoginModal onClose={() => setAuthOpen(false)} onAuthenticated={handleAuthenticated} />}
    </div>
  )
}
