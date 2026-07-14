import React, { useState } from 'react'
import { Icon } from './CategoryIcon.tsx'

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>
  error?: string
  syncing?: boolean
  darkMode: boolean
  toggleDark: () => void
}

export function LoginScreen({ onLogin, error, syncing = false, darkMode, toggleDark }: LoginScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setLocalError('')
    if (!email.trim() || !password) {
      setLocalError('Introduce email y contraseña.')
      return
    }
    try {
      await onLogin(email.trim(), password)
    } catch (loginError) {
      setLocalError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesión.')
    }
  }

  return (
    <div className="min-h-dvh bg-[var(--color-bg)] max-w-md mx-auto flex flex-col">
      <header className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
            <Icon name="Wallet" size={19} className="text-white" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            <span>Topp</span><span className="text-[var(--color-primary)]">Finance</span>
          </h1>
        </div>
        <button onClick={toggleDark} className="w-9 h-9 flex items-center justify-center rounded-xl" aria-label="Cambiar tema">
          <Icon name={darkMode ? 'Sun' : 'Moon'} size={18} />
        </button>
      </header>

      <main className="flex-1 flex items-center px-4 pb-10">
        <form onSubmit={handleSubmit} className="w-full card p-5 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Iniciar sesión</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Acceso privado a ToppFinance</p>
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Email</label>
            <input
              type="email"
              autoComplete="email"
              className="input-base min-h-[44px]"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Contraseña</label>
            <input
              type="password"
              autoComplete="current-password"
              className="input-base min-h-[44px]"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </div>
          {(localError || error) && (
            <p className="text-xs text-[var(--color-error)] flex items-center gap-1">
              <Icon name="AlertTriangle" size={12} />
              {localError || error}
            </p>
          )}
          <button type="submit" disabled={syncing} className="btn-primary w-full min-h-[46px] flex items-center justify-center gap-2">
            {syncing ? <Icon name="Loader2" size={16} className="animate-spin" /> : <Icon name="LogIn" size={16} />}
            Entrar
          </button>
        </form>
      </main>
    </div>
  )
}