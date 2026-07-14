import React, { useEffect, useState } from 'react'
import { useFinanzas } from '../hooks/FinanzasDomainContext.tsx'
import { Icon } from './CategoryIcon.tsx'

interface AddTransactionModalProps {
  onClose: () => void
}

export function AddTransactionModal({ onClose }: AddTransactionModalProps) {
  const { categoriasPorTipo, configuracion, cuentas, agregarTransaccion } = useFinanzas()
  const [tipo, setTipo] = useState<'gasto' | 'ingreso' | 'ahorro' | 'transferencia' | 'ajuste'>('gasto')
  const [form, setForm] = useState({
    descripcion: '',
    importe: '',
    categoria: '',
    fecha: new Date().toISOString().split('T')[0],
    cuentaId: configuracion.cuentaPrincipalId || '',
    cuentaDestinoId: configuracion.cuentaTransferenciaDestinoId || configuracion.cuentaAhorroId || '',
  })
  const [error, setError] = useState('')

  const categorias = categoriasPorTipo(tipo)

  useEffect(() => {
    setForm(prev => ({
      ...prev,
      cuentaId: prev.cuentaId || configuracion.cuentaPrincipalId || cuentas[0]?.id || '',
      cuentaDestinoId: prev.cuentaDestinoId || configuracion.cuentaTransferenciaDestinoId || configuracion.cuentaAhorroId || cuentas.find(c => c.id !== prev.cuentaId)?.id || '',
    }))
  }, [configuracion.cuentaPrincipalId, configuracion.cuentaAhorroId, configuracion.cuentaTransferenciaDestinoId, cuentas])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.descripcion.trim()) return setError('Escribe una descripción')
    const imp = parseFloat(form.importe)
    if (isNaN(imp) || imp <= 0) return setError('Importe inválido')
    if (!form.categoria) return setError('Selecciona una categoría')
    if (!form.cuentaId) return setError('Selecciona una cuenta')
    if ((tipo === 'ahorro' || tipo === 'transferencia') && !form.cuentaDestinoId) return setError('Selecciona cuenta destino')
    if ((tipo === 'ahorro' || tipo === 'transferencia') && form.cuentaDestinoId === form.cuentaId) return setError('Origen y destino deben ser distintos')

    try {
      const amount = tipo === 'ingreso' || tipo === 'ajuste' ? imp : -imp
      await agregarTransaccion({
        descripcion: form.descripcion.trim(),
        importe: amount,
        categoria: form.categoria,
        fecha: form.fecha,
        tipo,
        cuentaId: form.cuentaId,
        cuentaDestinoId: tipo === 'ahorro' || tipo === 'transferencia' ? form.cuentaDestinoId : undefined,
      })
      onClose()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-surface)] rounded-2xl shadow-lg max-h-[calc(100dvh-1rem)] sm:max-h-[min(90dvh,720px)] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-[var(--color-divider)] bg-[var(--color-surface)] sticky top-0 z-10">
          <h2 className="text-lg font-bold font-[var(--font-display)]">Nueva transacción</h2>
          <button onClick={onClose} className="btn-ghost p-2 rounded-lg flex-shrink-0" aria-label="Cerrar modal"><Icon name="X" size={18} /></button>
        </div>

        <div className="overflow-y-auto px-4 sm:px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] overscroll-contain">
          <div className="grid grid-cols-2 gap-2 mb-5">
            {[
              ['gasto', 'ArrowDownRight', 'Gasto'],
              ['ingreso', 'ArrowUpRight', 'Ingreso'],
              ['ahorro', 'PiggyBank', 'Ahorro'],
              ['transferencia', 'ArrowLeftRight', 'Transferencia'],
              ['ajuste', 'Scale', 'Ajuste'],
            ].map(([t, icon, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTipo(t as typeof tipo); setForm(p => ({ ...p, categoria: '' })) }}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 min-h-[44px] ${tipo === t ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20' : 'bg-[var(--color-surface-offset)] text-[var(--color-text-muted)] hover:bg-[var(--color-divider)]'}`}
              >
                <Icon name={icon} size={16} />
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Descripción</label>
              <input className="input-base min-h-[44px]" placeholder="ej. Cena con amigos, reembolso, nómina..." value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Importe (€)</label>
              <input type="number" min="0.01" step="0.01" inputMode="decimal" className="input-base min-h-[44px]" placeholder="0.00" value={form.importe} onChange={e => setForm(p => ({ ...p, importe: e.target.value }))} />
            </div>

            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Categoría</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {categorias.map(cat => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, categoria: cat.id }))}
                    className={`flex flex-col items-center justify-center gap-1 p-3 rounded-lg text-xs font-medium transition-all min-h-[72px] ${form.categoria === cat.id ? 'ring-2 ring-[var(--color-primary)]' : ''}`}
                    style={{ backgroundColor: form.categoria === cat.id ? cat.color + '20' : 'var(--color-surface-offset)', color: form.categoria === cat.id ? cat.color : 'var(--color-text-muted)' }}
                  >
                    <Icon name={cat.icon} size={16} />
                    <span className="leading-tight text-center text-balance">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {tipo === 'ingreso' && (
              <div className="card p-3 text-xs text-[var(--color-text-muted)]">
                Un ingreso puede usar una categoría de gasto para reflejar reembolsos, devoluciones o pagos de otra persona.
              </div>
            )}

            {(tipo === 'ahorro' || tipo === 'transferencia') && (
              <div className="card p-3 text-xs text-[var(--color-text-muted)]">
                {tipo === 'ahorro'
                  ? 'Este movimiento mueve saldo hacia una cuenta de ahorro y no se contabiliza como gasto.'
                  : 'Esta operación mueve saldo entre tus cuentas internas y no se contabiliza como ingreso ni como gasto.'}
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">{tipo === 'ingreso' ? 'Cuenta de entrada' : 'Cuenta origen'}</label>
              <select className="input-base min-h-[44px]" value={form.cuentaId} onChange={e => setForm(p => ({ ...p, cuentaId: e.target.value }))}>
                {cuentas.map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}
              </select>
            </div>

            {(tipo === 'ahorro' || tipo === 'transferencia') && (
              <div>
                <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Cuenta destino</label>
                <select className="input-base min-h-[44px]" value={form.cuentaDestinoId} onChange={e => setForm(p => ({ ...p, cuentaDestinoId: e.target.value }))}>
                  {cuentas.filter(cuenta => cuenta.id !== form.cuentaId).map(cuenta => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5 block">Fecha</label>
              <input type="date" className="input-base min-h-[44px]" value={form.fecha} onChange={e => setForm(p => ({ ...p, fecha: e.target.value }))} />
            </div>

            {error && <p className="text-xs text-[var(--color-error)] flex items-center gap-1"><Icon name="AlertTriangle" size={12} /> {error}</p>}

            <div className="sticky bottom-0 bg-[var(--color-surface)] pt-2 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
              <button type="submit" disabled={false} className="btn-primary w-full min-h-[48px] flex items-center justify-center gap-2">
                <Icon name="Plus" size={16} />
                Añadir transacción
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}