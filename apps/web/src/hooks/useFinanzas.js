import { useState, useMemo, createContext, useContext, useEffect } from 'react'
import { api } from '../api/client.js'
import {
  transaccionesIniciales,
  cuentasIniciales,
  presupuestosIniciales,
  configuracionInicial,
  CATEGORIAS_GASTO,
  CATEGORIAS_INGRESO,
  CATEGORIAS_AHORRO,
  CATEGORIAS_TRANSFERENCIA,
  CATEGORIAS_AJUSTE,
  CATEGORIAS_EDITABLES_INICIALES,
  patrimonioMensual as patrimonioMensualInicial,
} from '../data/store.js'

export const FinanzasContext = createContext(null)

const API_ENABLED = typeof window !== 'undefined' && import.meta.env.MODE !== 'test'
const DEFAULT_MONTH_KEY = '2026-06'
const SAVINGS_COLOR = '#01696f'
const gastoIdsBase = CATEGORIAS_GASTO.map(c => c.id)
const ingresoIdsBase = CATEGORIAS_INGRESO.map(c => c.id)
const ahorroIdsBase = CATEGORIAS_AHORRO.map(c => c.id)
const transferenciaIdsBase = CATEGORIAS_TRANSFERENCIA.map(c => c.id)
const ajusteIdsBase = CATEGORIAS_AJUSTE.map(c => c.id)

const apiToLocalType = {
  EXPENSE: 'gasto',
  INCOME: 'ingreso',
  SAVING: 'ahorro',
  TRANSFER: 'transferencia',
  ADJUSTMENT: 'ajuste',
}

const localToApiType = {
  gasto: 'EXPENSE',
  ingreso: 'INCOME',
  ahorro: 'SAVING',
  transferencia: 'TRANSFER',
  ajuste: 'ADJUSTMENT',
}

function getInitialDarkMode() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function currentMonthKey() {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function monthKeyFromDate(date) {
  const d = new Date(date + 'T12:00:00')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

function categoryTypeFromId(id) {
  if (gastoIdsBase.includes(id)) return 'EXPENSE'
  if (ingresoIdsBase.includes(id)) return 'INCOME'
  if (ahorroIdsBase.includes(id)) return 'SAVING'
  if (transferenciaIdsBase.includes(id)) return 'TRANSFER'
  if (ajusteIdsBase.includes(id)) return 'ADJUSTMENT'
  return null
}

function localizeCategoryName(name) {
  const replacements = {
    Alimentacion: 'Alimentación',
    Nomina: 'Nómina',
    Educacion: 'Educación',
    'Otros ingresos': 'Otros',
    'Transferencia interna': 'Transferencia interna',
  }
  return replacements[name] || name
}

function mapApiCategory(category) {
  return {
    id: category.slug,
    apiId: category.id,
    label: localizeCategoryName(category.name),
    icon: category.icon,
    color: category.color,
    type: category.type,
  }
}

function accountStyle(account, index) {
  if (account.type === 'SHARED') return { icono: 'Wallet', color: '#01696f', tipo: 'compartida' }
  if (account.type === 'SAVINGS') return { icono: 'PiggyBank', color: '#437a22', tipo: 'ahorro' }
  if (account.type === 'CASH') return { icono: 'Banknote', color: '#d19900', tipo: 'efectivo' }
  return {
    icono: 'Building2',
    color: index % 2 === 0 ? '#006494' : '#7a39bb',
    tipo: 'personal',
  }
}

function mapApiAccount(account, index) {
  const style = accountStyle(account, index)
  return {
    id: account.id,
    apiId: account.id,
    nombre: account.name,
    tipo: style.tipo,
    saldo: Number(account.balance ?? account.openingBalance ?? 0),
    icono: style.icono,
    color: style.color,
    visibility: account.visibility,
    ownerName: account.ownerName,
  }
}

function mapApiTransaction(tx) {
  const tipo = apiToLocalType[tx.type] || 'gasto'
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
    cuentaId: tx.sourceAccountId,
    cuentaDestinoId: tx.destinationAccountId,
    visibility: tx.visibility,
    paidByUserId: tx.paidByUserId,
    merchantName: tx.merchant?.name || null,
    tags: tx.tags || [],
    notes: tx.notes || '',
  }
}

function categoryMatches(cat, type) {
  return cat.type === type || categoryTypeFromId(cat.id) === type
}

function computeMetricsForTransactions(items, categorias, idsGasto, { includeSavingsInPie = false } = {}) {
  const esCategoriaDeGasto = (categoriaId) => idsGasto.includes(categoriaId)
  const esIngresoReal = (tx) => tx.tipo === 'ingreso' && !esCategoriaDeGasto(tx.categoria)
  const esCompensacionDeGasto = (tx) => tx.tipo === 'ingreso' && esCategoriaDeGasto(tx.categoria)

  const ingresosMes = items.filter(esIngresoReal).reduce((s, t) => s + Math.abs(t.importe), 0)
  const gastosMesBrutos = items.filter(t => t.tipo === 'gasto').reduce((s, t) => s + Math.abs(t.importe), 0)
  const recuperacionesSobreGasto = items.filter(esCompensacionDeGasto).reduce((s, t) => s + Math.abs(t.importe), 0)
  const gastosMes = Math.max(0, gastosMesBrutos - recuperacionesSobreGasto)
  const ahorroTransferidoMes = Math.abs(items.filter(t => t.tipo === 'ahorro').reduce((s, t) => s + t.importe, 0))
  const transferenciasInternasMes = Math.abs(items.filter(t => t.tipo === 'transferencia').reduce((s, t) => s + t.importe, 0))
  const ajustesMes = items.filter(t => t.tipo === 'ajuste').reduce((s, t) => s + t.importe, 0)
  const ahorroMes = ahorroTransferidoMes
  const flujoNetoMensual = ingresosMes - gastosMes + ajustesMes

  const porCategoria = {}
  items.forEach(t => {
    if (t.tipo === 'gasto' && esCategoriaDeGasto(t.categoria)) {
      porCategoria[t.categoria] = (porCategoria[t.categoria] || 0) + Math.abs(t.importe)
    }
    if (esCompensacionDeGasto(t)) {
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
    pieData.push({ id: 'ahorro', name: 'Ahorro', value: Number(ahorroMes.toFixed(2)), color: SAVINGS_COLOR })
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

function computePatrimonioMensual(transacciones, cuentas, categorias, idsGasto) {
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

export function useFinanzasProvider() {
  const [transacciones, setTransacciones] = useState(transaccionesIniciales)
  const [cuentas, setCuentas] = useState(cuentasIniciales)
  const [presupuestos, setPresupuestos] = useState(presupuestosIniciales)
  const [configuracion, setConfiguracion] = useState(configuracionInicial)
  const [categorias, setCategorias] = useState(CATEGORIAS_EDITABLES_INICIALES)
  const [darkMode, setDarkMode] = useState(getInitialDarkMode)
  const [authStatus, setAuthStatus] = useState(API_ENABLED ? 'checking' : 'local')
  const [user, setUser] = useState(null)
  const [household, setHousehold] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [apiError, setApiError] = useState('')
  const [remoteLoaded, setRemoteLoaded] = useState(false)

  const categoryGroups = useMemo(() => ({
    gasto: categorias.filter(c => categoryMatches(c, 'EXPENSE')),
    ingreso: categorias.filter(c => categoryMatches(c, 'INCOME')),
    ahorro: categorias.filter(c => categoryMatches(c, 'SAVING')),
    transferencia: categorias.filter(c => categoryMatches(c, 'TRANSFER')),
    ajuste: categorias.filter(c => categoryMatches(c, 'ADJUSTMENT')),
  }), [categorias])

  const dynamicGastoIds = useMemo(() => categoryGroups.gasto.map(c => c.id), [categoryGroups.gasto])

  const patrimonioMensual = useMemo(() => {
    if (!remoteLoaded) return patrimonioMensualInicial
    return computePatrimonioMensual(transacciones, cuentas, categorias, dynamicGastoIds)
  }, [remoteLoaded, transacciones, cuentas, categorias, dynamicGastoIds])

  const monthKeys = useMemo(() => {
    if (transacciones.length === 0) return [remoteLoaded ? currentMonthKey() : DEFAULT_MONTH_KEY]
    const dates = transacciones.map(tx => new Date(tx.fecha + 'T12:00:00'))
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date()

    const keys = []
    let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    const last = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1)

    while (cur <= last) {
      keys.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}`)
      cur.setMonth(cur.getMonth() + 1)
    }
    return keys
  }, [transacciones, remoteLoaded])

  const yearKeys = useMemo(() => {
    if (transacciones.length === 0) return [String(new Date().getFullYear())]
    return [...new Set(transacciones.map(tx => String(new Date(tx.fecha + 'T12:00:00').getFullYear())))].sort()
  }, [transacciones])

  async function loadRemoteData() {
    if (!API_ENABLED) return
    setSyncing(true)
    setApiError('')
    try {
      const [accountsPayload, categoriesPayload, transactionsPayload, settingsPayload] = await Promise.all([
        api.accounts(),
        api.categories(),
        api.transactions(),
        api.settings(),
      ])

      const mappedAccounts = (accountsPayload.accounts || []).map(mapApiAccount)
      const mappedCategories = (categoriesPayload.categories || []).map(mapApiCategory)
      const mappedTransactions = (transactionsPayload.transactions || []).map(mapApiTransaction)

      setCuentas(mappedAccounts)
      setCategorias(mappedCategories.length ? mappedCategories : CATEGORIAS_EDITABLES_INICIALES)
      setTransacciones(mappedTransactions)
      setConfiguracion(prev => {
        const firstAccount = mappedAccounts[0]?.id ?? prev.cuentaPrincipalId
        const savingsAccount = mappedAccounts.find(account => account.tipo === 'ahorro')?.id
          ?? mappedAccounts.find(account => account.tipo === 'compartida')?.id
          ?? mappedAccounts[1]?.id
          ?? firstAccount
        const sharedAccount = mappedAccounts.find(account => account.tipo === 'compartida')?.id ?? savingsAccount
        return {
          ...prev,
          moneda: settingsPayload.currency || prev.moneda,
          cuentaPrincipalId: firstAccount,
          cuentaAhorroId: savingsAccount,
          cuentaTransferenciaDestinoId: sharedAccount,
        }
      })
      setRemoteLoaded(true)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'No se pudo sincronizar con el API')
      throw error
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!API_ENABLED) return
    let cancelled = false

    async function boot() {
      try {
        const session = await api.me()
        if (cancelled) return
        setUser(session.user)
        setHousehold(session.household)
        setAuthStatus('authenticated')
        await loadRemoteData()
      } catch (error) {
        if (cancelled) return
        if (error?.status === 401) {
          setAuthStatus('unauthenticated')
        } else {
          setApiError(error instanceof Error ? error.message : 'No se pudo conectar con el API')
          setAuthStatus('unauthenticated')
        }
      }
    }

    boot()
    return () => { cancelled = true }
  }, [])

  function getMonthStats(monthKey, options = {}) {
    const includeSavingsInPie = options.includeSavingsInPie ?? configuracion.mostrarAhorroEnAnalisis
    const items = transacciones.filter(tx => monthKeyFromDate(tx.fecha) === monthKey)
    const data = computeMetricsForTransactions(items, categorias, dynamicGastoIds, { includeSavingsInPie })
    return { ...data, monthKey, transacciones: items }
  }

  function getYearStats(year, options = {}) {
    const includeSavingsInPie = options.includeSavingsInPie ?? configuracion.mostrarAhorroEnAnalisis
    const items = transacciones.filter(tx => String(new Date(tx.fecha + 'T12:00:00').getFullYear()) === String(year))
    const data = computeMetricsForTransactions(items, categorias, dynamicGastoIds, { includeSavingsInPie })
    return { ...data, year: String(year), transacciones: items }
  }

  function getPreviousMonthKey(monthKey) {
    const index = monthKeys.indexOf(monthKey)
    return index > 0 ? monthKeys[index - 1] : null
  }

  function getPatrimonioParaMes(monthKey) {
    return patrimonioMensual.find(m => m.key === monthKey)?.patrimonio ?? cuentas.reduce((s, c) => s + c.saldo, 0)
  }

  const stats = useMemo(() => {
    const selectedMonth = monthKeys.includes(DEFAULT_MONTH_KEY) ? DEFAULT_MONTH_KEY : (monthKeys.at(-1) || currentMonthKey())
    const base = getMonthStats(selectedMonth, { includeSavingsInPie: false })
    const patrimonioTotal = cuentas.reduce((s, c) => s + c.saldo, 0)
    const cumplimientoAhorro = configuracion.tasaAhorroObjetivo > 0 ? (base.tasaAhorroReal / configuracion.tasaAhorroObjetivo) * 100 : 0
    return {
      ...base,
      patrimonioTotal: Number(patrimonioTotal.toFixed(2)),
      cumplimientoAhorro: Number(cumplimientoAhorro.toFixed(2)),
    }
  }, [cuentas, configuracion.tasaAhorroObjetivo, transacciones, categorias, monthKeys, dynamicGastoIds])

  function findApiCategoryId(localId) {
    return categorias.find(c => c.id === localId)?.apiId ?? localId
  }

  function buildApiTransactionPayload(tx) {
    const tipo = tx.tipo || (tx.importe > 0 ? 'ingreso' : 'gasto')
    const apiType = localToApiType[tipo] || 'EXPENSE'
    const sourceAccountId = tx.cuentaId || configuracion.cuentaPrincipalId || cuentas[0]?.id || null
    const destinationAccountId = tx.cuentaDestinoId
      || (tipo === 'ahorro' ? configuracion.cuentaAhorroId : tipo === 'transferencia' ? configuracion.cuentaTransferenciaDestinoId : null)

    return {
      type: apiType,
      date: tx.fecha,
      amount: apiType === 'ADJUSTMENT' ? Number(tx.importe) : Math.abs(Number(tx.importe)),
      description: tx.descripcion,
      categoryId: findApiCategoryId(tx.categoria),
      sourceAccountId,
      destinationAccountId: apiType === 'SAVING' || apiType === 'TRANSFER' ? destinationAccountId : null,
      visibility: tx.visibility || 'SHARED',
      paidByUserId: tx.paidByUserId || user?.id || null,
      beneficiarySplits: tx.beneficiarySplits || (user ? [{ userId: user.id, percent: 100 }] : []),
      merchantName: tx.merchantName || null,
      tags: tx.tags || [],
      notes: tx.notes || null,
    }
  }

  async function agregarTransaccion(tx) {
    const tipo = tx.tipo || (tx.importe > 0 ? 'ingreso' : 'gasto')

    if (API_ENABLED && authStatus === 'authenticated') {
      setApiError('')
      try {
        await api.createTransaction(buildApiTransactionPayload({ ...tx, tipo }))
        await loadRemoteData()
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'No se pudo crear el movimiento')
        throw error
      }
      return
    }

    const nueva = { ...tx, id: Date.now(), tipo }
    setTransacciones(prev => [nueva, ...prev])

    const cuentaPrincipalId = tx.cuentaId || configuracion.cuentaPrincipalId
    const cuentaDestinoId = tx.cuentaDestinoId || (tipo === 'ahorro' ? configuracion.cuentaAhorroId : tipo === 'transferencia' ? configuracion.cuentaTransferenciaDestinoId : null)

    setCuentas(prev => prev.map(c => {
      if (c.id === cuentaPrincipalId) {
        return { ...c, saldo: Number((c.saldo + tx.importe).toFixed(2)) }
      }
      if ((tipo === 'ahorro' || tipo === 'transferencia') && cuentaDestinoId && c.id === cuentaDestinoId) {
        return { ...c, saldo: Number((c.saldo + Math.abs(tx.importe)).toFixed(2)) }
      }
      return c
    }))
  }

  async function eliminarTransaccion(id) {
    if (API_ENABLED && authStatus === 'authenticated') {
      setApiError('')
      try {
        await api.deleteTransaction(id)
        await loadRemoteData()
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'No se pudo eliminar el movimiento')
      }
      return
    }

    const tx = transacciones.find(t => t.id === id)
    if (!tx) return

    setTransacciones(prev => prev.filter(t => t.id !== id))

    const cuentaPrincipalId = tx.cuentaId || configuracion.cuentaPrincipalId
    const cuentaDestinoId = tx.cuentaDestinoId || (tx.tipo === 'ahorro' ? configuracion.cuentaAhorroId : tx.tipo === 'transferencia' ? configuracion.cuentaTransferenciaDestinoId : null)

    setCuentas(prev => prev.map(c => {
      if (c.id === cuentaPrincipalId) {
        return { ...c, saldo: Number((c.saldo - tx.importe).toFixed(2)) }
      }
      if ((tx.tipo === 'ahorro' || tx.tipo === 'transferencia') && cuentaDestinoId && c.id === cuentaDestinoId) {
        return { ...c, saldo: Number((c.saldo - Math.abs(tx.importe)).toFixed(2)) }
      }
      return c
    }))
  }

  function actualizarTransaccion(id, patch) {
    setTransacciones(prev => prev.map(tx => tx.id === id ? { ...tx, ...patch } : tx))

    if (API_ENABLED && authStatus === 'authenticated') {
      const apiPatch = {}
      if (patch.categoria) apiPatch.categoryId = findApiCategoryId(patch.categoria)
      if (patch.descripcion) apiPatch.description = patch.descripcion
      if (patch.fecha) apiPatch.date = patch.fecha
      if (patch.tipo) apiPatch.type = localToApiType[patch.tipo] || patch.tipo
      if (patch.importe != null) apiPatch.amount = Math.abs(Number(patch.importe))
      if (Object.keys(apiPatch).length) {
        api.updateTransaction(id, apiPatch)
          .then(loadRemoteData)
          .catch(error => setApiError(error instanceof Error ? error.message : 'No se pudo actualizar el movimiento'))
      }
    }
  }

  function toggleDark() {
    setDarkMode(d => !d)
  }

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', darkMode)
    }
  }, [darkMode])

  function actualizarConfiguracion(key, value) {
    setConfiguracion(prev => ({ ...prev, [key]: value }))
  }

  function actualizarPresupuesto(categoria, limite) {
    setPresupuestos(prev => prev.map(p => p.categoria === categoria ? { ...p, limite: Number(limite) } : p))
  }

  function actualizarCuenta(id, patch) {
    setCuentas(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  function actualizarCategoria(id, patch) {
    setCategorias(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    const category = categorias.find(c => c.id === id)
    if (API_ENABLED && authStatus === 'authenticated' && category?.apiId) {
      api.updateCategory(category.apiId, patch)
        .catch(error => setApiError(error instanceof Error ? error.message : 'No se pudo actualizar la categoria'))
    }
  }

  function categoriasPorTipo(tipo) {
    if (tipo === 'gasto') return categoryGroups.gasto
    if (tipo === 'ingreso') return [...categoryGroups.ingreso, ...categoryGroups.gasto]
    if (tipo === 'ahorro') return categoryGroups.ahorro
    if (tipo === 'transferencia') return categoryGroups.transferencia
    if (tipo === 'ajuste') return categoryGroups.ajuste
    return categorias
  }

  async function login(email, password) {
    setApiError('')
    const session = await api.login(email, password)
    setUser(session.user)
    setHousehold(session.household)
    setAuthStatus('authenticated')
    await loadRemoteData()
  }

  async function logout() {
    setApiError('')
    try {
      await api.logout()
    } finally {
      setAuthStatus('unauthenticated')
      setUser(null)
      setHousehold(null)
      setRemoteLoaded(false)
      setTransacciones(transaccionesIniciales)
      setCuentas(cuentasIniciales)
      setCategorias(CATEGORIAS_EDITABLES_INICIALES)
    }
  }

  async function previewCsvImport(file) {
    if (!API_ENABLED) throw new Error('La importacion CSV necesita el API activo.')
    const content = await file.text()
    return api.previewCsv({
      fileName: file.name || 'movimientos.csv',
      content,
      defaultSourceAccountId: configuracion.cuentaPrincipalId,
      defaultDestinationAccountId: configuracion.cuentaTransferenciaDestinoId || configuracion.cuentaAhorroId,
    })
  }

  async function commitCsvImport(preview, includeDuplicates = false) {
    const rows = (preview?.rows || [])
      .filter(row => row.draft && (includeDuplicates || !row.duplicate))
      .map(row => ({ rowNumber: row.rowNumber, sourceHash: row.sourceHash, draft: row.draft }))

    if (!rows.length) throw new Error('No hay filas validas para importar.')

    const result = await api.commitCsv(preview.importBatch.id, { includeDuplicates, rows })
    await loadRemoteData()
    return result
  }

  return {
    transacciones,
    cuentas,
    presupuestos,
    configuracion,
    categorias,
    patrimonioMensual,
    monthKeys,
    yearKeys,
    stats,
    darkMode,
    authStatus,
    user,
    household,
    isAuthenticated: authStatus === 'authenticated' || authStatus === 'local',
    isApiEnabled: API_ENABLED,
    syncing,
    apiError,
    login,
    logout,
    refreshData: loadRemoteData,
    previewCsvImport,
    commitCsvImport,
    agregarTransaccion,
    eliminarTransaccion,
    actualizarTransaccion,
    toggleDark,
    actualizarConfiguracion,
    actualizarPresupuesto,
    actualizarCuenta,
    actualizarCategoria,
    categoriasPorTipo,
    getMonthStats,
    getYearStats,
    getPreviousMonthKey,
    getPatrimonioParaMes,
    CATEGORIAS_GASTO: categoryGroups.gasto,
    CATEGORIAS_INGRESO: categoryGroups.ingreso,
    CATEGORIAS_AHORRO: categoryGroups.ahorro,
    CATEGORIAS_TRANSFERENCIA: categoryGroups.transferencia,
    CATEGORIAS_AJUSTE: categoryGroups.ajuste,
  }
}

export function useFinanzas() {
  return useContext(FinanzasContext)
}
