import React from 'react'
import { useFinanzas } from '../hooks/useFinanzas.js'
import { Icon } from '../components/CategoryIcon.jsx'

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`w-12 h-7 rounded-full p-1 transition-colors ${checked ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-surface-offset)]'}`}>
      <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

export function Configuracion() {
  const { configuracion, actualizarConfiguracion, cuentas, CATEGORIAS_GASTO, presupuestos, actualizarPresupuesto, actualizarCategoria, user, logout, isApiEnabled } = useFinanzas()

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold mb-1">Ajustes</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Preferencias de visualización y objetivos</p>
      </div>

      <div className="mx-4 card p-4 flex flex-col gap-4">
        <div>
          <label className="text-sm font-medium block mb-2">Objetivo de tasa de ahorro</label>
          <div className="relative">
            <input type="number" min="0" max="100" value={configuracion.tasaAhorroObjetivo} onChange={e => actualizarConfiguracion('tasaAhorroObjetivo', Number(e.target.value || 0))} className="input-base pr-8" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">%</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Mostrar ahorro en análisis</p>
            <p className="text-xs text-[var(--color-text-muted)]">Afecta al gráfico de anillo mensual y anual.</p>
          </div>
          <Toggle checked={configuracion.mostrarAhorroEnAnalisis} onChange={value => actualizarConfiguracion('mostrarAhorroEnAnalisis', value)} />
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Alertas de presupuesto</p>
            <p className="text-xs text-[var(--color-text-muted)]">Avisos visuales cuando una categoría se acerca al límite.</p>
          </div>
          <Toggle checked={configuracion.alertasPresupuesto} onChange={value => actualizarConfiguracion('alertasPresupuesto', value)} />
        </div>
      </div>

      <div className="mx-4">
        <h2 className="text-sm font-semibold px-1 mb-3">Límites de presupuesto</h2>
        <div className="card divide-y divide-[var(--color-divider)]">
          {CATEGORIAS_GASTO.map(cat => {
            const p = presupuestos.find(pres => pres.categoria === cat.id)
            return (
              <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
                <div className="relative group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + '15', color: cat.color }}>
                    <Icon name={cat.icon} size={16} />
                  </div>
                  <input 
                    type="color" 
                    value={cat.color} 
                    onChange={e => actualizarCategoria(cat.id, { color: e.target.value })}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    title="Cambiar color"
                  />
                </div>
                <span className="flex-1 text-sm font-medium">{cat.label}</span>
                <div className="w-24 relative">
                  <input type="number" min="0" value={p?.limite || 0} onChange={e => actualizarPresupuesto(cat.id, e.target.value)} className="input-base py-1 px-2 text-right pr-6 text-sm" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-muted)]">€</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="mx-4 card p-4">
        <h2 className="text-sm font-semibold mb-3">Cuentas activas</h2>
        <div className="flex flex-col gap-3">
          {cuentas.map(cuenta => (
            <div key={cuenta.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cuenta.color }} />
                <div>
                  <p className="text-sm font-medium">{cuenta.nombre}</p>
                  <p className="text-xs text-[var(--color-text-muted)] capitalize">{cuenta.tipo}</p>
                </div>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">ID {cuenta.id}</span>
            </div>
          ))}
        </div>
      </div>

      {isApiEnabled && (
        <div className="mx-4 card p-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">{user?.displayName || 'Sesion activa'}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{user?.email}</p>
          </div>
          <button type="button" onClick={logout} className="btn-secondary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5">
            <Icon name="LogOut" size={14} />
            Salir
          </button>
        </div>
      )}
    </div>
  )
}
