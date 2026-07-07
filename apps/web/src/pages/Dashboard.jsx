import React, { useEffect, useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useFinanzas } from '../hooks/useFinanzas.js'
import { KPICard } from '../components/KPICard.jsx'
import { TransactionItem } from '../components/TransactionItem.jsx'
import { Icon } from '../components/CategoryIcon.jsx'
import { formatEsNumber } from '../utils/format.js'

const monthLabelFmt = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' })

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="card px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map(p => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {formatEsNumber(p.value, { suffix: '€' })}</p>)}
    </div>
  )
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return 'Sin datos'
  return monthLabelFmt.format(new Date(`${monthKey}-01T12:00:00`))
}

function comparisonText(curr, prev, showPercent, suffix = '€', percentMode = false) {
  if (prev == null) return null
  const diff = Number((curr - prev).toFixed(2))
  const isPositive = diff > 0
  const isZero = diff === 0
  const arrow = isPositive ? '↑' : isZero ? '' : '↓'
  const colorClass = isPositive ? 'text-[var(--color-success)]' : isZero ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-error)]'
  
  const sign = isPositive ? '+' : ''
  
  let valueText = ''
  if (showPercent) {
    const pct = prev !== 0 ? ((diff / Math.abs(prev)) * 100).toFixed(1) : '100'
    valueText = `${sign}${pct}%`
  } else {
    valueText = percentMode ? `${sign}${diff.toFixed(1)}%` : `${sign}${formatEsNumber(Math.abs(diff), { suffix })}`
  }
  
  return (
    <span className={`font-medium ${colorClass}`}>
      {arrow} {valueText}
    </span>
  )
}

export function Dashboard({ onNavigate }) {
  const { monthKeys, getMonthStats, getPreviousMonthKey, getPatrimonioParaMes, transacciones, cuentas, configuracion, patrimonioMensual, user, syncing } = useFinanzas()
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, monthKeys.length - 1))
  const [touchStart, setTouchStart] = useState(null)
  const [showPercent, setShowPercent] = useState(false)

  useEffect(() => {
    setSelectedIndex(Math.max(0, monthKeys.length - 1))
  }, [monthKeys.length])

  const selectedMonthKey = monthKeys[selectedIndex] || monthKeys.at(-1)
  const previousMonthKey = selectedMonthKey ? getPreviousMonthKey(selectedMonthKey) : null
  const monthStats = selectedMonthKey ? getMonthStats(selectedMonthKey, { includeSavingsInPie: false }) : null
  const prevStats = previousMonthKey ? getMonthStats(previousMonthKey, { includeSavingsInPie: false }) : null
  const patrimonioActual = selectedMonthKey ? getPatrimonioParaMes(selectedMonthKey) : cuentas.reduce((s, c) => s + c.saldo, 0)
  const patrimonioAnterior = previousMonthKey ? getPatrimonioParaMes(previousMonthKey) : null
  const variacionPatrimonio = patrimonioAnterior ? ((patrimonioActual - patrimonioAnterior) / patrimonioAnterior) * 100 : 0

  const variacionElement = patrimonioAnterior ? (
    <span className={variacionPatrimonio >= 0 ? 'text-[#a7f3d0]' : 'text-[#fecaca]'}>
      {variacionPatrimonio >= 0 ? '↑' : '↓'} {variacionPatrimonio >= 0 ? '+' : ''}{variacionPatrimonio.toFixed(1)}%
    </span>
  ) : <span className="opacity-70">Primer mes disponible</span>

  const recientes = useMemo(
    () => transacciones.filter(tx => tx.fecha.slice(0, 7) === selectedMonthKey).slice(0, 5),
    [transacciones, selectedMonthKey]
  )

  const handleTouchStart = (e) => setTouchStart(e.targetTouches[0].clientX)
  const handleTouchEnd = (e) => {
    if (!touchStart) return
    const touchEnd = e.changedTouches[0].clientX
    const diff = touchStart - touchEnd
    if (Math.abs(diff) > 50) {
      if (diff > 0 && selectedIndex < monthKeys.length - 1) setSelectedIndex(i => i + 1)
      if (diff < 0 && selectedIndex > 0) setSelectedIndex(i => i - 1)
    } else {
      // Si es un toque corto (tap), alternamos modo visualización
      setShowPercent(v => !v)
    }
    setTouchStart(null)
  }

  const seriePatrimonio = useMemo(() => {
    if (!selectedMonthKey) return patrimonioMensual.slice(-6)
    const idx = patrimonioMensual.findIndex(item => item.key === selectedMonthKey)
    return patrimonioMensual.slice(Math.max(0, idx - 5), idx + 1)
  }, [patrimonioMensual, selectedMonthKey])

  if (!monthStats) return null

  return (
    <div className="flex flex-col gap-5 pb-24" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="px-4 pt-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)] mb-0.5 capitalize">{formatMonthLabel(selectedMonthKey)}</p>
          <h1 className="text-xl font-bold font-[Cabinet Grotesk,sans-serif] text-balance">Hola, {user?.displayName || 'Miguel'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{syncing ? 'Sincronizando datos' : 'Asi van tus finanzas'}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-[var(--color-surface-offset)] p-1">
          <button aria-label="Mes anterior" disabled={selectedIndex === 0} onClick={() => setSelectedIndex(i => Math.max(0, i - 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronLeft" size={18} /></button>
          <button aria-label="Mes siguiente" disabled={selectedIndex >= monthKeys.length - 1} onClick={() => setSelectedIndex(i => Math.min(monthKeys.length - 1, i + 1))} className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40"><Icon name="ChevronRight" size={18} /></button>
        </div>
      </div>

      <div className="mx-4 rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg, #01696f 0%, #0c4e54 100%)' }}>
        <p className="text-xs font-medium opacity-75 uppercase tracking-wide mb-1">Patrimonio total</p>
        <p className="text-3xl font-bold tabular mb-1">{formatEsNumber(patrimonioActual, { suffix: '€' })}</p>
        <p className="text-xs font-medium">
          {patrimonioAnterior ? (
            <span className={variacionPatrimonio >= 0 ? 'text-[#a7f3d0]' : 'text-[#fecaca]'}>
              {variacionPatrimonio >= 0 ? '↑' : '↓'} {showPercent ? `${variacionPatrimonio >= 0 ? '+' : ''}${variacionPatrimonio.toFixed(1)}%` : `${variacionPatrimonio >= 0 ? '+' : ''}${formatEsNumber(Math.abs(patrimonioActual - patrimonioAnterior), { suffix: '€' })}`}
            </span>
          ) : <span className="opacity-70">Primer mes disponible</span>}
        </p>
      </div>

      <div className="px-4 grid grid-cols-2 gap-3">
        <KPICard label="Ingresos" value={monthStats.ingresosMes} color="success" suffix="€" icon={({ size }) => <Icon name="ArrowUpRight" size={size} />} deltaLabel={comparisonText(monthStats.ingresosMes, prevStats?.ingresosMes, showPercent)} />
        <KPICard label="Gastos" value={monthStats.gastosMes} color="error" suffix="€" icon={({ size }) => <Icon name="ArrowDownRight" size={size} />} deltaLabel={comparisonText(monthStats.gastosMes, prevStats?.gastosMes, showPercent)} />
        <KPICard label="Ahorro" value={monthStats.ahorroMes} color="primary" suffix="€" icon={({ size }) => <Icon name="PiggyBank" size={size} />} deltaLabel={comparisonText(monthStats.ahorroMes, prevStats?.ahorroMes, showPercent)} />
        <KPICard label="Tasa ahorro" value={Number(monthStats.tasaAhorroReal.toFixed(1))} prefix="" suffix="%" color="gold" icon={({ size }) => <Icon name="Target" size={size} />} deltaLabel={<>{comparisonText(monthStats.tasaAhorroReal, prevStats?.tasaAhorroReal, false, '%', true)} · objetivo {configuracion.tasaAhorroObjetivo}%</>} />
        <KPICard label="Transferencias" value={monthStats.transferenciasInternasMes} color="primary" suffix="€" icon={({ size }) => <Icon name="ArrowLeftRight" size={size} />} deltaLabel={comparisonText(monthStats.transferenciasInternasMes, prevStats?.transferenciasInternasMes, showPercent)} />
        <KPICard label="Flujo neto" value={monthStats.flujoNetoMensual} color={monthStats.flujoNetoMensual >= 0 ? 'success' : 'error'} suffix="€" icon={({ size }) => <Icon name="Scale" size={size} />} deltaLabel={comparisonText(monthStats.flujoNetoMensual, prevStats?.flujoNetoMensual, showPercent)} />
      </div>

      <div className="mx-4 card p-4">
        <h2 className="text-sm font-semibold mb-4">Evolución patrimonial</h2>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={seriePatrimonio} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="patGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#01696f" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#01696f" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="patrimonio" stroke="#01696f" strokeWidth={2} fill="url(#patGrad)" name="Patrimonio" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mx-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Mis cuentas</h2>
          <button className="text-xs text-[var(--color-primary)] font-medium">Ver todo</button>
        </div>
        <div className="flex flex-col gap-2">
          {cuentas.map(cuenta => (
            <div key={cuenta.id} className="card flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cuenta.color + '20', color: cuenta.color }}><Icon name={cuenta.icono} size={16} /></div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{cuenta.nombre}</p><p className="text-xs text-[var(--color-text-muted)] capitalize">{cuenta.tipo}</p></div>
              <p className="text-sm font-semibold tabular">{formatEsNumber(cuenta.saldo, { suffix: '€' })}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">Últimos movimientos</h2>
          <button onClick={() => onNavigate('transacciones')} className="text-xs text-[var(--color-primary)] font-medium flex items-center gap-0.5">Ver todo <Icon name="ChevronRight" size={12} /></button>
        </div>
        <div className="card divide-y divide-[var(--color-divider)]">
          {recientes.length ? recientes.map(tx => <TransactionItem key={tx.id} tx={tx} />) : <div className="px-4 py-8 text-sm text-[var(--color-text-muted)]">No hay movimientos en este mes.</div>}
        </div>
      </div>
    </div>
  )
}
