import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFinanzasProvider } from '../hooks/useFinanzas.js'

describe('useFinanzasProvider', () => {
  it('expone meses y años navegables', () => {
    const { result } = renderHook(() => useFinanzasProvider())
    expect(result.current.monthKeys.length).toBeGreaterThan(6)
    expect(result.current.yearKeys.length).toBeGreaterThan(0)
  })

  it('agrega una transacción y actualiza saldo', () => {
    const { result } = renderHook(() => useFinanzasProvider())
    const saldoInicial = result.current.cuentas[0].saldo
    act(() => {
      result.current.agregarTransaccion({ descripcion: 'Test', importe: -20, categoria: 'ocio', fecha: '2026-06-04', tipo: 'gasto', cuentaId: 1 })
    })
    expect(result.current.transacciones[0].descripcion).toBe('Test')
    expect(result.current.cuentas[0].saldo).toBeCloseTo(saldoInicial - 20, 2)
  })

  it('permite obtener métricas por mes y por año', () => {
    const { result } = renderHook(() => useFinanzasProvider())
    const monthKey = result.current.monthKeys.at(-1)
    const year = result.current.yearKeys.at(-1)
    const monthStats = result.current.getMonthStats(monthKey)
    const yearStats = result.current.getYearStats(year)
    expect(monthStats).toHaveProperty('ingresosMes')
    expect(yearStats).toHaveProperty('pieData')
  })

  it('actualiza configuración de mostrar ahorro en análisis', () => {
    const { result } = renderHook(() => useFinanzasProvider())
    act(() => {
      result.current.actualizarConfiguracion('mostrarAhorroEnAnalisis', false)
    })
    expect(result.current.configuracion.mostrarAhorroEnAnalisis).toBe(false)
  })

})
