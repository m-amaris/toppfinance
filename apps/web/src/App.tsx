import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './services/queryClient.ts'
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx'
import { UIStateProvider, useUIState } from './contexts/UIStateContext.tsx'
import { FinanzasDomainProvider } from './hooks/FinanzasDomainContext.tsx'
import { LoginScreen } from './components/LoginScreen.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { Transacciones } from './pages/Transacciones.tsx'
import { Graficas } from './pages/Graficas.tsx'
import { Configuracion } from './pages/Configuracion.tsx'
import { Layout } from './components/layout/Layout.tsx'
import { Icon } from './components/CategoryIcon.tsx'
import './index.css'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[var(--color-bg)] max-w-md mx-auto flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Icon name="Loader2" size={18} className="animate-spin" />
          Sincronizando
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[var(--color-bg)] max-w-md mx-auto flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <Icon name="Loader2" size={18} className="animate-spin" />
          Sincronizando
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppRoutes() {
  const { login } = useAuth()
  const { darkMode, toggleDark, setActiveTab } = useUIState()

  const onNavigate = (tab: string) => {
    setActiveTab(tab)
  }

  return (
    <Routes>
      <Route path="/login" element={
        <PublicRoute>
          <LoginScreen onLogin={login} darkMode={darkMode} toggleDark={toggleDark} syncing={false} />
        </PublicRoute>
      } />
      <Route element={
        <PrivateRoute>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={<Dashboard onNavigate={onNavigate} />} />
        <Route path="transacciones" element={<Transacciones />} />
        <Route path="graficas" element={<Graficas />} />
        <Route path="configuracion" element={<Configuracion />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UIStateProvider>
          <FinanzasDomainProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </FinanzasDomainProvider>
        </UIStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default function App() {
  return <AppContent />
}