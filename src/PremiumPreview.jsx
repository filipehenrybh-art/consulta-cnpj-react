import { useCallback, useEffect, useState } from 'react'
import GoogleAuthPanel from './components/GoogleAuthPanel.jsx'
import AdminCourtesyPanel from './components/AdminCourtesyPanel.jsx'
import {
  CheckIcon,
  ChevronIcon,
  ShieldIcon,
  UsersIcon,
} from './components/Icons.jsx'

const plans = {
  basic: {
    name: 'Básico',
    eyebrow: 'Consulta essencial',
    price: 'Grátis',
    description: 'Para consultas rápidas de dados cadastrais públicos.',
    button: 'Continuar no Básico',
    features: [
      'Dados cadastrais e situação do CNPJ',
      'Endereço, CNAE e contatos',
      'Sócios e responsáveis disponíveis',
      'Resumo cadastral organizado',
    ],
  },
  premium: {
    name: 'Premium',
    eyebrow: 'Análise e acompanhamento',
    description: 'Para quem consulta empresas com frequência e precisa organizar decisões.',
    button: 'Experimentar Premium',
    features: [
      'Tudo do plano Básico',
      'Relatório profissional em PDF',
      'Histórico e organização de consultas',
      'Monitoramento de alterações cadastrais',
      'Checklist de certidões e vencimentos',
      'Até 100 consultas detalhadas por mês',
    ],
  },
}

const billingOptions = {
  monthly: {
    label: 'Mensal',
    price: 'R$ 19,90',
    suffix: '/mês',
    detail: 'Cobrança recorrente mensal',
  },
  annual: {
    label: 'Anual',
    price: 'R$ 200,00',
    suffix: '/ano à vista',
    detail: 'Economize R$ 38,80 por ano',
  },
}

const mercadoPagoPublicKey = String(import.meta.env.VITE_MERCADO_PAGO_PUBLIC_KEY || '').trim()
const mercadoPagoSandbox = import.meta.env.DEV
  || String(import.meta.env.VITE_MERCADO_PAGO_USE_SANDBOX || '').trim().toLowerCase() === 'true'
let mercadoPagoSdkPromise

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve()
  if (mercadoPagoSdkPromise) return mercadoPagoSdkPromise

  mercadoPagoSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-mercado-pago-sdk]')
    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', () => reject(new Error('Não foi possível carregar o formulário seguro do Mercado Pago.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.dataset.mercadoPagoSdk = 'true'
    script.addEventListener('load', resolve, { once: true })
    script.addEventListener('error', () => reject(new Error('Não foi possível carregar o formulário seguro do Mercado Pago.')), { once: true })
    document.head.appendChild(script)
  })

  return mercadoPagoSdkPromise
}

const comparison = [
  ['Dados cadastrais completos', true, true],
  ['Sócios e responsáveis', true, true],
  ['Certidões e indícios de dívidas', false, true],
  ['Relatório em PDF com identidade visual', false, true],
  ['Histórico de empresas consultadas', false, true],
  ['Alertas de mudanças cadastrais', false, true],
  ['Controle de validade das certidões', false, true],
  ['Experiência sem anúncios', false, true],
]

const partners = [
  ['ANA CAROLINA MARTINS', 'Sócia-administradora'],
  ['FILIPE ALMEIDA SANTOS', 'Sócio'],
  ['PILAR PARTICIPAÇÕES LTDA.', 'Sócia pessoa jurídica'],
]

async function readApiJson(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    if (response.status === 404) {
      throw new Error(mercadoPagoSandbox
        ? 'O servidor local de pagamentos está desatualizado. Feche os terminais antigos e execute npm.cmd run dev:full novamente.'
        : 'O serviço de pagamentos está temporariamente indisponível. Tente novamente em alguns instantes.')
    }
    throw new Error(mercadoPagoSandbox
      ? 'O servidor local retornou uma resposta inválida. Reinicie o projeto e tente novamente.'
      : 'O serviço de pagamentos retornou uma resposta inválida. Tente novamente em alguns instantes.')
  }
}

function PlanCard({
  id,
  selected,
  onSelect,
  billing,
  onBillingChange,
  authenticated,
  checkoutLoading,
  premiumActive,
}) {
  const plan = plans[id]
  const isPremium = id === 'premium'
  const offer = isPremium ? billingOptions[billing] : { price: plan.price }

  return (
    <article className={`relative flex h-full flex-col rounded-3xl border p-5 transition sm:p-6 ${
      selected
        ? isPremium
          ? 'border-violet-300/40 bg-gradient-to-b from-violet-400/[0.12] to-[#0b111d] shadow-[0_24px_80px_rgba(139,92,246,0.13)]'
          : 'border-cyan-300/35 bg-gradient-to-b from-cyan-400/[0.09] to-[#0b111d]'
        : 'border-white/[0.08] bg-[#0b111d]/80 hover:border-white/[0.14]'
    }`}>
      {isPremium && (
        <span className="absolute right-5 top-5 rounded-full border border-violet-300/25 bg-violet-300/[0.1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-violet-200">
          Recomendado
        </span>
      )}
      <p className={`text-xs font-semibold uppercase tracking-[0.14em] ${isPremium ? 'text-violet-300' : 'text-cyan-300'}`}>{plan.eyebrow}</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">{plan.name}</h2>
      {isPremium && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-white/[0.08] bg-black/15 p-1">
          {Object.entries(billingOptions).map(([key, option]) => (
            <button
              key={key}
              type="button"
              onClick={() => onBillingChange(key)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${billing === key ? 'bg-violet-400 text-white' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      <div className={`${isPremium ? 'mt-4' : 'mt-4'} flex items-end gap-1`}>
        <strong className="text-3xl font-semibold tracking-[-0.04em] text-white">{offer.price}</strong>
        {offer.suffix && <span className="pb-1 text-sm text-slate-500">{offer.suffix}</span>}
      </div>
      {isPremium && <p className="mt-1 text-xs font-medium text-violet-300/80">{offer.detail}</p>}
      <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{plan.description}</p>

      <ul className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-300">
            <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${isPremium ? 'bg-violet-400/15 text-violet-300' : 'bg-cyan-400/15 text-cyan-300'}`}>
              <CheckIcon className="h-3.5 w-3.5" />
            </span>
            {feature}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => {
          if (isPremium && premiumActive) window.location.assign('/')
          else onSelect(id)
        }}
        disabled={checkoutLoading}
        className={`mt-7 min-h-12 rounded-xl px-4 py-3 text-sm font-semibold transition ${
          selected
            ? isPremium
              ? 'bg-gradient-to-r from-violet-400 to-indigo-400 text-white shadow-lg shadow-violet-500/10 hover:brightness-110'
              : 'bg-gradient-to-r from-cyan-400 to-sky-500 text-slate-950 hover:brightness-110'
            : 'border border-white/[0.1] bg-white/[0.03] text-slate-300 hover:bg-white/[0.06]'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {checkoutLoading && isPremium
          ? 'Preparando pagamento...'
          : isPremium && premiumActive
            ? 'Clique aqui e faça sua consulta completa'
            : isPremium && selected && !authenticated
              ? 'Entrar para continuar'
              : isPremium && selected && authenticated
                ? billing === 'annual'
                  ? mercadoPagoSandbox ? 'Pagar em ambiente de teste' : 'Pagar plano anual'
                  : mercadoPagoSandbox ? 'Assinar em ambiente de teste' : 'Assinar Premium Mensal'
                : selected ? `${plan.name} selecionado` : plan.button}
      </button>
    </article>
  )
}

function AuthModal({ billing, onClose, onAuthenticated }) {
  const offer = billingOptions[billing]

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#03060c]/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <div className="w-full max-w-md rounded-3xl border border-white/[0.1] bg-[#0b111d] p-5 shadow-2xl shadow-black/60 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">Premium</span>
            <h2 id="auth-title" className="mt-4 text-2xl font-semibold text-white">Entre para continuar</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">Sua conta será usada para organizar consultas, relatórios e sua assinatura.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-lg text-slate-500 transition hover:text-white">×</button>
        </div>

        <div className="my-5 flex items-center justify-between gap-4 rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3">
          <div>
            <p className="text-xs text-slate-500">Plano selecionado</p>
            <p className="mt-1 text-sm font-semibold text-violet-200">Premium {offer.label}</p>
          </div>
          <p className="text-right text-sm font-semibold text-white">{offer.price}<span className="ml-1 text-xs font-normal text-slate-500">{offer.suffix}</span></p>
        </div>

        <GoogleAuthPanel onAuthenticated={onAuthenticated} />
        <p className="mt-5 text-center text-[11px] leading-5 text-slate-600">
          {mercadoPagoSandbox
            ? 'Esta é uma validação no Sandbox do Mercado Pago. Nenhum dinheiro real será movimentado.'
            : 'Ao continuar, você poderá contratar o plano selecionado com pagamento processado pelo Mercado Pago.'}
        </p>
      </div>
    </div>
  )
}

function MonthlyCardModal({ user, loading, onClose, onAuthorized }) {
  const [brickReady, setBrickReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mercadoPagoPublicKey) return undefined
    let active = true
    let controller

    loadMercadoPagoSdk()
      .then(async () => {
        if (!active) return
        const mercadoPago = new window.MercadoPago(mercadoPagoPublicKey, { locale: 'pt-BR' })
        controller = await mercadoPago.bricks().create('cardPayment', 'monthly-card-payment-brick', {
          initialization: {
            amount: 19.9,
            payer: { email: user?.email || '' },
          },
          customization: {
            visual: { style: { theme: 'dark' } },
            paymentMethods: { minInstallments: 1, maxInstallments: 1 },
          },
          callbacks: {
            onReady: () => {
              if (active) setBrickReady(true)
            },
            onSubmit: async (formData) => {
              setError('')
              try {
                if (!formData?.token) throw new Error('O Mercado Pago não gerou o token seguro do cartão.')
                await onAuthorized(formData.token)
              } catch (submitError) {
                setError(submitError.message || 'Não foi possível autorizar o cartão.')
                throw submitError
              }
            },
            onError: () => {
              if (active) setError(mercadoPagoSandbox
                ? 'Confira os dados do cartão de teste e tente novamente.'
                : 'Não foi possível validar os dados do cartão. Confira as informações e tente novamente.')
            },
          },
        })
      })
      .catch((sdkError) => {
        if (active) setError(sdkError.message || 'Não foi possível abrir o formulário seguro.')
      })

    return () => {
      active = false
      if (controller?.unmount) Promise.resolve(controller.unmount()).catch(() => {})
    }
  }, [onAuthorized, user?.email])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#03060c]/85 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="monthly-card-title">
      <div className="my-6 w-full max-w-xl rounded-3xl border border-white/[0.1] bg-[#0b111d] p-5 shadow-2xl shadow-black/60 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-violet-200">
              {mercadoPagoSandbox ? 'Sandbox seguro' : 'Pagamento seguro'}
            </span>
            <h2 id="monthly-card-title" className="mt-4 text-2xl font-semibold text-white">Assinar Premium Mensal</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">R$ 19,90 por mês. Os dados do cartão são tratados diretamente pelo Mercado Pago.</p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} aria-label="Fechar" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/[0.08] text-lg text-slate-500 transition hover:text-white disabled:opacity-40">×</button>
        </div>

        {!mercadoPagoPublicKey ? (
          <div className="mt-6 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-4 text-sm leading-6 text-amber-100/80">
            {mercadoPagoSandbox
              ? <>Adicione a Public Key do vendedor de teste em <code>VITE_MERCADO_PAGO_PUBLIC_KEY</code> no arquivo <code>.env</code> e reinicie o projeto.</>
              : 'O pagamento mensal está temporariamente indisponível. Tente novamente em alguns instantes.'}
          </div>
        ) : (
          <div className="relative mt-6 min-h-48 rounded-2xl bg-white p-3 sm:p-4">
            {!brickReady && <p className="absolute inset-0 grid place-items-center text-sm text-slate-600">Carregando formulário seguro...</p>}
            <div id="monthly-card-payment-brick" className={brickReady ? '' : 'opacity-0'} />
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-xs text-rose-200">{error}</p>}
        <p className="mt-4 text-center text-[11px] leading-5 text-slate-600">
          {mercadoPagoSandbox && 'Use somente os cartões oficiais de teste. '}
          Nenhum dado completo do cartão passa pelo servidor da Pilar Finanças.
        </p>
      </div>
    </div>
  )
}

function AccessBadge({ premium }) {
  return premium ? (
    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Liberado</span>
  ) : (
    <span className="rounded-full border border-slate-300/10 bg-slate-300/[0.04] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Premium</span>
  )
}

function ResultPreview({ plan, premiumActive }) {
  const premium = plan === 'premium'

  return (
    <section className="overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b111d]/90 shadow-2xl shadow-black/25">
      <div className={`border-b border-white/[0.07] px-5 py-5 sm:px-7 ${premium ? 'bg-gradient-to-r from-violet-400/[0.09] via-transparent to-indigo-400/[0.08]' : 'bg-gradient-to-r from-cyan-400/[0.07] via-transparent to-sky-400/[0.05]'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">Ativa</span>
              <span className="text-xs text-slate-500">CNPJ 12.345.678/0001-90</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-white sm:text-2xl">PILAR SOLUÇÕES FINANCEIRAS LTDA.</h2>
            <p className="mt-1 text-sm text-slate-400">Pilar Finanças</p>
          </div>
          <div className={`w-fit rounded-xl border px-3.5 py-2 text-xs font-semibold ${premium ? 'border-violet-300/20 bg-violet-300/[0.07] text-violet-200' : 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-200'}`}>
            Visualização {plans[plan].name}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
        {[
          ['Situação', 'Ativa'],
          ['Capital social', 'R$ 100.000,00'],
          ['Cidade / UF', 'São Paulo / SP'],
          ['CNAE principal', 'Consultoria em gestão'],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
            <p className="mt-1.5 text-sm text-slate-200">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-white/[0.06] p-5 sm:p-7 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-indigo-300">
              <UsersIcon />
              <h3 className="text-sm font-semibold text-slate-100">Sócios e responsáveis</h3>
            </div>
            <span className="text-xs text-slate-500">3 registros</span>
          </div>
          <div className="mt-4 space-y-2.5">
            {partners.map(([name, role], index) => {
              const locked = !premium && index > 0
              return (
                <div key={name} className={`relative rounded-xl border border-white/[0.06] bg-black/10 px-3.5 py-3 ${locked ? 'overflow-hidden' : ''}`}>
                  <p className={`text-sm font-medium text-slate-200 ${locked ? 'select-none blur-[5px]' : ''}`}>{name}</p>
                  <p className={`mt-0.5 text-xs text-slate-500 ${locked ? 'select-none blur-[5px]' : ''}`}>{role}</p>
                  {locked && <span className="absolute inset-0 grid place-items-center text-[10px] font-bold uppercase tracking-wider text-violet-300">Disponível no Premium</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className={`relative rounded-2xl border p-4 ${premium ? 'border-violet-300/15 bg-violet-300/[0.04]' : 'overflow-hidden border-white/[0.07] bg-white/[0.025]'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-violet-300">
              <ShieldIcon />
              <h3 className="text-sm font-semibold text-slate-100">Central de regularidade</h3>
            </div>
            <AccessBadge premium={premium} />
          </div>
          <div className={`mt-4 space-y-3 ${premium ? '' : 'select-none blur-[5px]'}`}>
            {[
              ['Certidão Federal', 'Válida até 18/09/2026', 'text-emerald-300'],
              ['CNDT Trabalhista', 'Revisar em 12 dias', 'text-amber-300'],
              ['Regularidade FGTS', 'Consulta pendente', 'text-slate-400'],
            ].map(([title, status, color]) => (
              <div key={title} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/10 px-3.5 py-3">
                <p className="text-xs font-medium text-slate-300">{title}</p>
                <p className={`text-right text-[11px] ${color}`}>{status}</p>
              </div>
            ))}
          </div>
          {!premium && (
            <div className="absolute inset-0 grid place-items-center bg-[#0b111d]/55 p-6 text-center backdrop-blur-[1px]">
              <div>
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full border border-violet-300/20 bg-violet-300/[0.09] text-violet-300"><ShieldIcon /></span>
                <p className="mt-3 text-sm font-semibold text-white">Organize certidões no Premium</p>
                <p className="mt-1 text-xs leading-5 text-slate-400">A emissão continua sendo realizada nas fontes oficiais.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.06] bg-black/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <p className="text-xs text-slate-500">Demonstração visual — nenhuma compra ou consulta real será realizada.</p>
        <button type="button" onClick={() => window.location.assign('/')} disabled={!premiumActive} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-400 to-indigo-400 px-4 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-30">
          {premiumActive ? 'Fazer consulta e gerar PDF' : 'Relatório PDF no Premium'}
          <ChevronIcon />
        </button>
      </div>
    </section>
  )
}

export default function PremiumPreview() {
  const [selectedPlan, setSelectedPlan] = useState('basic')
  const [billing, setBilling] = useState('monthly')
  const [notice, setNotice] = useState('')
  const [authOpen, setAuthOpen] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [monthlyCardOpen, setMonthlyCardOpen] = useState(false)
  const [billingStatus, setBillingStatus] = useState({
    plan: 'basic',
    premiumActive: false,
    activeUntil: null,
    subscriptionStatus: null,
    cancelable: false,
    courtesy: false,
  })
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('premium-preview-user'))
    } catch {
      return null
    }
  })

  const handleAuthenticated = useCallback((profile) => {
    if (profile.demo) localStorage.setItem('premium-preview-user', JSON.stringify(profile))
    else localStorage.removeItem('premium-preview-user')
    setUser(profile)
    setAuthOpen(false)
    setSelectedPlan('premium')
    setNotice(profile.demo ? 'Acesso simulado concluído. Nenhuma conta real foi autenticada.' : `Acesso Google concluído como ${profile.name}.`)
  }, [])

  const loadBillingStatus = useCallback(async () => {
    const response = await fetch('/api/billing/status', { credentials: 'include' })
    if (!response.ok) return null
    const result = await readApiJson(response)
    setBillingStatus(result.billing)
    if (result.billing?.premiumActive) setSelectedPlan('premium')
    return result.billing
  }, [])

  const authorizeMonthlyCard = useCallback(async (cardToken) => {
    setCheckoutLoading(true)
    setNotice('Autorizando a assinatura mensal com o token seguro do cartão...')
    try {
      const response = await fetch('/api/billing/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardToken }),
      })
      const result = await readApiJson(response)
      if (!response.ok) throw new Error(result.error || 'Não foi possível autorizar a assinatura.')
      setMonthlyCardOpen(false)
      setNotice('Assinatura autorizada. O Premium será liberado quando a primeira cobrança for aprovada pelo Mercado Pago.')
      await loadBillingStatus().catch(() => null)
    } finally {
      setCheckoutLoading(false)
    }
  }, [loadBillingStatus])

  useEffect(() => {
    let active = true
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return null
        const result = await readApiJson(response)
        return result.user
      })
      .then((sessionUser) => {
        if (active && sessionUser) {
          setUser(sessionUser)
          loadBillingStatus().catch(() => {})
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [loadBillingStatus])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const paymentResult = searchParams.get('payment')
    const subscriptionResult = searchParams.get('subscription')
    if (!paymentResult && !subscriptionResult) return undefined

    const messages = {
      success: 'Pagamento recebido pelo Mercado Pago. Confirmando a liberação do Premium...',
      pending: 'Pagamento pendente. No Pix, a liberação acontece após a confirmação do banco.',
      failure: 'O pagamento não foi concluído. Você pode tentar novamente quando desejar.',
    }
    setNotice(subscriptionResult
      ? 'Assinatura enviada ao Mercado Pago. Confirmando a autorização e a primeira cobrança...'
      : messages[paymentResult] || '')
    if (paymentResult === 'failure') return undefined

    let attempts = 0
    const interval = window.setInterval(async () => {
      attempts += 1
      const status = await loadBillingStatus().catch(() => null)
      if (status?.premiumActive) {
        setNotice('Pagamento confirmado. O Premium já está ativo nesta conta Google.')
        window.clearInterval(interval)
      } else if (attempts >= 10) {
        window.clearInterval(interval)
      }
    }, 3000)
    return () => window.clearInterval(interval)
  }, [loadBillingStatus, user])

  async function startCheckout() {
    if (billing === 'monthly') {
      setNotice(mercadoPagoSandbox
        ? 'Preencha o formulário seguro para autorizar a assinatura mensal de teste.'
        : 'Preencha o formulário seguro para contratar a assinatura mensal.')
      setMonthlyCardOpen(true)
      setCheckoutLoading(false)
      return
    }

    setCheckoutLoading(true)
    setNotice(mercadoPagoSandbox
      ? 'Preparando o checkout seguro em ambiente de teste...'
      : 'Preparando o checkout seguro do Mercado Pago...')
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: billing === 'monthly' ? 'premium_monthly' : 'premium_annual' }),
      })
      const result = await readApiJson(response)
      if (!response.ok) throw new Error(result.error || 'Não foi possível iniciar o pagamento.')
      window.location.assign(result.checkoutUrl)
    } catch (error) {
      setNotice(error.message || 'Não foi possível iniciar o pagamento.')
      setCheckoutLoading(false)
    }
  }

  function choosePlan(plan) {
    setSelectedPlan(plan)
    if (plan === 'premium' && !user) {
      setAuthOpen(true)
      setNotice('')
      return
    }
    if (plan === 'premium' && user?.demo) {
      setNotice('A simulação visual não pode iniciar pagamentos. Entre com uma conta Google real.')
      return
    }
    if (plan === 'premium' && billingStatus.premiumActive) {
      window.location.assign('/')
      return
    }
    if (plan === 'premium') {
      startCheckout()
      return
    }
    setNotice('')
  }

  async function cancelMonthlySubscription() {
    const accessUntil = billingStatus.activeUntil
      ? new Intl.DateTimeFormat('pt-BR').format(new Date(billingStatus.activeUntil))
      : 'o fim do período já pago'
    const confirmed = window.confirm(
      `Deseja cancelar a renovação mensal? Não haverá novas cobranças e seu acesso Premium continuará até ${accessUntil}.`,
    )
    if (!confirmed) return

    setCancelLoading(true)
    setNotice('Cancelando a renovação mensal...')
    try {
      const response = await fetch('/api/billing/cancel', {
        method: 'POST',
        credentials: 'include',
      })
      const result = await readApiJson(response)
      if (!response.ok) throw new Error(result.error || 'Não foi possível cancelar a renovação agora.')

      const updatedStatus = await loadBillingStatus().catch(() => null)
      const updatedUntil = updatedStatus?.activeUntil
        ? new Intl.DateTimeFormat('pt-BR').format(new Date(updatedStatus.activeUntil))
        : accessUntil
      setNotice(`Renovação mensal cancelada. Não haverá novas cobranças e o Premium continuará ativo até ${updatedUntil}.`)
    } catch (error) {
      setNotice(error.message || 'Não foi possível cancelar a renovação agora.')
    } finally {
      setCancelLoading(false)
    }
  }

  async function signOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // A sessão visual também é encerrada se o servidor local estiver indisponível.
    }
    localStorage.removeItem('premium-preview-user')
    window.google?.accounts?.id?.disableAutoSelect()
    setUser(null)
    setBillingStatus({ plan: 'basic', premiumActive: false, activeUntil: null, subscriptionStatus: null, cancelable: false, courtesy: false })
    setSelectedPlan('basic')
    setNotice(mercadoPagoSandbox ? 'Sessão local encerrada.' : 'Sessão encerrada.')
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-[-24rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-violet-500/[0.06] blur-3xl" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#060a12]/90 shadow-lg shadow-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Voltar ao topo"
              title="Voltar ao topo"
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-emerald-300/20 bg-[#030711] transition hover:border-emerald-300/40 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              <img src="/pilar-financas-pro-logo.png" alt="" className="pointer-events-none absolute -left-[50px] -top-[17px] h-[72px] w-[216px] max-w-none" />
            </button>
            <div>
              <p className="text-sm font-semibold text-white">Consulta CNPJ</p>
              <p className="text-xs text-slate-500">Pilar Finanças</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user?.admin && (
              <a href="#admin-panel" className="inline-flex rounded-xl border border-amber-300/20 bg-amber-300/[0.07] px-2.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-300/[0.12] sm:px-3">
                <span className="hidden sm:inline">Painel Admin</span><span className="sm:hidden">Admin</span>
              </a>
            )}
            {user ? (
              <div className="hidden items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] py-1.5 pl-1.5 pr-2 sm:flex">
                {user.picture ? (
                  <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-7 w-7 rounded-lg" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-400/15 text-xs font-bold text-violet-200">{user.name.charAt(0)}</span>
                )}
                <div className="max-w-32 text-left">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{user.name}</p>
                  {user.admin && <p className="text-[9px] font-bold uppercase tracking-wider text-amber-300">Administrador</p>}
                  <button type="button" onClick={signOut} className="text-[10px] text-slate-500 transition hover:text-rose-300">Sair</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setAuthOpen(true)} className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-3.5 py-2 text-xs font-medium text-violet-200 transition hover:bg-violet-300/[0.1]">
                Entrar
              </button>
            )}
            <a href="/" className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-slate-400 transition hover:text-cyan-200">
              Voltar à versão atual
            </a>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-4 pb-20 pt-[7.5rem] sm:px-6 sm:pt-[8.5rem] lg:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-violet-300/20 bg-violet-300/[0.07] px-3 py-1.5 text-xs font-semibold text-violet-200">
            {mercadoPagoSandbox ? 'Backtest local — Mercado Pago Sandbox' : 'Planos Premium — pagamento seguro'}
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl">
            Uma consulta para cada{' '}
            <span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">momento do seu negócio</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-slate-400">
            Mantenha a consulta essencial gratuita e ofereça ferramentas de organização, relatórios e acompanhamento para usuários Premium.
          </p>
        </section>

        {user?.admin && <AdminCourtesyPanel />}

        <section className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
          <PlanCard
            id="basic"
            selected={selectedPlan === 'basic'}
            onSelect={choosePlan}
            authenticated={Boolean(user)}
            checkoutLoading={checkoutLoading}
            premiumActive={billingStatus.premiumActive}
          />
          <PlanCard
            id="premium"
            selected={selectedPlan === 'premium'}
            onSelect={choosePlan}
            billing={billing}
            onBillingChange={setBilling}
            authenticated={Boolean(user)}
            checkoutLoading={checkoutLoading}
            premiumActive={billingStatus.premiumActive}
          />
        </section>

        {notice && <p role="status" className="mx-auto mt-4 max-w-5xl rounded-xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3 text-center text-xs text-violet-200">{notice}</p>}

        {mercadoPagoSandbox ? (
          <p className="mx-auto mt-4 max-w-5xl rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-center text-xs leading-5 text-amber-100/80">
            No Sandbox, abra esta página em uma janela anônima e entre no Mercado Pago com uma conta de teste do tipo Comprador. Não utilize sua conta Mercado Pago real.
          </p>
        ) : (
          <p className="mx-auto mt-4 max-w-5xl rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-center text-xs leading-5 text-emerald-100/80">
            Pagamentos processados com segurança pelo Mercado Pago. O acesso Premium é vinculado à conta Google autenticada.
          </p>
        )}

        {billingStatus.premiumActive && (
          <p className="mx-auto mt-4 max-w-5xl rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-center text-xs text-emerald-200">
            Premium {billingStatus.courtesy ? 'de cortesia' : billingStatus.plan === 'premium_monthly' ? 'mensal' : 'anual'} ativo nesta conta Google{billingStatus.activeUntil ? ` até ${new Intl.DateTimeFormat('pt-BR').format(new Date(billingStatus.activeUntil))}` : ' sem prazo de expiração'}.
          </p>
        )}

        {billingStatus.cancelable && (
          <div className="mx-auto mt-2 max-w-5xl text-center">
            <button
              type="button"
              onClick={cancelMonthlySubscription}
              disabled={cancelLoading}
              className="text-[11px] text-slate-600 underline decoration-slate-700 underline-offset-4 transition hover:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelLoading ? 'Cancelando renovação...' : 'Cancelar renovação mensal'}
            </button>
          </div>
        )}

        {billingStatus.premiumActive && billingStatus.subscriptionStatus === 'cancelled' && (
          <p className="mx-auto mt-3 max-w-5xl text-center text-[11px] text-slate-500">
            Renovação mensal cancelada. Seu acesso permanece disponível até o fim do período já pago.
          </p>
        )}

        <section className="mt-14">
          <div className="mb-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300/80">Experiência comparada</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Veja o resultado em cada plano</h2>
          </div>
          <div className="mx-auto mb-5 flex w-fit rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            {Object.keys(plans).map((plan) => (
              <button key={plan} type="button" onClick={() => setSelectedPlan(plan)} className={`rounded-lg px-5 py-2 text-sm font-semibold transition ${selectedPlan === plan ? (plan === 'premium' ? 'bg-violet-400 text-white' : 'bg-cyan-400 text-slate-950') : 'text-slate-500 hover:text-slate-300'}`}>
                {plans[plan].name}
              </button>
            ))}
          </div>
          <ResultPreview plan={selectedPlan} premiumActive={billingStatus.premiumActive} />
        </section>

        <section className="mx-auto mt-14 max-w-5xl overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b111d]/85">
          <div className="border-b border-white/[0.07] px-5 py-5 sm:px-7">
            <h2 className="text-xl font-semibold text-white">Comparação completa</h2>
            <p className="mt-1 text-sm text-slate-500">Proposta inicial de divisão dos recursos.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-white/[0.06] text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold sm:px-7">Recurso</th>
                  <th className="w-28 px-4 py-4 text-center font-semibold">Básico</th>
                  <th className="w-28 px-4 py-4 text-center font-semibold text-violet-300">Premium</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {comparison.map(([feature, basic, premium]) => (
                  <tr key={feature}>
                    <td className="px-5 py-4 text-slate-300 sm:px-7">{feature}</td>
                    <td className="px-4 py-4 text-center"><span className={basic ? 'text-emerald-300' : 'text-slate-700'}>{basic ? '✓' : '—'}</span></td>
                    <td className="px-4 py-4 text-center"><span className={premium ? 'text-violet-300' : 'text-slate-700'}>{premium ? '✓' : '—'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={`mx-auto mt-6 max-w-5xl rounded-2xl border px-5 py-4 text-xs leading-5 ${mercadoPagoSandbox ? 'border-amber-300/10 bg-amber-300/[0.04] text-amber-100/70' : 'border-white/[0.08] bg-white/[0.03] text-slate-400'}`}>
          {mercadoPagoSandbox
            ? 'O plano anual usa o checkout de testes do Mercado Pago. O Premium só é liberado depois da confirmação assinada por Webhook e permanece vinculado à conta Google autenticada. Não utilize cartões ou Pix reais durante o backtest.'
            : 'O Premium é liberado depois da confirmação do pagamento pelo Mercado Pago e permanece vinculado à conta Google autenticada. Compras anuais são cobradas à vista; assinaturas mensais são recorrentes.'}
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] px-4 py-7 text-center text-xs text-slate-600">
        <p>Desenvolvido por Pilar Finanças by Filipe Henry</p>
        <p className="mt-2">{mercadoPagoSandbox ? 'Prévia comercial — ambiente local de testes.' : 'Consulta CNPJ — Pilar Finanças Pro.'}</p>
      </footer>

      {authOpen && <AuthModal billing={billing} onClose={() => setAuthOpen(false)} onAuthenticated={handleAuthenticated} />}
      {monthlyCardOpen && (
        <MonthlyCardModal
          user={user}
          loading={checkoutLoading}
          onClose={() => setMonthlyCardOpen(false)}
          onAuthorized={authorizeMonthlyCard}
        />
      )}
    </div>
  )
}
