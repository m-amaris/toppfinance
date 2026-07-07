import React, { useState } from 'react'
import { useFinanzas } from '../hooks/useFinanzas.js'
import { Icon } from './CategoryIcon.jsx'
import { formatEsNumber } from '../utils/format.js'

function formatFecha(fecha) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function TransactionItem({ tx, showDate = true }) {
  const { categorias, eliminarTransaccion, actualizarTransaccion } = useFinanzas()
  const [editing, setEditing] = useState(false)
  const gastoIds = ['vivienda','servicios','alimentacion','transporte','salud','deporte','ocio','compras','educacion','ropa','viajes','regalos','otros']
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
              onChange={e => actualizarTransaccion(tx.id, { categoria: e.target.value })}
            >
              {disponibles.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
            </select>
          ) : null}
        </div>
      </div>

      <div className="text-right">
        <p className={`text-sm font-semibold tabular ${amountClass}`}>{prefix}{formatEsNumber(Math.abs(tx.importe), { suffix: '€' })}</p>
        <button onClick={() => eliminarTransaccion(tx.id)} className="text-[10px] text-[var(--color-text-faint)] mt-1">Eliminar</button>
      </div>
    </div>
  )
}
