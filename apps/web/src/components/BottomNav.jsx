import React from 'react'
import { Icon } from './CategoryIcon.jsx'

const items = [
  { id: 'dashboard', label: 'Inicio', icon: 'LayoutGrid' },
  { id: 'transacciones', label: 'Movimientos', icon: 'List' },
  { id: 'graficas', label: 'Análisis', icon: 'BarChart3' }
]

export function BottomNav({ active, onChange }) {
  return (
    <div className="fixed bottom-6 left-0 right-0 px-6 z-40 pointer-events-none">
      <nav className="max-w-xs mx-auto bg-[var(--color-surface)]/90 backdrop-blur-lg border border-[var(--color-divider)] rounded-2xl shadow-2xl flex items-center justify-around p-1.5 pointer-events-auto">
        {items.map(item => {
          const isActive = active === item.id
          return (
            <button
              key={item.id}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onChange(item.id)}
              className={`relative flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all duration-300 ${isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-[var(--color-primary)]/10 rounded-xl animate-in zoom-in-95 duration-200" />
              )}
              <Icon name={item.icon} size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] mt-0.5 font-bold transition-all ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-90 h-0 overflow-hidden'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
