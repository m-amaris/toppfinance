import React, { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { useFinanzas } from '../hooks/FinanzasDomainContext.tsx'
import { formatEsNumber } from '../utils/format.ts'
import { Icon } from '../components/CategoryIcon.tsx'
import { CATEGORIAS_GASTO } from '../data/store.ts'
import type { Category } from '../types/index.ts'

const monthLabelFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; color: string; name: string; value: number | string }>
  label?: string
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? formatEsNumber(p.value, { suffix: '€' }) : p.value}
        </p>
      ))}
    </div>
  )
}

interface PieTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { name: string; value: number; percent: string; color: string } }>
}

const PieTooltip = ({ active, payload }: PieTooltipProps) => {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold" style={{ color: p.color }}>{p.name}</p>
      <p>{formatEsNumber(p.value, { suffix: '€' })}</p>
      <p className="text-[var(--color-text-muted)]">{p.percent}%</p>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function TabButton({ active, onClick, children }: TabButtonProps) {
  return (
    <button onClick={onClick} className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${active ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-text-muted)]'}`}>
      {children}
    </button>
  )
}

function EmptyChart({ text }: { text: string }) {
  return <div className="h-[250px] flex items-center justify-center text-sm text-[var(--color-text-muted)]">{text}</div>
}

function monthTitle(key: string | undefined) {
  if (!key) return 'Sin datos'
  return monthLabelFmt.format(new Date(`${key}-01T12:00:00`))
}

function yearTotalsFromSeries(series: Array<{ anio: number; patrimonio: number; ingresos: number; gastos: number; ahorro: number }>) {
  const acc = new Map<number, { anio: string; patrimonio: number; ingresos: number; gastos: number; ahorro: number }>()
  series.forEach(item => {
    if (!acc.has(item.anio)) acc.set(item.anio, { anio: String(item.anio), patrimonio: item.patrimonio, ingresos: 0, gastos: 0, ahorro: 0 })
    const row = acc.get(item.anio)!
    row.ingresos += item.ingresos
    row.gastos += item.gastos
    row.ahorro += item.ahorro
    row.patrimonio = item.patrimonio
  })
  return Array.from(acc.values()).sort((a, b) => a.anio.localeCompare(b.anio))
}

export function Graficas() {
  const { patrimonioMensual, monthKeys, yearKeys, getMonthStats, getYearStats, presupuestos, configuracion } = useFinanzas()
  const [tab, setTab] = useState<'patrimonio' | 'categorias' | 'presupuesto'>('patrimonio')
  const [monthIndex, setMonthIndex] = useState(Math.max(0, monthKeys.length - 1))
  const [yearIndex, setYearIndex] = useState(Math.max(0, yearKeys.length - 1))
  const [showPercent, setShowPercent] = useState(false)

  useEffect(() => setMonthIndex(Math.max(0, monthKeys.length - 1)), [monthKeys.length])
  useEffect(() => setYearIndex(Math.max(0, yearKeys.length - 1)), [yearKeys.length])

  const selectedMonthKey = monthKeys[monthIndex] || monthKeys.at(-1)
  const selectedYear = yearKeys[yearIndex] || yearKeys.at(-1)
  const monthStats = selectedMonthKey ? getMonthStats(selectedMonthKey, { includeSavingsInPie: configuracion.mostrarAhorroEnAnalisis }) : null
  const yearStats = selectedYear ? getYearStats(selectedYear, { includeSavingsInPie: configuracion.mostrarAhorroEnAnalisis }) : null
  const yearlySeries = useMemo(() => yearTotalsFromSeries(patrimonioMensual), [patrimonioMensual])

  const presupuestosData = useMemo(() => {
    const porCategoria = monthStats?.porCategoria || {}
    return presupuestos.map(p => {
      const cat = CATEGORIAS_GASTO.find((c: Category) => c.id === p.categoria)
      const gastado = porCategoria[p.categoria] || 0
      const exceso = Math.max(0, gastado - p.limite)
      const pctReal = p.limite > 0 ? (gastado / p.limite) * 100 : 0
      const isExceeded = gastado > p.limite && p.limite > 0
      return { ...p, label: cat?.label || p.categoria, gastado, pct: Math.min(100, pctReal), pctReal, exceso, isExceeded, color: p.color }
    }).sort((a, b) => b.pctReal - a.pctReal)
  }, [presupuestos, CATEGORIAS_GASTO, monthStats])

  const monthlyPie = useMemo(() => {
    const items = monthStats?.pieData || []
    const total = items.reduce((s, d) => s + d.value, 0) || 0
    return items.map(d => ({ ...d, percent: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0' }))
  }, [monthStats])

  const yearlyPie = useMemo(() => {
    const items = yearStats?.pieData || []
    const total = items.reduce((s, d) => s + d.value, 0) || 0
    return items.map(d => ({ ...d, percent: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0' }))
  }, [yearStats])

  const barData = patrimonioMensual.slice(-6).map(m => ({ mes: m.mes, Ingresos: m.ingresos, Gastos: m.gastos, Ahorro: m.ahorro }))

  return (
    <div className="flex flex-col gap-5 pb-24">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold mb-1">Análisis</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Visualiza la evolución de tus finanzas</p>
      </div>

      <div className="mx-4 card p-1 flex gap-1">
        <TabButton active={tab === 'patrimonio'} onClick={() => setTab('patrimonio')}>Patrimonio</TabButton>
        <TabButton active={tab === 'categorias'} onClick={() => setTab('categorias')}>Categorías</TabButton>
        <TabButton active={tab === 'presupuesto'} onClick={() => setTab('presupuesto')}>Presupuesto</TabButton>
      </div>

      {tab === 'patrimonio' && (
        <div className="mx-4 flex flex-col gap-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-1">Evolución del patrimonio</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Serie histórica mensual</p>
            <ResponsiveContainer width="100%" height={210}>
              <AreaChart data={patrimonioMensual}>
                <defs>
                  <linearGradient id="gPat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#01696f" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#01696f" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="patrimonio" stroke="#01696f" strokeWidth={2.5} fill="url(#gPat)" name="Patrimonio" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-1">Ingresos, gastos y ahorro</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">Últimos 6 meses</p>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Ingresos" fill="#437a22" radius={[4,4,0,0]} />
                <Bar dataKey="Gastos" fill="#a12c7b" radius={[4,4,0,0]} />
                <Bar dataKey="Ahorro" fill="#01696f" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-1">Resumen anual</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={yearlySeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-divider)" />
                <XAxis dataKey="anio" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill="#437a22" radius={[4,4,0,0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#a12c7b" radius={[4,4,0,0]} />
                <Bar dataKey="ahorro" name="Ahorro" fill="#01696f" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {tab === 'categorias' && (
        <div className="mx-4 flex flex-col gap-4" onClick={() => setShowPercent(v => !v)}>
          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-sm font-semibold">Distribución mensual por categorías</h2>
                <p className="text-xs text-[var(--color-text-muted)]">{configuracion.mostrarAhorroEnAnalisis ? 'Incluye ahorro en el anillo' : 'Oculta el ahorro en el anillo'}</p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-offset)] p-1" onClick={e => e.stopPropagation()}>
                <button aria-label="Mes categorías anterior" disabled={monthIndex === 0} onClick={() => setMonthIndex(i => Math.max(0, i - 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronLeft" size={18} /></button>
                <button aria-label="Mes categorías siguiente" disabled={monthIndex >= monthKeys.length - 1} onClick={() => setMonthIndex(i => Math.min(monthKeys.length - 1, i + 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronRight" size={18} /></button>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] capitalize mb-4">{monthTitle(selectedMonthKey)}</p>
            {monthlyPie.length ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={monthlyPie} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82} paddingAngle={2}>
                      {monthlyPie.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {monthlyPie.map(item => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--color-text-muted)] truncate">{item.name}</span>
                      <span className="ml-auto font-medium">{showPercent ? `${item.percent}%` : formatEsNumber(item.value, { suffix: '€' })}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyChart text="No hay datos para este mes." />}
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-sm font-semibold">Distribución anual por categorías</h2>
                <p className="text-xs text-[var(--color-text-muted)]">Navega por años para comparar el reparto</p>
              </div>
              <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-offset)] p-1" onClick={e => e.stopPropagation()}>
                <button aria-label="Año anterior" disabled={yearIndex === 0} onClick={() => setYearIndex(i => Math.max(0, i - 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronLeft" size={18} /></button>
                <button aria-label="Año siguiente" disabled={yearIndex >= yearKeys.length - 1} onClick={() => setYearIndex(i => Math.min(yearKeys.length - 1, i + 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronRight" size={18} /></button>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mb-4">{selectedYear || 'Sin año'} </p>
            {yearlyPie.length ? (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={yearlyPie} dataKey="value" nameKey="name" innerRadius={56} outerRadius={82} paddingAngle={2}>
                      {yearlyPie.map(entry => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {yearlyPie.map(item => (
                    <div key={item.name} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-[var(--color-text-muted)] truncate">{item.name}</span>
                      <span className="ml-auto font-medium">{showPercent ? `${item.percent}%` : formatEsNumber(item.value, { suffix: '€' })}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyChart text="No hay datos para este año." />}
          </div>
        </div>
      )}

      {tab === 'presupuesto' && (
        <div className="mx-4 card p-4">
          <h2 className="text-sm font-semibold mb-1">Uso de presupuesto mensual</h2>
          <p className="text-xs text-[var(--color-text-muted)] mb-4 capitalize">Basado en {monthTitle(selectedMonthKey)}</p>
          <div className="flex flex-col gap-4">
            {presupuestosData.map(item => (
              <div key={item.categoria}>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium truncate">{item.label}</span>
                    {item.isExceeded && <span className="px-1.5 py-0.5 rounded-md bg-error/10 text-error text-[9px] font-bold uppercase tracking-wider">Superado</span>}
                  </div>
                  <span className="text-[var(--color-text-muted)]">{formatEsNumber(item.gastado, { suffix: '€' })} / {formatEsNumber(item.limite, { suffix: '€' })}</span>
                </div>
                <div className="w-full h-2 bg-[var(--color-surface-offset)] rounded-full flex overflow-hidden">
                  <div className="h-full transition-all duration-500" style={{ width: `${item.isExceeded ? (item.limite / item.gastado * 100) : item.pct}%`, backgroundColor: item.color }} />
                  {item.isExceeded && (
                    <div className="h-full transition-all duration-500 flex-1" style={{ backgroundColor: 'var(--color-error)' }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}