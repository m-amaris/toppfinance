import React, { useState } from 'react'
import { useFinanzas } from '../hooks/FinanzasDomainContext.tsx'
import { useUpdateTransaction, useDeleteTransaction } from '../hooks/useQueries.ts'
import { Icon } from './CategoryIcon.tsx'
import { formatEsNumber } from '../utils/format.ts'
import type { Transaction } from '../types/index.ts'

function formatFecha(fecha: string) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

interface TransactionItemProps {
  tx: Transaction
  showDate?: boolean
}

export function TransactionItem({ tx, showDate = true }: TransactionItemProps) {
  const { categorias, dynamicGastoIds, actualizarTransaccion } = useFinanzas()
  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()
  const [editing, setEditing] = useState(false)

  const gastoIds = dynamicGastoIds || ['vivienda','servicios','alimentacion','transporte','salud','deporte','ocio','compras','educacion','ropa','viajes','regalos','otros']
  const ingresoIds = ['nomina','freelance','inversiones','otros_ingreso']

  const disponibles = categorias.filter(c => {
    if (tx.tipo === 'gasto') return gastoIds.includes(c.id)
    if (tx.tipo === 'ingreso') return ingresoIds.includes(c.id) || gastoIds.includes(c.id)
    if (tx.tipo === 'ahorro') return c.id === 'ahorro'
    if (tx.tipo === 'transferencia') return c.id === 'transferencia_interna'
    if (tx.tipo === 'ajuste') return c.id === 'ajuste_manual'
    return true
  })

  const categoriaInfo = categorias.find(c => c.id === tx.categoria) || categorias.find(c => c.id === 'otros') || { label: tx.categoria, icon: 'MoreHorizontal', color: '#7a7974' }
  const isIngreso = tx.tipo === 'ingreso'
  const isAhorro = tx.tipo === 'ahorro'
  const isTransferencia = tx.tipo === 'transferencia'
  const isAjustePositivo = tx.tipo === 'ajuste' && tx.importe >= 0
  const amountClass = isIngreso || isAjustePositivo ? 'text-[var(--color-success)]' : isAhorro || isTransferencia ? 'text-[var(--color-primary)]' : 'text-[var(--color-error)]'
  const prefix = isIngreso || tx.importe >= 0 ? '+' : '-'

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCat = e.target.value
    actualizarTransaccion(String(tx.id), { categoria: newCat })
    updateMutation.mutate({ id: String(tx.apiId || tx.id), body: { categoryId: newCat } })
  }

  const handleDelete = () => {
    if (window.confirm('¿Eliminar esta transacción?')) {
      deleteMutation.mutate(String(tx.apiId || tx.id))
      // Local state update is handled by FinanzasDomainProvider refresh
    }
  }

  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${categoriaInfo.color}20`, color: categoriaInfo.color }}>
        <Icon name={categoriaInfo.icon} size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{tx.descripcion}</p>
          {showDate ? <span className="text-[10px] text-[var(--color-text-faint)]">{formatFecha(tx.fecha)}</span> : null}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className="text-xs text-[var(--color-text-muted)]">{categoriaInfo.label}</span>
          <button onClick={() => setEditing(v => !v)} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--color-surface-offset)] text-[var(--color-text-muted)]">Editar</button>
          {editing ? (
            <select
              aria-label="Editar categoría"
              className="text-[10px] rounded-md border border-[var(--color-divider)] bg-[var(--color-surface)] px-2 py-1 max-w-full"
              value={tx.categoria}
              onChange={handleCategoryChange}
            >
              {disponibles.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      <div className="text-right">
        <p className={`text-sm font-semibold tabular ${amountClass}`}>{prefix}{formatEsNumber(Math.abs(tx.importe), { suffix: '€' })}</p>
        <button onClick={handleDelete} disabled={deleteMutation.isPending} className="text-[10px] text-[var(--color-text-faint)] mt-1 disabled:opacity-50">Eliminar</button>
      </div>
    </div>
  )
}