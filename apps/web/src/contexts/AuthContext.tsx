import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { authApi } from '../api/client.ts'
import type { SessionUserResponse, HouseholdResponse } from '@toppfinance/shared'

interface ApiError extends Error {
  status?: number
  payload?: unknown
}

interface AuthContextValue {
  user: SessionUserResponse | null
  household: HouseholdResponse | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshAuth: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUserResponse | null>(null)
  const [household, setHousehold] = useState<HouseholdResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true)
      const session = await authApi.me()
      setUser(session.user)
      setHousehold(session.household)
      setIsAuthenticated(true)
    } catch (error) {
      const apiError = error as ApiError
      if (apiError.status === 401) {
        setIsAuthenticated(false)
        setUser(null)
        setHousehold(null)
      } else {
        // Network error - assume authenticated but can't verify
        setIsAuthenticated(false)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = useCallback(async (email: string, password: string) => {
    const session = await authApi.login(email, password)
    setUser(session.user)
    setHousehold(session.household)
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setHousehold(null)
      setIsAuthenticated(false)
    }
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      household,
      isLoading,
      isAuthenticated,
      login,
      logout,
      refreshAuth: checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}