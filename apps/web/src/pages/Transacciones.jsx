import React, { useMemo, useState } from 'react'
import { useFinanzas } from '../hooks/useFinanzas.js'
import { TransactionItem } from '../components/TransactionItem.jsx'
import { Icon } from '../components/CategoryIcon.jsx'
import { formatEsNumber } from '../utils/format.js'

function getMonthLabel(fecha) {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

export function Transacciones() {
  const { transacciones, categorias, previewCsvImport, commitCsvImport, isApiEnabled } = useFinanzas()
  const [search, setSearch] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [categoria, setCategoria] = useState('todas')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [csvFile, setCsvFile] = useState(null)
  const [csvPreview, setCsvPreview] = useState(null)
  const [csvResult, setCsvResult] = useState(null)
  const [csvError, setCsvError] = useState('')
  const [csvBusy, setCsvBusy] = useState(false)

  const filtradas = useMemo(() => {
    return transacciones.filter(tx => {
      const okSearch = tx.descripcion.toLowerCase().includes(search.toLowerCase())
      const okTipo = tipo === 'todos' ? true : tx.tipo === tipo
      const okCat = categoria === 'todas' ? true : tx.categoria === categoria
      const okDesde = !desde ? true : tx.fecha >= desde
      const okHasta = !hasta ? true : tx.fecha <= hasta
      return okSearch && okTipo && okCat && okDesde && okHasta
    })
  }, [transacciones, search, tipo, categoria, desde, hasta])

  const agrupadas = useMemo(() => {
    return filtradas.reduce((acc, tx) => {
      const key = getMonthLabel(tx.fecha)
      if (!acc[key]) acc[key] = []
      acc[key].push(tx)
      return acc
    }, {})
  }, [filtradas])

  const meses = Object.keys(agrupadas)

  async function handlePreview() {
    if (!csvFile) return setCsvError('Selecciona un CSV.')
    setCsvBusy(true)
    setCsvError('')
    setCsvResult(null)
    try {
      const preview = await previewCsvImport(csvFile)
      setCsvPreview(preview)
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'No se pudo previsualizar el CSV.')
    } finally {
      setCsvBusy(false)
    }
  }

  async function handleCommit(includeDuplicates = false) {
    if (!csvPreview) return
    setCsvBusy(true)
    setCsvError('')
    try {
      const result = await commitCsvImport(csvPreview, includeDuplicates)
      setCsvResult(result)
      setCsvPreview(null)
      setCsvFile(null)
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : 'No se pudo importar el CSV.')
    } finally {
      setCsvBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold mb-1">Movimientos</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Filtra, revisa y recategoriza tus movimientos</p>
      </div>

      {isApiEnabled && (
        <div className="mx-4 card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Importar CSV</h2>
              <p className="text-xs text-[var(--color-text-muted)]">{csvPreview ? `${csvPreview.summary.total} filas revisadas` : 'Preview y confirmacion'}</p>
            </div>
            <Icon name="FileSpreadsheet" size={18} className="text-[var(--color-primary)]" />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              className="input-base text-xs"
              onChange={event => {
                setCsvFile(event.target.files?.[0] || null)
                setCsvPreview(null)
                setCsvResult(null)
                setCsvError('')
              }}
            />
            <button type="button" disabled={csvBusy || !csvFile} onClick={handlePreview} className="btn-primary min-h-[40px] px-3 flex items-center gap-1.5">
              {csvBusy ? <Icon name="Loader2" size={14} className="animate-spin" /> : <Icon name="Eye" size={14} />}
              Preview
            </button>
          </div>

          {csvPreview && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="rounded-lg bg-[var(--color-surface-offset)] px-2 py-2">
                  <p className="text-sm font-bold">{csvPreview.summary.ready}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Listas</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-offset)] px-2 py-2">
                  <p className="text-sm font-bold">{csvPreview.rows.filter(row => row.suggestedAction === 'review').length}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Revisar</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-offset)] px-2 py-2">
                  <p className="text-sm font-bold">{csvPreview.summary.duplicates}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Duplicadas</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-offset)] px-2 py-2">
                  <p className="text-sm font-bold">{csvPreview.summary.errors}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Errores</p>
                </div>
                <div className="rounded-lg bg-[var(--color-surface-offset)] px-2 py-2">
                  <p className="text-sm font-bold">{csvPreview.summary.warnings}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">Avisos</p>
                </div>
              </div>

              <div className="max-h-48 overflow-auto rounded-lg border border-[var(--color-divider)] divide-y divide-[var(--color-divider)]">
                {csvPreview.rows.slice(0, 8).map(row => {
                  const dotClass = row.status === 'error'
                    ? 'bg-[var(--color-error)]'
                    : row.suggestedAction === 'review'
                      ? 'bg-[#006494]'
                      : row.duplicate
                        ? 'bg-[#d19900]'
                        : 'bg-[var(--color-success)]'
                  const reason = row.reconciliation?.reason
                  return (
                    <div key={`${row.rowNumber}-${row.sourceHash}`} className="px-3 py-2 text-xs flex items-start gap-2">
                      <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{row.display.description || `Fila ${row.rowNumber}`}</p>
                        <p className="text-[var(--color-text-muted)] truncate">
                          {row.display.date || 'Sin fecha'} · {row.display.typeLabel} · {row.display.amount == null ? 'Importe invalido' : formatEsNumber(row.display.amount, { suffix: '€' })}
                        </p>
                        {reason && (
                          <p className="text-[10px] truncate text-[#d19900]">{reason}</p>
                        )}
                        {(row.errors.length > 0 || row.warnings.length > 0) && (
                          <p className="text-[10px] text-[var(--color-text-faint)] truncate">{[...row.errors, ...row.warnings].join(' ')}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={csvBusy || csvPreview.summary.ready === 0} onClick={() => handleCommit(false)} className="btn-primary min-h-[42px] flex items-center justify-center gap-1.5">
                  <Icon name="Upload" size={14} />
                  Importar válidas
                </button>
                <button type="button" disabled={csvBusy || csvPreview.rows.filter(row => row.draft).length === 0} onClick={() => handleCommit(true)} className="btn-secondary min-h-[42px] flex items-center justify-center gap-1.5">
                  <Icon name="CopyPlus" size={14} />
                  Incluir duplicadas
                </button>
              </div>
            </div>
          )}

          {csvResult && (
            <p className="text-xs text-[var(--color-success)] flex items-center gap-1">
              <Icon name="CheckCircle2" size={12} />
              {csvResult.summary.created} importadas · {csvResult.summary.skippedDuplicates} duplicadas omitidas
            </p>
          )}

          {csvError && (
            <p className="text-xs text-[var(--color-error)] flex items-center gap-1">
              <Icon name="AlertTriangle" size={12} />
              {csvError}
            </p>
          )}
        </div>
      )}

      <div className="mx-4 card p-4 flex flex-col gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} className="input-base" placeholder="Buscar descripción..." />
        <div className="grid grid-cols-2 gap-2">
          <select aria-label="Filtrar por tipo" value={tipo} onChange={e => setTipo(e.target.value)} className="input-base">
            <option value="todos">Todos los tipos</option>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
            <option value="ahorro">Ahorro</option>
            <option value="transferencia">Transferencia interna</option>
            <option value="ajuste">Ajuste manual</option>
          </select>
          <select aria-label="Filtrar por categoría" value={categoria} onChange={e => setCategoria(e.target.value)} className="input-base">
            <option value="todas">Todas las categorías</option>
            {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-1.5 bg-[var(--color-surface-offset)] rounded-lg px-2 py-1.5 border border-[var(--color-divider)]">
            <span className="text-[9px] font-bold uppercase text-[var(--color-text-muted)]">De</span>
            <input aria-label="Fecha desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} className="bg-transparent text-[11px] outline-none w-full p-0 border-none" style={{ colorScheme: 'light dark' }} />
          </div>
          <div className="flex-1 flex items-center gap-1.5 bg-[var(--color-surface-offset)] rounded-lg px-2 py-1.5 border border-[var(--color-divider)]">
            <span className="text-[9px] font-bold uppercase text-[var(--color-text-muted)]">A</span>
            <input aria-label="Fecha hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="bg-transparent text-[11px] outline-none w-full p-0 border-none" style={{ colorScheme: 'light dark' }} />
          </div>
        </div>
      </div>

      <div className="mx-4 flex flex-col gap-4">
        {meses.length === 0 ? (
          <div className="card px-4 py-8 text-center text-sm text-[var(--color-text-muted)] flex flex-col items-center gap-2">
            <Icon name="Calendar" size={18} />
            No hay movimientos con los filtros actuales.
          </div>
        ) : (
          meses.map(mes => (
            <section key={mes} className="flex flex-col gap-2">
              <div className="px-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold capitalize">{mes}</h2>
                <span className="text-[10px] text-[var(--color-text-faint)]">{agrupadas[mes].length} movimientos</span>
              </div>
              <div className="card divide-y divide-[var(--color-divider)]">
                {agrupadas[mes].map(tx => <TransactionItem key={tx.id} tx={tx} showDate />)}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
