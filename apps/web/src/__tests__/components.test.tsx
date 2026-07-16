import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '../test-setup.tsx'
import { KPICard } from '../components/KPICard.tsx'
import { BottomNav } from '../components/BottomNav.tsx'
import { TransactionItem } from '../components/TransactionItem.tsx'
import { UIStateProvider } from '../contexts/UIStateContext.tsx'
import { AuthProvider } from '../contexts/AuthContext.tsx'
import { FinanzasDomainProvider } from '../hooks/FinanzasDomainContext.tsx'
import { Visibility } from '@toppfinance/shared'

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UIStateProvider>
        <FinanzasDomainProvider>
          {children}
        </FinanzasDomainProvider>
      </UIStateProvider>
    </AuthProvider>
  )
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
    const tx = { id: 1, descripcion: 'Supermercado', categoria: 'alimentacion', importe: -45.5, fecha: '2026-06-01', tipo: 'gasto' as const, cuentaId: '1', visibility: Visibility.SHARED, tags: [] }
    render(<Wrapper><TransactionItem tx={tx} /></Wrapper>)
    fireEvent.click(screen.getByText('Editar'))
    expect(screen.getByLabelText('Editar categoría')).toBeInTheDocument()
  })
})
