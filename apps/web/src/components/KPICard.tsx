import React from 'react'
import { formatEsNumber } from '../utils/format.ts'

const colorMap: Record<string, string> = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  gold: 'var(--color-gold)',
  blue: 'var(--color-blue)',
}

interface KPICardProps {
  label: string
  value: number | string
  prefix?: string
  suffix?: string
  color?: keyof typeof colorMap | string
  icon?: React.FC<{ size?: number; className?: string }>
  deltaLabel?: React.ReactNode
  loading?: boolean
  className?: string
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
}: KPICardProps) {
  if (loading) {
    return <div className={`card p-4 ${className}`}><div className="skeleton h-16 rounded-xl" /></div>
  }

  return (
    <div className={`card p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
        {IconComp ? <div style={{ color: colorMap[color] || colorMap.primary }}>{IconComp({ size: 16 }) as React.ReactNode}</div> : null}
      </div>
      <p className="text-xl font-bold tabular" style={{ color: colorMap[color] || colorMap.primary }}>
        {prefix}{typeof value === 'number' ? formatEsNumber(value, { suffix }) : value}
      </p>
      {deltaLabel ? <p className="text-[11px] text-[var(--color-text-muted)] mt-1 leading-snug">{deltaLabel as React.ReactNode}</p> : null}
    </div>
  )
}