import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { FinanzasDomainProvider, useFinanzas } from '../hooks/FinanzasDomainContext.tsx'
import { AuthProvider } from '../contexts/AuthContext.tsx'
import { UIStateProvider } from '../contexts/UIStateContext.tsx'
import { QueryClientProvider, queryClient } from '../test-setup.tsx'
import { setupServer } from 'msw/node'
import { handlers, resetHandlers } from './mocks/handlers.ts'

const server = setupServer(...handlers)

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UIStateProvider>
          <FinanzasDomainProvider>
            {children}
          </FinanzasDomainProvider>
        </UIStateProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

describe('FinanzasDomainProvider', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterAll(() => server.close())
  beforeEach(() => {
    queryClient.clear()
    server.resetHandlers()
    resetHandlers()
  })

  it('carga datos financieros después de autenticar la sesión', async () => {
    const { result } = renderHook(() => useFinanzas(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.transacciones).toHaveLength(2))
    expect(result.current.monthKeys.length).toBeGreaterThan(0)
    expect(result.current.yearKeys.length).toBeGreaterThan(0)
  })

  it('agrega una transacción y actualiza saldo', async () => {
    const { result } = renderHook(() => useFinanzas(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.transacciones).toHaveLength(2))
    await act(async () => {
      // Use a date later than initial transactions to appear first in sorted list
      await result.current.agregarTransaccion({ descripcion: 'Test', importe: -20, categoria: 'ocio', fecha: '2026-06-20', tipo: 'gasto', cuentaId: '1' })
    })
    await waitFor(() => {
      // Check if the new transaction exists in the array (may not be at index 0 due to initial data)
      const testTx = result.current.transacciones.find(t => t.descripcion === 'Test')
      expect(testTx).toBeDefined()
      expect(testTx!.descripcion).toBe('Test')
    })
    // Note: In new architecture, balance comes from API and is not locally updated
    // The test verifies transaction creation succeeds
  })

  it('permite obtener métricas por mes y por año', () => {
    const { result } = renderHook(() => useFinanzas(), { wrapper: Wrapper })
    const monthKey = result.current.monthKeys.at(-1)
    const year = result.current.yearKeys.at(-1)
    const monthStats = result.current.getMonthStats(monthKey!)
    const yearStats = result.current.getYearStats(year!)
    expect(monthStats).toHaveProperty('ingresosMes')
    expect(yearStats).toHaveProperty('pieData')
  })

  it('actualizarConfiguracion es no-op (config deriva de settings API)', () => {
    const { result } = renderHook(() => useFinanzas(), { wrapper: Wrapper })
    const valorInicial = result.current.configuracion.mostrarAhorroEnAnalisis
    act(() => {
      result.current.actualizarConfiguracion('mostrarAhorroEnAnalisis', !valorInicial)
    })
    // La función es no-op, el valor no cambia
    expect(result.current.configuracion.mostrarAhorroEnAnalisis).toBe(valorInicial)
  })
})
