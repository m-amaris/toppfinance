import React from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext.tsx'
import { useUIState } from '../../contexts/UIStateContext.tsx'
import { BottomNav } from '../BottomNav.tsx'
import { AddTransactionModal } from '../AddTransaction.tsx'
import { Icon } from '../CategoryIcon.tsx'

const pages = ['dashboard', 'transacciones', 'graficas', 'configuracion']

export function Layout() {
  const { activeTab, setActiveTab, showAddModal, setShowAddModal, darkMode, toggleDark } = useUIState()
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Sync activeTab with route
  React.useEffect(() => {
    const path = location.pathname.slice(1) || 'dashboard'
    if (pages.includes(path)) {
      setActiveTab(path)
    }
  }, [location.pathname, setActiveTab])

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    navigate(`/${tab === 'dashboard' ? '' : tab}`)
  }

  if (!isAuthenticated) return null

  return (
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
          <button onClick={toggleDark} className="w-9 h-9 flex items-center justify-center rounded-xl" aria-label="Cambiar tema">
            <Icon name={darkMode ? 'Sun' : 'Moon'} size={18} />
          </button>
          <button
            onClick={() => handleTabChange('configuracion')}
            className={`w-9 h-9 flex items-center justify-center rounded-xl ${activeTab === 'configuracion' ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/10' : ''}`}
            aria-label="Ajustes"
          >
            <Icon name="Settings" size={18} />
          </button>
          <button onClick={() => setShowAddModal(true)} className="btn-primary ml-1 w-9 h-9 flex items-center justify-center rounded-xl shadow-lg shadow-[var(--color-primary)]/20" aria-label="Añadir transacción">
            <Icon name="Plus" size={20} />
          </button>
        </div>
      </header>
      <main className="pb-24">
        <Outlet />
      </main>
      <BottomNav active={activeTab} onChange={handleTabChange} />
      {showAddModal && <AddTransactionModal onClose={() => setShowAddModal(false)} />}
    </div>
  )
}