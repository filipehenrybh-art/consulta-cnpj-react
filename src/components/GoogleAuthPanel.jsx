import { useEffect, useRef, useState } from 'react'

async function readResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('O servidor de autenticação retornou uma resposta inválida.')
  }
}

export default function GoogleAuthPanel({ onAuthenticated, allowDemo = true }) {
  const googleButtonRef = useRef(null)
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!clientId) return undefined

    function renderGoogleButton() {
      if (!window.google?.accounts?.id || !googleButtonRef.current) return

      googleButtonRef.current.innerHTML = ''
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setAuthError('')
          try {
            const validationResponse = await fetch('/api/auth/google', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ credential: response.credential }),
            })
            const result = await readResponse(validationResponse)
            if (!validationResponse.ok) throw new Error(result.error || 'Não foi possível autenticar.')
            onAuthenticated(result.user)
          } catch (error) {
            setAuthError(error.message || 'Não foi possível validar a credencial do Google.')
          }
        },
      })
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        shape: 'rectangular',
        text: 'continue_with',
        locale: 'pt-BR',
        width: 320,
      })
    }

    const existingScript = document.getElementById('google-identity-services')
    if (existingScript) {
      if (window.google?.accounts?.id) renderGoogleButton()
      else existingScript.addEventListener('load', renderGoogleButton, { once: true })
      return () => existingScript.removeEventListener('load', renderGoogleButton)
    }

    const script = document.createElement('script')
    script.id = 'google-identity-services'
    script.src = 'https://accounts.google.com/gsi/client?hl=pt-BR'
    script.async = true
    script.addEventListener('load', renderGoogleButton, { once: true })
    document.head.appendChild(script)

    return () => script.removeEventListener('load', renderGoogleButton)
  }, [clientId, onAuthenticated])

  if (clientId) {
    return (
      <div>
        <div ref={googleButtonRef} className="flex min-h-11 justify-center" />
        {authError && <p role="alert" className="mt-3 rounded-xl border border-rose-300/15 bg-rose-300/[0.05] px-3 py-2 text-center text-xs text-rose-200">{authError}</p>}
        <p className="mt-3 text-center text-[11px] leading-5 text-slate-500">Autenticação Google protegida por validação no servidor.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-xs leading-5 text-amber-100/70">
        O Client ID do Google ainda não foi configurado neste ambiente.
      </div>
      {allowDemo && (
        <button
          type="button"
          onClick={() => onAuthenticated({ id: 'demo-user', name: 'Usuário de demonstração', email: 'teste@pilarfinancas.com.br', demo: true })}
          className="mt-4 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/[0.12] bg-white text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-slate-200 text-sm font-bold text-blue-600">G</span>
          Simular acesso com Google
        </button>
      )}
    </div>
  )
}
