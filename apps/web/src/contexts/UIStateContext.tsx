import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface UIStateContextValue {
  darkMode: boolean
  toggleDark: () => void
  activeTab: string
  setActiveTab: (tab: string) => void
  showAddModal: boolean
  setShowAddModal: (show: boolean) => void
}

const UIStateContext = createContext<UIStateContextValue | null>(null)

/** Provider for UI state (theme, modals, tabs, etc.) */
export function UIStateProvider({ children }: { children: ReactNode }) {
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode)
    }
  }, [darkMode])

  const toggleDark = useCallback(() => setDarkMode(d => !d), [])

  return (
    <UIStateContext.Provider value={{
      darkMode,
      toggleDark,
      activeTab,
      setActiveTab,
      showAddModal,
      setShowAddModal,
    }}>
      {children}
    </UIStateContext.Provider>
  )
}

export function useUIState(): UIStateContextValue {
  const ctx = useContext(UIStateContext)
  if (!ctx) throw new Error('useUIState must be used within UIStateProvider')
  return ctx
}