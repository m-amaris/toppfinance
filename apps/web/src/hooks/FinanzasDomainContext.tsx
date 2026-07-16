import { createContext, useContext, useMemo, useCallback, ReactNode } from 'react'
import {
  currentMonthKey,
  mapApiCategory,
  monthKeyFromDate,
  TRANSACTION_TYPE_LOCAL_KEY,
  LOCAL_KEY_TO_TRANSACTION_TYPE,
  rangeMonths,
  toIsoDateString,
  type CategoryGroup as SharedCategory,
  type TransactionForUI as SharedTransaction,
  type AccountForUI as SharedAccount,
  type PatrimonioMensual as SharedPatrimonioPoint,
  TransactionCategoryType,
  type LocalTransactionType,
  Visibility,
} from '@toppfinance/shared'
import { presupuestosIniciales, configuracionInicial } from '../data/store.ts'
import { useAccounts, useCategories, useSettings, useTransactions } from './useQueries.ts'
import { useCreateTransaction, useUpdateTransaction, useDeleteTransaction, useUpdateCategory, useCsvPreview, useCsvCommit } from './useQueries.ts'
import { useAuth } from '../contexts/AuthContext.tsx'

/** Category type helpers */
const gastoIdsBase = ['vivienda', 'servicios', 'alimentacion', 'transporte', 'salud', 'deporte', 'ocio', 'compras', 'educacion', 'ropa', 'viajes', 'regalos', 'otros']
const ingresoIdsBase = ['nomina', 'freelance', 'inversiones', 'otros_ingreso']
const ahorroIdsBase = ['ahorro']
const transferenciaIdsBase = ['transferencia_interna']
const ajusteIdsBase = ['ajuste_manual']

function categoryTypeFromId(id: string): TransactionCategoryType | null {
  if (gastoIdsBase.includes(id)) return TransactionCategoryType.EXPENSE
  if (ingresoIdsBase.includes(id)) return TransactionCategoryType.INCOME
  if (ahorroIdsBase.includes(id)) return TransactionCategoryType.SAVING
  if (transferenciaIdsBase.includes(id)) return TransactionCategoryType.TRANSFER
  if (ajusteIdsBase.includes(id)) return TransactionCategoryType.ADJUSTMENT
  return null
}

function categoryMatches(cat: SharedCategory, type: string): boolean {
  return cat.type === type || categoryTypeFromId(cat.id) === type
}

/** Metrics computation (pure functions) */
function computeMetricsForTransactions(
  items: SharedTransaction[],
  categorias: SharedCategory[],
  idsGasto: string[],
  { includeSavingsInPie = false } = {}
) {
  const isExpenseCategory = (catId: string) => idsGasto.includes(catId)
  const isRealIncome = (tx: SharedTransaction) => tx.tipo === 'ingreso' && !isExpenseCategory(tx.categoria)
  const isExpenseRefund = (tx: SharedTransaction) => tx.tipo === 'ingreso' && isExpenseCategory(tx.categoria)

  const ingresosMes = items.filter(isRealIncome).reduce((s, t) => s + Math.abs(t.importe), 0)
  const gastosMesBrutos = items.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Math.abs(t.importe), 0)
  const recuperaciones = items.filter(isExpenseRefund).reduce((s, t) => s + Math.abs(t.importe), 0)
  const gastosMes = Math.max(0, gastosMesBrutos - recuperaciones)
  const ahorroTransferidoMes = Math.abs(items.filter(t => t.tipo === 'ahorro').reduce((s, t) => s + t.importe, 0))
  const transferenciasInternasMes = Math.abs(items.filter(t => t.tipo === 'transferencia').reduce((s, t) => s + t.importe, 0))
  const ajustesMes = items.filter(t => t.tipo === 'ajuste').reduce((s, t) => s + t.importe, 0)
  const ahorroMes = ahorroTransferidoMes
  const flujoNetoMensual = ingresosMes - gastosMes + ajustesMes

  const porCategoria: Record<string, number> = {}
  items.forEach(t => {
    if (t.tipo === 'gasto' && isExpenseCategory(t.categoria)) {
      porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + Math.abs(t.importe)
    }
    if (isExpenseRefund(t)) {
      porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) - Math.abs(t.importe)
    }
  })

  Object.keys(porCategoria).forEach(cat => {
    porCategoria[cat] = Math.max(0, Number((porCategoria[cat] || 0).toFixed(2)))
    if (porCategoria[cat] === 0) delete porCategoria[cat]
  })

  let pieData = Object.entries(porCategoria)
    .map(([cat, val]) => {
      const catInfo = categorias.find(c => c.id === cat)
      return {
        id: cat,
        name: catInfo?.label || cat,
        value: Number(val.toFixed(2)),
        color: catInfo?.color || '#7a7974',
      }
    })
    .filter(item => item.value > 0)

  if (includeSavingsInPie && ahorroMes > 0) {
    pieData.push({ id: 'ahorro', name: 'Ahorro', value: Number(ahorroMes.toFixed(2)), color: '#01696f' })
  }

  pieData = pieData.sort((a, b) => b.value - a.value)

  const tasaAhorroReal = ingresosMes > 0 ? (ahorroMes / ingresosMes) * 100 : 0

  return {
    ingresosMes: Number(ingresosMes.toFixed(2)),
    gastosMes: Number(gastosMes.toFixed(2)),
    ahorroMes: Number(ahorroMes.toFixed(2)),
    ahorroTransferidoMes: Number(ahorroTransferidoMes.toFixed(2)),
    transferenciasInternasMes: Number(transferenciasInternasMes.toFixed(2)),
    ajustesMes: Number(ajustesMes.toFixed(2)),
    flujoNetoMensual: Number(flujoNetoMensual.toFixed(2)),
    porCategoria,
    pieData,
    tasaAhorroReal: Number(tasaAhorroReal.toFixed(2)),
  }
}

function computePatrimonioMensual(
  transacciones: SharedTransaction[],
  cuentas: SharedAccount[],
  categorias: SharedCategory[],
  idsGasto: string[]
): SharedPatrimonioPoint[] {
  const monthFmt = new Intl.DateTimeFormat('es-ES', { month: 'short' })
  const patrimonioActual = cuentas.reduce((s, c) => s + Number(c.saldo || 0), 0)

  if (transacciones.length === 0) {
    const key = currentMonthKey()
    const d = new Date(`${key}-01T12:00:00`)
    return [{
      key,
      mes: monthFmt.format(d).replace('.', ''),
      anio: d.getFullYear(),
      patrimonio: Number(patrimonioActual.toFixed(2)),
      ahorro: 0,
      ingresos: 0,
      gastos: 0,
      transferencias: 0,
    }]
  }

  const keys = [...new Set(transacciones.map(tx => tx.fecha.slice(0, 7)))].sort((a, b) => a.localeCompare(b))
  const rows = keys.map(key => {
    const d = new Date(`${key}-01T12:00:00`)
    const stats = computeMetricsForTransactions(
      transacciones.filter(tx => tx.fecha.slice(0, 7) === key),
      categorias,
      idsGasto,
      { includeSavingsInPie: false },
    )
    return {
      key,
      mes: monthFmt.format(d).replace('.', ''),
      anio: d.getFullYear(),
      patrimonioDelta: stats.ingresosMes - stats.gastosMes + stats.ajustesMes,
      ahorro: stats.ahorroMes,
      ingresos: stats.ingresosMes,
      gastos: stats.gastosMes,
      transferencias: stats.transferenciasInternasMes,
    }
  })

  const totalDelta = rows.reduce((sum, row) => sum + row.patrimonioDelta, 0)
  let patrimonio = patrimonioActual - totalDelta
  return rows.map(row => {
    patrimonio += row.patrimonioDelta
    return {
      key: row.key,
      mes: row.mes.charAt(0).toUpperCase() + row.mes.slice(1),
      anio: row.anio,
      patrimonio: Number(patrimonio.toFixed(2)),
      ahorro: row.ahorro,
      ingresos: row.ingresos,
      gastos: row.gastos,
      transferencias: row.transferencias,
    }
  })
}

/** Type definitions for the domain context */
export interface FinanzasDomainContextValue {
  transacciones: SharedTransaction[]
  cuentas: SharedAccount[]
  presupuestos: typeof presupuestosIniciales
  configuracion: {
    tasaAhorroObjetivo: number
    moneda: string
    primerDiaMes: number
    cuentaPrincipalId: string | number
    cuentaAhorroId: string | number
    cuentaTransferenciaDestinoId: string | number
    mostrarAhorroEnAnalisis: boolean
    alertasPresupuesto: boolean
    redondeoAhorro: boolean
  }
  categorias: SharedCategory[]
  patrimonioMensual: SharedPatrimonioPoint[]
  monthKeys: string[]
  yearKeys: string[]
  stats: {
    ingresosMes: number
    gastosMes: number
    ahorroMes: number
    ahorroTransferidoMes: number
    transferenciasInternasMes: number
    ajustesMes: number
    flujoNetoMensual: number
    porCategoria: Record<string, number>
    pieData: Array<{ id: string; name: string; value: number; color: string }>
    tasaAhorroReal: number
    patrimonioTotal: number
    cumplimientoAhorro: number
  }
  isLoading: boolean
  isApiEnabled: boolean
  dynamicGastoIds: string[]
  getMonthStats: (monthKey: string, options?: { includeSavingsInPie?: boolean }) => ReturnType<typeof computeMetricsForTransactions> & { monthKey: string; transacciones: SharedTransaction[] }
  getYearStats: (year: string | number, options?: { includeSavingsInPie?: boolean }) => ReturnType<typeof computeMetricsForTransactions> & { year: string; transacciones: SharedTransaction[] }
  getPreviousMonthKey: (monthKey: string) => string | null
  getPatrimonioParaMes: (monthKey: string) => number
  refreshData: () => Promise<unknown>
  agregarTransaccion: (tx: Partial<SharedTransaction>) => Promise<void>
  eliminarTransaccion: (id: string) => Promise<void>
  actualizarTransaccion: (id: string, patch: Partial<SharedTransaction>) => Promise<void>
  actualizarConfiguracion: (key: string, value: unknown) => void
  actualizarPresupuesto: (categoria: string, limite: number) => void
  actualizarCuenta: (id: string, patch: Partial<SharedAccount>) => void
  actualizarCategoria: (id: string, patch: Partial<SharedCategory>) => Promise<void>
  previewCsvImport: (file: File) => Promise<{ importBatch: { id: string }; rows: any[]; summary: any }>
  commitCsvImport: (preview: { importBatch: { id: string }; rows: Array<{ rowNumber: number; sourceHash: string; draft: boolean; duplicate: boolean }> }, includeDuplicates?: boolean) => Promise<{ summary: any }>
  categoriasPorTipo: (tipo: string) => SharedCategory[]
}

const FinanzasDomainContext = createContext<FinanzasDomainContextValue | null>(null)

export function FinanzasDomainProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuth()
  const { data: accountsData, isLoading: accountsLoading } = useAccounts(isAuthenticated)
  const { data: categoriesData, isLoading: categoriesLoading } = useCategories(isAuthenticated)
  const { data: settingsData, isLoading: settingsLoading } = useSettings(isAuthenticated)
  const { data: transactionsData, isLoading: transactionsLoading, refetch: refetchTransactions } = useTransactions({}, isAuthenticated)

  const isLoading = accountsLoading || categoriesLoading || settingsLoading || transactionsLoading

  // Map API data to local format
  const cuentas = useMemo(() => {
    if (!accountsData?.accounts) return []
    return accountsData.accounts.map((acc, idx) => {
      const style = acc.type === 'SHARED' ? { icono: 'Wallet', color: '#01696f', tipo: 'compartida' as const }
        : acc.type === 'SAVINGS' ? { icono: 'PiggyBank', color: '#437a22', tipo: 'ahorro' as const }
        : acc.type === 'CASH' ? { icono: 'Banknote', color: '#d19900', tipo: 'efectivo' as const }
        : { icono: 'Building2', color: idx % 2 === 0 ? '#006494' : '#7a39bb', tipo: 'personal' as const }
      return {
        id: acc.id,
        apiId: acc.id,
        nombre: acc.name,
        tipo: style.tipo,
        saldo: Number(acc.balance ?? acc.openingBalance ?? 0),
        icono: style.icono,
        color: style.color,
        visibility: acc.visibility,
        ownerName: acc.ownerName,
      }
    })
  }, [accountsData])

  const categorias = useMemo(() => {
    if (!categoriesData?.categories) return []
    return categoriesData.categories.map(mapApiCategory)
  }, [categoriesData])

  const transacciones = useMemo(() => {
    if (!transactionsData?.transactions) return []
    return transactionsData.transactions.map(tx => {
      const tipo = (TRANSACTION_TYPE_LOCAL_KEY[tx.type] || 'gasto') as LocalTransactionType
      const amount = Number(tx.amount || 0)
      const signedAmount = tipo === 'ingreso'
        ? Math.abs(amount)
        : tipo === 'ajuste'
          ? amount
          : -Math.abs(amount)
      return {
        id: tx.id,
        apiId: tx.id,
        descripcion: tx.description,
        categoria: tx.category?.slug || tx.categoryId,
        importe: Number(signedAmount.toFixed(2)),
        fecha: String(tx.date).slice(0, 10),
        tipo,
        cuentaId: tx.sourceAccountId ?? undefined,
        cuentaDestinoId: tx.destinationAccountId ?? undefined,
        visibility: tx.visibility as Visibility,
        paidByUserId: tx.paidByUserId ?? undefined,
        merchantName: tx.merchant?.name ?? undefined,
        tags: tx.tags || [],
        notes: tx.notes ?? '',
      }
    }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime() || Number(b.id) - Number(a.id))
  }, [transactionsData])

  const configuracion = useMemo(() => {
    if (!settingsData) return configuracionInicial
    const firstAccount = cuentas[0]?.id ?? configuracionInicial.cuentaPrincipalId
    const savingsAccount = cuentas.find(c => c.tipo === 'ahorro')?.id
      ?? cuentas.find(c => c.tipo === 'compartida')?.id
      ?? cuentas[1]?.id
      ?? firstAccount
    const sharedAccount = cuentas.find(c => c.tipo === 'compartida')?.id ?? savingsAccount
    return {
      ...configuracionInicial,
      moneda: settingsData.currency || configuracionInicial.moneda,
      cuentaPrincipalId: firstAccount,
      cuentaAhorroId: savingsAccount,
      cuentaTransferenciaDestinoId: sharedAccount,
    }
  }, [settingsData, cuentas])

  const dynamicGastoIds = useMemo(() =>
    categorias.filter(c => categoryMatches(c, 'EXPENSE')).map(c => c.id),
    [categorias]
  )

  const patrimonioMensual = useMemo(() => {
    return computePatrimonioMensual(transacciones, cuentas, categorias, dynamicGastoIds)
  }, [transacciones, cuentas, categorias, dynamicGastoIds])

  const monthKeys = useMemo(() => {
    if (transacciones.length === 0) return [currentMonthKey()]
    const dates = transacciones.map(tx => new Date(tx.fecha + 'T12:00:00'))
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())))
    const minDateIso = toIsoDateString(minDate)
    const currentMonth = currentMonthKey()
    return rangeMonths(minDateIso, currentMonth)
  }, [transacciones])

  const yearKeys = useMemo(() => {
    if (transacciones.length === 0) return [String(new Date().getFullYear())]
    return [...new Set(transacciones.map(tx => String(new Date(tx.fecha + 'T12:00:00').getFullYear())))].sort()
  }, [transacciones])

  const getMonthStats = useCallback((monthKey: string, options: { includeSavingsInPie?: boolean } = {}) => {
    const includeSavingsInPie = options.includeSavingsInPie ?? configuracion.mostrarAhorroEnAnalisis
    const items = transacciones.filter(tx => monthKeyFromDate(tx.fecha) === monthKey)
    return { ...computeMetricsForTransactions(items, categorias, dynamicGastoIds, { includeSavingsInPie }), monthKey, transacciones: items }
  }, [transacciones, categorias, dynamicGastoIds, configuracion.mostrarAhorroEnAnalisis])

  const getYearStats = useCallback((year: string | number, options: { includeSavingsInPie?: boolean } = {}) => {
    const includeSavingsInPie = options.includeSavingsInPie ?? configuracion.mostrarAhorroEnAnalisis
    const items = transacciones.filter(tx => String(new Date(tx.fecha + 'T12:00:00').getFullYear()) === String(year))
    return { ...computeMetricsForTransactions(items, categorias, dynamicGastoIds, { includeSavingsInPie }), year: String(year), transacciones: items }
  }, [transacciones, categorias, dynamicGastoIds, configuracion.mostrarAhorroEnAnalisis])

  const getPreviousMonthKey = useCallback((monthKey: string) => {
    const index = monthKeys.indexOf(monthKey)
    return index > 0 ? monthKeys[index - 1] : null
  }, [monthKeys])

  const getPatrimonioParaMes = useCallback((monthKey: string) => {
    return patrimonioMensual.find(m => m.key === monthKey)?.patrimonio ?? cuentas.reduce((s, c) => s + c.saldo, 0)
  }, [patrimonioMensual, cuentas])

  const stats = useMemo(() => {
    const selectedMonth = monthKeys.includes('2026-06') ? '2026-06' : (monthKeys.at(-1) || currentMonthKey())
    const base = getMonthStats(selectedMonth, { includeSavingsInPie: false })
    const patrimonioTotal = cuentas.reduce((s, c) => s + c.saldo, 0)
    const cumplimientoAhorro = configuracion.tasaAhorroObjetivo > 0 ? (base.tasaAhorroReal / configuracion.tasaAhorroObjetivo) * 100 : 0
    return {
      ...base,
      patrimonioTotal: Number(patrimonioTotal.toFixed(2)),
      cumplimientoAhorro: Number(cumplimientoAhorro.toFixed(2)),
    }
  }, [cuentas, configuracion.tasaAhorroObjetivo, transacciones, categorias, monthKeys, dynamicGastoIds])

  // Mutation hooks
  const createTxMutation = useCreateTransaction()
  const updateTxMutation = useUpdateTransaction()
  const deleteTxMutation = useDeleteTransaction()
  const updateCategoryMutation = useUpdateCategory()
  const csvPreviewMutation = useCsvPreview()
  const csvCommitMutation = useCsvCommit()

  // Mutation wrappers that call API + refresh
  const agregarTransaccion = useCallback(async (tx: Partial<SharedTransaction>) => {
    const tipo = tx.tipo || (tx.importe && tx.importe > 0 ? 'ingreso' : 'gasto')
    const beneficiarySplits = tx.beneficiarySplits?.length
      ? tx.beneficiarySplits
      : user
        ? [{ userId: user.id, percent: 100 }]
        : []
    const payload = {
      type: LOCAL_KEY_TO_TRANSACTION_TYPE[tipo] || 'EXPENSE',
      date: tx.fecha ?? new Date().toISOString().slice(0, 10),
      amount: tipo === 'ajuste' ? Number(tx.importe) : Math.abs(Number(tx.importe)),
      description: tx.descripcion ?? '',
      categoryId: categorias.find(c => c.id === tx.categoria)?.apiId ?? (tx.categoria ?? ''),
      sourceAccountId: String(tx.cuentaId ?? configuracion.cuentaPrincipalId ?? cuentas[0]?.id ?? ''),
      destinationAccountId: (tipo === 'ahorro' || tipo === 'transferencia') ? String(tx.cuentaDestinoId ?? configuracion.cuentaAhorroId ?? configuracion.cuentaTransferenciaDestinoId ?? '') : null,
      visibility: (tx.visibility as Visibility) || Visibility.SHARED,
      paidByUserId: tx.paidByUserId ?? user?.id ?? null,
      beneficiarySplits,
      merchantName: tx.merchantName ?? null,
      tags: tx.tags ?? [],
      notes: tx.notes ?? null,
    }
    await createTxMutation.mutateAsync(payload)
    await refetchTransactions()
  }, [createTxMutation, refetchTransactions, configuracion, cuentas, user, categorias])

  const actualizarTransaccion = useCallback(async (id: string, patch: Partial<SharedTransaction>) => {
    const apiPatch: Record<string, unknown> = {}
    if (patch.categoria) {
      const cat = categorias.find(c => c.id === patch.categoria)
      apiPatch.categoryId = cat?.apiId || patch.categoria
    }
    if (patch.descripcion) apiPatch.description = patch.descripcion
    if (patch.fecha) apiPatch.date = patch.fecha
    if (patch.tipo) apiPatch.type = LOCAL_KEY_TO_TRANSACTION_TYPE[patch.tipo] || patch.tipo
    if (patch.importe != null) apiPatch.amount = Math.abs(Number(patch.importe))
    if (Object.keys(apiPatch).length) {
      await updateTxMutation.mutateAsync({ id, body: apiPatch })
      await refetchTransactions()
    }
  }, [updateTxMutation, refetchTransactions, categorias])

  const eliminarTransaccion = useCallback(async (id: string) => {
    await deleteTxMutation.mutateAsync(id)
    await refetchTransactions()
  }, [deleteTxMutation, refetchTransactions])

  const actualizarCategoria = useCallback(async (id: string, patch: Partial<SharedCategory>) => {
    const category = categorias.find(c => c.id === id)
    if (category?.apiId) {
      await updateCategoryMutation.mutateAsync({ id: category.apiId, body: patch })
      await refetchTransactions()
    }
  }, [updateCategoryMutation, categorias, refetchTransactions])

  const actualizarConfiguracion = useCallback((_key: string, _value: unknown) => {
    // Local only - config derived from settings API
  }, [])

  const actualizarPresupuesto = useCallback((_categoria: string, _limite: number) => {
    // Local only - budgets API not connected yet
  }, [])

  const actualizarCuenta = useCallback((_id: string, _patch: Partial<SharedAccount>) => {
    // Local only
  }, [])

  const previewCsvImport = useCallback(async (file: File) => {
    const content = await file.text()
    return csvPreviewMutation.mutateAsync({
      fileName: file.name || 'movimientos.csv',
      content,
      defaultSourceAccountId: String(configuracion.cuentaPrincipalId),
      defaultDestinationAccountId: String(configuracion.cuentaTransferenciaDestinoId || configuracion.cuentaAhorroId),
    })
  }, [csvPreviewMutation, configuracion])

  const commitCsvImport = useCallback(async (preview: { importBatch: { id: string }; rows: Array<{ rowNumber: number; sourceHash: string; draft: boolean; duplicate: boolean }> }, includeDuplicates = false) => {
    const rows = (preview?.rows || [])
      .filter(row => row.draft && (includeDuplicates || !row.duplicate))
      .map(row => ({ rowNumber: row.rowNumber, sourceHash: row.sourceHash, draft: row.draft }))
    if (!rows.length) throw new Error('No hay filas válidas para importar.')
    const result = await csvCommitMutation.mutateAsync({ id: preview.importBatch.id, body: { includeDuplicates, rows } })
    await refetchTransactions()
    return result
  }, [csvCommitMutation, refetchTransactions])

  return (
    <FinanzasDomainContext.Provider value={{
      transacciones,
      cuentas,
      presupuestos: presupuestosIniciales,
      configuracion,
      categorias,
      patrimonioMensual,
      monthKeys,
      yearKeys,
      stats,
      isLoading,
      isApiEnabled: true,
      dynamicGastoIds,
      getMonthStats,
      getYearStats,
      getPreviousMonthKey,
      getPatrimonioParaMes,
      refreshData: refetchTransactions,
      agregarTransaccion,
      eliminarTransaccion,
      actualizarTransaccion,
      actualizarConfiguracion,
      actualizarPresupuesto,
      actualizarCuenta,
      actualizarCategoria,
      previewCsvImport,
      commitCsvImport,
      categoriasPorTipo: (tipo: string) => {
        if (tipo === 'gasto') return categorias.filter(c => categoryMatches(c, 'EXPENSE'))
        if (tipo === 'ingreso') return [...categorias.filter(c => categoryMatches(c, 'INCOME')), ...categorias.filter(c => categoryMatches(c, 'EXPENSE'))]
        if (tipo === 'ahorro') return categorias.filter(c => categoryMatches(c, 'SAVING'))
        if (tipo === 'transferencia') return categorias.filter(c => categoryMatches(c, 'TRANSFER'))
        if (tipo === 'ajuste') return categorias.filter(c => categoryMatches(c, 'ADJUSTMENT'))
        return categorias
      },
    }}>
      {children}
    </FinanzasDomainContext.Provider>
  )
}

export function useFinanzas(): FinanzasDomainContextValue {
  const ctx = useContext(FinanzasDomainContext)
  if (!ctx) throw new Error('useFinanzas must be used within FinanzasDomainProvider')
  return ctx
}
