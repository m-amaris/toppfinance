import { describe, it, expect } from 'vitest'
import { transaccionesIniciales, cuentasIniciales, patrimonioMensual, CATEGORIAS_GASTO, CATEGORIAS_INGRESO } from '../data/store.js'

describe('store', () => {
  it('tiene transacciones iniciales válidas', () => {
    expect(transaccionesIniciales.length).toBeGreaterThan(20)
    transaccionesIniciales.slice(0, 5).forEach(tx => {
      expect(tx.id).toBeTruthy()
      expect(tx.descripcion).toBeTruthy()
      expect(tx.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
  })

  it('define tres cuentas iniciales a saldo cero', () => {
    expect(cuentasIniciales).toHaveLength(3)
    expect(cuentasIniciales.every(c => c.saldo === 0)).toBe(true)
    expect(cuentasIniciales.some(c => c.nombre === 'Cuenta compartida')).toBe(true)
    expect(cuentasIniciales.some(c => c.nombre.includes('Openbank'))).toBe(false)
    expect(cuentasIniciales.some(c => c.nombre.includes('Cartera'))).toBe(false)
    expect(cuentasIniciales.some(c => c.nombre === 'Efectivo')).toBe(false)
  })

  it('la serie patrimonial contiene claves mensuales', () => {
    expect(patrimonioMensual.length).toBeGreaterThan(6)
    expect(patrimonioMensual[0].key).toMatch(/^\d{4}-\d{2}$/)
  })

  it('categorias de gasto e ingreso tienen estructura', () => {
    CATEGORIAS_GASTO.forEach(c => expect(c.id).toBeTruthy())
    CATEGORIAS_INGRESO.forEach(c => expect(c.label).toBeTruthy())
  })
})
