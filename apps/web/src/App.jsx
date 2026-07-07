import React, { useState } from 'react'
import { FinanzasContext, useFinanzasProvider } from './hooks/useFinanzas.js'
import { BottomNav } from './components/BottomNav.jsx'
import { AddTransactionModal } from './components/AddTransaction.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { Transacciones } from './pages/Transacciones.jsx'
import { Graficas } from './pages/Graficas.jsx'
import { Configuracion } from './pages/Configuracion.jsx'
import { Icon } from './components/CategoryIcon.jsx'

function LoginScreen({ onLogin, error, syncing, darkMode, toggleDark }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setLocalError('')
    if (!email.trim() || !password) {
      setLocalError('Introduce email y contrasena.')
      return
    }
    try {
      await onLogin(email.trim(), password)
    } catch (loginError) {
      setLocalError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesion.')
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
            <h2 className="text-xl font-bold mb-1">Iniciar sesion</h2>
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
            <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Contrasena</label>
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

function AppContent() {
  const finanzas = useFinanzasProvider()
  const [tab, setTab] = useState('dashboard')
  const [showAdd, setShowAdd] = useState(false)

  // Desplazar al inicio al cambiar de pestaña
  React.useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const pages = { dashboard: <Dashboard onNavigate={setTab} />, transacciones: <Transacciones />, graficas: <Graficas />, configuracion: <Configuracion /> }

  if (finanzas.authStatus === 'checking') {
    return (
      <div className="min-h-dvh bg-[var(--color-bg)] max-w-md mx-auto flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Icon name="Loader2" size={18} className="animate-spin" />
          Sincronizando
        </div>
      </div>
    )
  }

  if (finanzas.authStatus === 'unauthenticated') {
    return (
      <LoginScreen
        onLogin={finanzas.login}
        error={finanzas.apiError}
        syncing={finanzas.syncing}
        darkMode={finanzas.darkMode}
        toggleDark={finanzas.toggleDark}
      />
    )
  }

  return (
    <FinanzasContext.Provider value={finanzas}>
      <div className="min-h-dvh bg-[var(--color-bg)] max-w-md mx-auto relative">
        <header className="sticky top-0 z-30 bg-[var(--color-bg)]/85 backdrop-blur-md border-b border-[var(--color-divider)] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center">
              <Icon name="Wallet" size={18} className="text-white" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">
              <span>Topp</span><span className="text-[var(--color-primary)]">Finance</span>
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={finanzas.toggleDark} className="w-9 h-9 flex items-center justify-center rounded-xl" aria-label="Cambiar tema"><Icon name={finanzas.darkMode ? 'Sun' : 'Moon'} size={18} /></button>
            <button onClick={() => setTab('configuracion')} className={`w-9 h-9 flex items-center justify-center rounded-xl ${tab === 'configuracion' ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''}`} aria-label="Ajustes"><Icon name="Settings" size={18} /></button>
            <button onClick={() => setShowAdd(true)} className="btn-primary ml-1 w-9 h-9 flex items-center justify-center rounded-xl shadow-lg shadow-[var(--color-primary)]/20" aria-label="Añadir transacción"><Icon name="Plus" size={20} /></button>
          </div>
        </header>
        <main>{pages[tab]}</main>
        <BottomNav active={tab} onChange={setTab} />
        {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} />}
      </div>
    </FinanzasContext.Provider>
  )
}

export default function App() { return <AppContent /> }
