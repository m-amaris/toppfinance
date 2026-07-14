import {
  TransactionType,
  Visibility,
} from '@toppfinance/shared'
import type {
  LocalTransactionType,
  TransactionForUI,
  AccountForUI,
  CategoryGroup,
  BudgetForUI,
  ConfiguracionUI,
  PatrimonioMensual,
} from '@toppfinance/shared'

export const CATEGORIAS_GASTO: CategoryGroup[] = [
  { id: 'vivienda', label: 'Vivienda', icon: 'Home', color: '#01696f', type: TransactionType.EXPENSE },
  { id: 'servicios', label: 'Servicios', icon: 'Bolt', color: '#0f766e', type: TransactionType.EXPENSE },
  { id: 'alimentacion', label: 'Alimentación', icon: 'ShoppingCart', color: '#437a22', type: TransactionType.EXPENSE },
  { id: 'transporte', label: 'Transporte', icon: 'Car', color: '#006494', type: TransactionType.EXPENSE },
  { id: 'salud', label: 'Salud', icon: 'Heart', color: '#964219', type: TransactionType.EXPENSE },
  { id: 'deporte', label: 'Deporte', icon: 'Dumbbell', color: '#1d4ed8', type: TransactionType.EXPENSE },
  { id: 'ocio', label: 'Ocio', icon: 'Gamepad2', color: '#d19900', type: TransactionType.EXPENSE },
  { id: 'compras', label: 'Compras', icon: 'Package', color: '#7a39bb', type: TransactionType.EXPENSE },
  { id: 'educacion', label: 'Educación', icon: 'GraduationCap', color: '#a13544', type: TransactionType.EXPENSE },
  { id: 'ropa', label: 'Ropa', icon: 'Shirt', color: '#da7101', type: TransactionType.EXPENSE },
  { id: 'viajes', label: 'Viajes', icon: 'Plane', color: '#0891b2', type: TransactionType.EXPENSE },
  { id: 'regalos', label: 'Regalos', icon: 'Gift', color: '#be185d', type: TransactionType.EXPENSE },
  { id: 'otros', label: 'Otros', icon: 'MoreHorizontal', color: '#7a7974', type: TransactionType.EXPENSE },
]

export const CATEGORIAS_INGRESO: CategoryGroup[] = [
  { id: 'nomina', label: 'Nómina', icon: 'Briefcase', color: '#01696f', type: TransactionType.INCOME },
  { id: 'freelance', label: 'Freelance', icon: 'Code2', color: '#437a22', type: TransactionType.INCOME },
  { id: 'inversiones', label: 'Inversiones', icon: 'TrendingUp', color: '#006494', type: TransactionType.INCOME },
  { id: 'otros_ingreso', label: 'Otros', icon: 'Plus', color: '#7a7974', type: TransactionType.INCOME },
]

export const CATEGORIAS_AHORRO: CategoryGroup[] = [
  { id: 'ahorro', label: 'Ahorro', icon: 'PiggyBank', color: '#01696f', type: TransactionType.SAVING },
]

export const CATEGORIAS_TRANSFERENCIA: CategoryGroup[] = [
  { id: 'transferencia_interna', label: 'Transferencia Interna', icon: 'ArrowLeftRight', color: '#0f766e', type: TransactionType.TRANSFER },
]

export const CATEGORIAS_AJUSTE: CategoryGroup[] = [
  { id: 'ajuste_manual', label: 'Ajuste manual', icon: 'Scale', color: '#7a7974', type: TransactionType.ADJUSTMENT },
]

export const CATEGORIAS_EDITABLES_INICIALES: CategoryGroup[] = [
  ...CATEGORIAS_GASTO,
  ...CATEGORIAS_INGRESO,
  ...CATEGORIAS_AHORRO,
  ...CATEGORIAS_TRANSFERENCIA,
  ...CATEGORIAS_AJUSTE,
]

const TODAY = new Date()
const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short' })

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`
}

function rangeMonths(start: Date, end: Date): Date[] {
  const out: Date[] = []
  const cur = new Date(start.getFullYear(), start.getMonth(), 1)
  const last = new Date(end.getFullYear(), end.getMonth(), 1)
  while (cur <= last) {
    out.push(new Date(cur))
    cur.setMonth(cur.getMonth() + 1)
  }
  return out
}

function varPct(seed: number, amplitude = 0.08): number {
  const base = ((seed * 9301 + 49297) % 233280) / 233280
  return 1 + (base - 0.5) * amplitude
}

interface Recurrente {
  desc: string
  cat: string
  importe: number
  dia: number
  tipo: LocalTransactionType
}

interface Esporadico {
  desc: string
  cat: string
  importe: number
  tipo?: LocalTransactionType
}

function generarTransacciones(): TransactionForUI[] {
  const meses = rangeMonths(new Date(2025, 0, 1), TODAY)
  const recurrentes: Recurrente[] = [
    { desc: 'Alquiler', cat: 'vivienda', importe: -850, dia: 1, tipo: 'gasto' },
    { desc: 'Supermercado Mercadona', cat: 'alimentacion', importe: -120, dia: 5, tipo: 'gasto' },
    { desc: 'Spotify Premium', cat: 'ocio', importe: -10.99, dia: 10, tipo: 'gasto' },
    { desc: 'Netflix', cat: 'ocio', importe: -15.99, dia: 12, tipo: 'gasto' },
    { desc: 'Gym', cat: 'deporte', importe: -39, dia: 1, tipo: 'gasto' },
    { desc: 'Internet Movistar', cat: 'servicios', importe: -39.99, dia: 15, tipo: 'gasto' },
    { desc: 'Nómina empresa', cat: 'nomina', importe: 2400, dia: 28, tipo: 'ingreso' },
    { desc: 'Transferencia a cuenta ahorro', cat: 'ahorro', importe: -350, dia: 2, tipo: 'ahorro' },
    { desc: 'Traspaso a cuenta conjunta', cat: 'transferencia_interna', importe: -180, dia: 7, tipo: 'transferencia' },
    { desc: 'AliExpress componentes', cat: 'compras', importe: -45, dia: 20, tipo: 'gasto' },
    { desc: 'Bambu Lab filamento', cat: 'compras', importe: -28, dia: 18, tipo: 'gasto' },
    { desc: 'Gasolinera Repsol', cat: 'transporte', importe: -60, dia: 14, tipo: 'gasto' },
    { desc: 'Supermercado Lidl', cat: 'alimentacion', importe: -80, dia: 22, tipo: 'gasto' },
    { desc: 'Amazon Prime', cat: 'servicios', importe: -4.99, dia: 3, tipo: 'gasto' },
    { desc: 'Restaurante', cat: 'ocio', importe: -35, dia: 8, tipo: 'gasto' },
    { desc: 'Freelance proyecto React', cat: 'freelance', importe: 400, dia: 25, tipo: 'ingreso' },
  ]

  const esporadicos: Esporadico[] = [
    { desc: 'Ropa El Corte Inglés', cat: 'ropa', importe: -89 },
    { desc: 'Libros técnicos', cat: 'educacion', importe: -45 },
    { desc: 'Farmacia', cat: 'salud', importe: -22 },
    { desc: 'Cine', cat: 'ocio', importe: -25 },
    { desc: 'Escapada fin de semana', cat: 'viajes', importe: -180 },
    { desc: 'Dentista', cat: 'salud', importe: -120 },
    { desc: 'Componentes Raspberry Pi', cat: 'compras', importe: -65 },
    { desc: 'Udemy cursos', cat: 'educacion', importe: -15 },
    { desc: 'Regalo cumpleaños', cat: 'regalos', importe: -40 },
    { desc: 'Zapatillas deporte', cat: 'deporte', importe: -75 },
    { desc: 'Reembolso cena amigos', cat: 'ocio', importe: 18, tipo: 'ingreso' },
  ]

  let id = 1
  const out: TransactionForUI[] = []

  meses.forEach((mesDate, monthIndex) => {
    recurrentes.forEach((mov, recIndex) => {
      const fecha = new Date(mesDate.getFullYear(), mesDate.getMonth(), mov.dia)
      if (fecha <= TODAY) {
        const factor = mov.tipo === 'gasto' ? varPct(monthIndex * 17 + recIndex, 0.12) : 1
        const importe = Number((mov.importe * factor).toFixed(2))
        out.push({
          id: id++,
          descripcion: mov.desc,
          categoria: mov.cat,
          importe,
          fecha: isoDate(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
          tipo: mov.tipo,
          cuentaId: 1,
          cuentaDestinoId: mov.tipo === 'ahorro' || mov.tipo === 'transferencia' ? 2 : undefined,
          visibility: Visibility.SHARED,
          tags: [],
        })
      }
    })

    const cuantos = 2 + (monthIndex % 3)
    for (let i = 0; i < cuantos; i += 1) {
      const idx = (monthIndex * 3 + i * 2) % esporadicos.length
      const mov = esporadicos[idx]
      const dia = 4 + ((monthIndex * 5 + i * 7) % 22)
      const fecha = new Date(mesDate.getFullYear(), mesDate.getMonth(), dia)
      if (fecha <= TODAY) {
        out.push({
          id: id++,
          descripcion: mov.desc,
          categoria: mov.cat,
          importe: mov.importe,
          fecha: isoDate(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()),
          tipo: mov.tipo || 'gasto',
          cuentaId: 1,
          cuentaDestinoId: undefined,
          visibility: Visibility.SHARED,
          tags: [],
        })
      }
    }
  })

  return out.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime() || Number(b.id) - Number(a.id))
}

export const transaccionesIniciales = generarTransacciones()

function computeMonthlySeries(transacciones: TransactionForUI[]): PatrimonioMensual[] {
  const gastoIds = new Set(CATEGORIAS_GASTO.map(c => c.id))
  const monthMap = new Map<string, {
    key: string
    mes: string
    anio: number
    patrimonioDelta: number
    ahorro: number
    ingresos: number
    gastos: number
    transferencias: number
  }>()
  transacciones.forEach(tx => {
    const key = tx.fecha.slice(0, 7)
    if (!monthMap.has(key)) {
      const d = new Date(`${key}-01T12:00:00`)
      monthMap.set(key, {
        key,
        mes: monthFmt.format(d).replace('.', ''),
        anio: d.getFullYear(),
        patrimonioDelta: 0,
        ahorro: 0,
        ingresos: 0,
        gastos: 0,
        transferencias: 0,
      })
    }
    const row = monthMap.get(key)!
    const esCompensacion = tx.tipo === 'ingreso' && gastoIds.has(tx.categoria)
    const esIngresoReal = tx.tipo === 'ingreso' && !gastoIds.has(tx.categoria)
    if (esIngresoReal) {
      row.ingresos += Math.abs(tx.importe)
      row.patrimonioDelta += Math.abs(tx.importe)
    } else if (tx.tipo === 'gasto') {
      row.gastos += Math.abs(tx.importe)
      row.patrimonioDelta -= Math.abs(tx.importe)
    } else if (esCompensacion) {
      row.gastos = Math.max(0, row.gastos - Math.abs(tx.importe))
      row.patrimonioDelta += Math.abs(tx.importe)
    } else if (tx.tipo === 'ahorro') {
      row.ahorro += Math.abs(tx.importe)
    } else if (tx.tipo === 'transferencia') {
      row.transferencias += Math.abs(tx.importe)
    }
  })

  const rows = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key))
  const targetLast = 9050.4
  const totalDelta = rows.reduce((s, r) => s + r.patrimonioDelta, 0)
  let patrimonio = targetLast - totalDelta
  return rows.map(r => {
    patrimonio += r.patrimonioDelta
    return {
      key: r.key,
      mes: r.mes.charAt(0).toUpperCase() + r.mes.slice(1),
      anio: r.anio,
      patrimonio: Number(patrimonio.toFixed(2)),
      ahorro: Number(r.ahorro.toFixed(2)),
      ingresos: Number(r.ingresos.toFixed(2)),
      gastos: Number(r.gastos.toFixed(2)),
      transferencias: Number(r.transferencias.toFixed(2)),
    }
  })
}

export const patrimonioMensual: PatrimonioMensual[] = computeMonthlySeries(transaccionesIniciales)

export const cuentasIniciales: AccountForUI[] = [
  { id: '1', nombre: 'Cuenta personal Miguel', tipo: 'personal', saldo: 0, icono: 'Building2', color: '#006494', visibility: Visibility.SHARED, ownerName: null },
  { id: '2', nombre: 'Cuenta personal Sara', tipo: 'personal', saldo: 0, icono: 'Building2', color: '#7a39bb', visibility: Visibility.SHARED, ownerName: null },
  { id: '3', nombre: 'Cuenta compartida', tipo: 'compartida', saldo: 0, icono: 'Wallet', color: '#01696f', visibility: Visibility.SHARED, ownerName: null },
]

export const presupuestosIniciales: BudgetForUI[] = [
  { categoria: 'vivienda', limite: 900, color: '#01696f' },
  { categoria: 'servicios', limite: 120, color: '#0f766e' },
  { categoria: 'alimentacion', limite: 250, color: '#437a22' },
  { categoria: 'transporte', limite: 150, color: '#006494' },
  { categoria: 'salud', limite: 100, color: '#964219' },
  { categoria: 'deporte', limite: 90, color: '#1d4ed8' },
  { categoria: 'ocio', limite: 120, color: '#d19900' },
  { categoria: 'compras', limite: 130, color: '#7a39bb' },
  { categoria: 'educacion', limite: 50, color: '#a13544' },
  { categoria: 'ropa', limite: 60, color: '#da7101' },
  { categoria: 'viajes', limite: 150, color: '#0891b2' },
  { categoria: 'regalos', limite: 50, color: '#be185d' },
  { categoria: 'otros', limite: 40, color: '#7a7974' },
]

export const configuracionInicial: ConfiguracionUI = {
  tasaAhorroObjetivo: 20,
  moneda: 'EUR',
  primerDiaMes: 1,
  cuentaPrincipalId: 1,
  cuentaAhorroId: 3,
  cuentaTransferenciaDestinoId: 3,
  mostrarAhorroEnAnalisis: true,
  alertasPresupuesto: true,
  redondeoAhorro: false,
}