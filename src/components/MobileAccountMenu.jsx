import { useEffect, useState } from 'react'
import { ChevronIcon, LogOutIcon } from './Icons.jsx'

export default function MobileAccountMenu({
  user,
  premiumActive = false,
  adminHref = '',
  primaryHref = '',
  primaryLabel = '',
  onSignOut,
  variant = 'cyan',
}) {
  const [open, setOpen] = useState(false)
  const accent = variant === 'violet'
    ? 'border-violet-300/25 bg-violet-300/[0.08] text-violet-100'
    : 'border-cyan-300/25 bg-cyan-300/[0.08] text-cyan-100'

  useEffect(() => {
    if (!open) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  if (!user) return null

  async function handleSignOut() {
    setOpen(false)
    await onSignOut()
  }

  return (
    <div className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Fechar menu da conta' : 'Abrir menu da conta'}
        aria-expanded={open}
        className={`flex min-h-11 items-center gap-1.5 rounded-xl border p-1.5 transition active:scale-[0.98] ${accent}`}
      >
        {user.picture ? (
          <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-xs font-bold">
            {user.name?.charAt(0) || '?'}
          </span>
        )}
        <ChevronIcon className={`h-3.5 w-3.5 transition ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar menu da conta"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px] sm:hidden"
          />
          <section className="fixed inset-x-3 top-[4.75rem] z-[60] overflow-hidden rounded-2xl border border-white/10 bg-[#090f1a] shadow-2xl shadow-black/60 sm:hidden">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-4">
              {user.picture ? (
                <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-11 w-11 rounded-xl object-cover" />
              ) : (
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white">
                  {user.name?.charAt(0) || '?'}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-400">{user.email}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${premiumActive ? 'border-violet-300/20 bg-violet-300/[0.09] text-violet-200' : 'border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-200'}`}>
                {premiumActive ? 'Premium' : 'Básico'}
              </span>
            </div>

            <nav aria-label="Atalhos da conta" className="grid gap-2 p-3">
              {primaryHref && (
                <a href={primaryHref} className="flex min-h-11 items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 text-sm font-medium text-slate-200 transition active:bg-white/[0.08]">
                  {primaryLabel}
                  <ChevronIcon className="h-4 w-4 text-slate-500" />
                </a>
              )}
              {adminHref && user.admin && (
                <a href={adminHref} className="flex min-h-11 items-center justify-between rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 text-sm font-medium text-amber-200 transition active:bg-amber-300/[0.1]">
                  Painel do administrador
                  <ChevronIcon className="h-4 w-4 text-amber-300/60" />
                </a>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-4 text-sm font-bold text-rose-200 transition active:bg-rose-300/[0.14]"
              >
                <LogOutIcon />
                Sair da conta
              </button>
            </nav>
          </section>
        </>
      )}
    </div>
  )
}
