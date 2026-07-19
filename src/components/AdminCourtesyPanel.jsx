import { useCallback, useEffect, useState } from 'react'

async function readJson(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('O servidor retornou uma resposta inválida.')
  }
}

function futureDate(days) {
  if (!days) return null
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + Number(days))
  return date.toISOString()
}

function courtesyDescription(user) {
  if (!user.billing?.courtesy) return 'Sem cortesia ativa'
  if (!user.billing.activeUntil) return 'Cortesia permanente'
  return `Cortesia até ${new Intl.DateTimeFormat('pt-BR').format(new Date(user.billing.activeUntil))}`
}

function formatDateTime(value) {
  if (!value) return 'Ainda não registrado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Data indisponível'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function activityInfo(user) {
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : 0
  const lastLogout = user.lastLogoutAt ? new Date(user.lastLogoutAt).getTime() : 0
  const explicitlyLoggedOut = lastLogout && lastLogout >= lastSeen
  const elapsed = lastSeen ? Date.now() - lastSeen : Number.POSITIVE_INFINITY

  if (!explicitlyLoggedOut && elapsed <= 15 * 60 * 1000) {
    return { active: true, label: 'Ativo recentemente', className: 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200' }
  }
  if (elapsed <= 24 * 60 * 60 * 1000) {
    return { active: false, label: 'Visto hoje', className: 'border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-200' }
  }
  return { active: false, label: 'Offline', className: 'border-white/[0.08] bg-white/[0.03] text-slate-500' }
}

function planDescription(user) {
  if (!user.billing?.premiumActive) return 'Básico'
  if (user.billing.courtesy) return 'Premium cortesia'
  if (user.billing.plan === 'premium_monthly') return 'Premium mensal'
  return 'Premium anual'
}

export default function AdminCourtesyPanel() {
  const [email, setEmail] = useState('')
  const [duration, setDuration] = useState('30')
  const [note, setNote] = useState('')
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const searchUsers = useCallback(async (query = '') => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/admin/users?email=${encodeURIComponent(query.trim())}`, {
        credentials: 'include',
      })
      const result = await readJson(response)
      if (!response.ok) throw new Error(result.error || 'Não foi possível buscar os usuários.')
      setUsers(result.users || [])
      setLastUpdated(new Date())
      if (query.trim() && !result.users?.length) {
        setMessage('Nenhuma conta encontrada. O usuário precisa entrar com Google pelo menos uma vez.')
      }
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível buscar os usuários.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    searchUsers().catch(() => {})
  }, [searchUsers])

  async function updateCourtesy(userId, action) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/admin/courtesy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId,
          activeUntil: action === 'grant' ? futureDate(duration) : null,
          note: action === 'grant' ? note : '',
        }),
      })
      const result = await readJson(response)
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar a cortesia.')
      setUsers((current) => current.map((user) => user.id === result.user.id ? result.user : user))
      setMessage(action === 'grant' ? 'Cortesia Premium concedida com sucesso.' : 'Cortesia revogada com sucesso.')
    } catch (requestError) {
      setError(requestError.message || 'Não foi possível atualizar a cortesia.')
    } finally {
      setLoading(false)
    }
  }

  const activeUsers = users.filter((listedUser) => activityInfo(listedUser).active).length
  const premiumUsers = users.filter((listedUser) => listedUser.billing?.premiumActive).length

  return (
    <section className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-3xl border border-amber-300/20 bg-gradient-to-b from-amber-300/[0.07] to-[#0b111d]" aria-labelledby="admin-courtesy-title">
      <div className="border-b border-white/[0.07] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-300">Administrador</p>
            <h2 id="admin-courtesy-title" className="mt-2 text-xl font-semibold text-white">Painel do Superadministrador</h2>
            <p className="mt-1 text-sm text-slate-400">Acompanhe os acessos, planos e cortesias vinculados às contas Google.</p>
          </div>
          <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">Acesso restrito</span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-7">
        <form
          className="grid gap-3 md:grid-cols-[1fr_auto_auto]"
          onSubmit={(event) => {
            event.preventDefault()
            searchUsers(email)
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Buscar pelo e-mail Google</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="usuario@gmail.com"
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 text-sm text-white placeholder:text-slate-700"
            />
          </label>
          <button type="submit" disabled={loading} className="h-11 self-end rounded-xl bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:brightness-105 disabled:opacity-50">
            Buscar
          </button>
          <button type="button" disabled={loading} onClick={() => searchUsers(email)} className="h-11 self-end rounded-xl border border-white/[0.1] bg-white/[0.04] px-5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50">
            Atualizar
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Validade da nova cortesia</span>
            <select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-[#101827] px-3.5 text-sm text-white">
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="365">1 ano</option>
              <option value="">Permanente</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Motivo ou observação</span>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Presente, parceria, suporte..."
              className="mt-2 h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3.5 text-sm text-white placeholder:text-slate-700"
            />
          </label>
        </div>

        {error && <p role="alert" className="rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-4 py-3 text-xs text-rose-200">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3 text-xs text-emerald-200">{message}</p>}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-black/15 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-slate-500">Contas registradas</p>
            <p className="mt-1 text-2xl font-semibold text-white">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-300/70">Ativos recentemente</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-200">{activeUsers}</p>
          </div>
          <div className="rounded-2xl border border-violet-300/15 bg-violet-300/[0.05] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-violet-300/70">Premium ativos</p>
            <p className="mt-1 text-2xl font-semibold text-violet-200">{premiumUsers}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-[11px] leading-5 text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <p>“Ativo recentemente” significa atividade registrada nos últimos 15 minutos.</p>
          {lastUpdated && <p>Atualizado em {formatDateTime(lastUpdated)}</p>}
        </div>

        <div className="space-y-3">
          {users.map((listedUser) => {
            const activity = activityInfo(listedUser)
            return (
              <article key={listedUser.id} className="rounded-2xl border border-white/[0.07] bg-black/15 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {listedUser.picture ? (
                      <img src={listedUser.picture} alt="" referrerPolicy="no-referrer" className="h-11 w-11 shrink-0 rounded-xl" />
                    ) : (
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-300/[0.08] text-sm font-bold text-amber-200">{listedUser.name?.charAt(0) || '?'}</span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-white">{listedUser.name}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${activity.className}`}>{activity.label}</span>
                        <span className="rounded-full border border-violet-300/15 bg-violet-300/[0.05] px-2 py-0.5 text-[10px] font-semibold text-violet-200">{planDescription(listedUser)}</span>
                      </div>
                      <p className="truncate text-xs text-slate-500">{listedUser.email}</p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-[11px] sm:grid-cols-3 lg:min-w-[430px]">
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                      <span className="text-slate-600">Último login</span>
                      <p className="mt-0.5 text-slate-300">{formatDateTime(listedUser.lastLoginAt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                      <span className="text-slate-600">Última atividade</span>
                      <p className="mt-0.5 text-slate-300">{formatDateTime(listedUser.lastSeenAt)}</p>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2">
                      <span className="text-slate-600">Logins registrados</span>
                      <p className="mt-0.5 text-slate-300">{listedUser.loginCount || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 border-t border-white/[0.06] pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className={`text-xs ${listedUser.billing?.courtesy ? 'text-emerald-300' : 'text-slate-600'}`}>{courtesyDescription(listedUser)}</p>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" disabled={loading} onClick={() => updateCourtesy(listedUser.id, 'grant')} className="rounded-xl bg-emerald-400 px-3.5 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-50">
                      Conceder cortesia
                    </button>
                    <button type="button" disabled={loading || !listedUser.billing?.courtesy} onClick={() => updateCourtesy(listedUser.id, 'revoke')} className="rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3.5 py-2 text-xs font-semibold text-rose-200 disabled:opacity-30">
                      Revogar
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
