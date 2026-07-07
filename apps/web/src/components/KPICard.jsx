import React from 'react'
import { formatEsNumber } from '../utils/format.js'

const colorMap = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  gold: 'var(--color-gold)',
  blue: 'var(--color-blue)',
}

export function KPICard({
  label,
  value,
  prefix = '',
  suffix = '€',
  color = 'primary',
  icon: IconComp,
  deltaLabel,
  loading = false,
  className = '',
}) {
  if (loading) {
    return <div className={`card p-4 ${className}`}><div className="skeleton h-16 rounded-xl" /></div>
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
        {IconComp ? <div style={{ color: colorMap[color] || colorMap.primary }}>{IconComp({ size: 16 })}</div> : null}
      </div>
      <p className="text-xl font-bold tabular" style={{ color: colorMap[color] || colorMap.primary }}>
        {prefix}{typeof value === 'number' ? formatEsNumber(value, { suffix }) : value}
      </p>
      {deltaLabel ? <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug">{deltaLabel}</p> : null}
    </div>
  )
}
