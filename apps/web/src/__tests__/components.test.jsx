import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { KPICard } from '../components/KPICard.jsx'
import { BottomNav } from '../components/BottomNav.jsx'
import { TransactionItem } from '../components/TransactionItem.jsx'
import { FinanzasContext, useFinanzasProvider } from '../hooks/useFinanzas.js'

function Wrapper({ children }) {
  const value = useFinanzasProvider()
  return <FinanzasContext.Provider value={value}>{children}</FinanzasContext.Provider>
}

describe('components', () => {
  it('KPICard muestra label y valor', () => {
    render(<KPICard label="Ingresos" value={2400} suffix="€" />)
    expect(screen.getByText('Ingresos')).toBeInTheDocument()
    expect(screen.getByText(/2400,00€/)).toBeInTheDocument()
  })

  it('BottomNav renderiza los tabs principales', () => {
    const onChange = vi.fn()
    render(<BottomNav active="dashboard" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Movimientos'))
    expect(onChange).toHaveBeenCalledWith('transacciones')
    expect(screen.queryByLabelText('Metas')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Análisis')).toBeInTheDocument()
  })

  it('TransactionItem permite abrir edición', () => {
    const tx = { id: 1, descripcion: 'Supermercado', categoria: 'alimentacion', importe: -45.5, fecha: '2026-06-01', tipo: 'gasto' }
    render(<Wrapper><TransactionItem tx={tx} /></Wrapper>)
    fireEvent.click(screen.getByText('Editar'))
    expect(screen.getByLabelText('Editar categoría')).toBeInTheDocument()
  })
})
