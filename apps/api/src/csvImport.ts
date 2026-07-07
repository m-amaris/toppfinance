import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { TransactionType, Visibility } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { createTransactionSchema } from '@toppfinance/shared'
import { requireAuth, type AuthUser } from './auth.js'
import { prisma } from './db.js'
import { accountVisibilityWhere, assertSplitTotal, buildAccountEntries, dateOnly, toMoney } from './finance.js'
import { auditLog } from './logging.js'

const csvPreviewBodySchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  content: z.string().min(1),
  defaultSourceAccountId: z.string().optional().nullable(),
  defaultDestinationAccountId: z.string().optional().nullable(),
})

const csvCommitBodySchema = z.object({
  includeDuplicates: z.boolean().default(false),
  rows: z.array(z.object({
    rowNumber: z.number().int().positive(),
    sourceHash: z.string().min(16),
    draft: createTransactionSchema,
  })).min(1),
})

type CsvRecord = Record<string, unknown>
type ImportDraft = z.infer<typeof createTransactionSchema>

const typeLabels: Record<TransactionType, string> = {
  EXPENSE: 'Gasto',
  INCOME: 'Ingreso',
  SAVING: 'Ahorro',
  TRANSFER: 'Transferencia',
  ADJUSTMENT: 'Ajuste',
}

const fallbackCategoryByType: Record<TransactionType, string> = {
  EXPENSE: 'otros',
  INCOME: 'otros_ingreso',
  SAVING: 'ahorro',
  TRANSFER: 'transferencia_interna',
  ADJUSTMENT: 'ajuste_manual',
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function pick(record: CsvRecord, aliases: string[]) {
  const normalizedAliases = aliases.map(normalizeText)
  const found = Object.entries(record).find(([key]) => normalizedAliases.includes(normalizeText(key)))
  return found ? String(found[1] ?? '').trim() : ''
}

function detectDelimiter(content: string) {
  const firstLine = content.split(/\r?\n/).find(line => line.trim()) ?? ''
  const candidates = [';', ',', '\t']
  return candidates
    .map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ';'
}

function parseCsv(content: string) {
  return parse(content, {
    bom: true,
    columns: true,
    delimiter: detectDelimiter(content),
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: true,
  }) as CsvRecord[]
}

function parseDateValue(raw: string) {
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3]
    return `${year}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

function parseAmountValue(raw: string) {
  const value = raw.replace(/[€\s]/g, '').trim()
  if (!value) return null

  const lastComma = value.lastIndexOf(',')
  const lastDot = value.lastIndexOf('.')
  const normalized = lastComma > -1 && lastDot > -1
    ? lastComma > lastDot
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(/,/g, '')
    : value.replace(',', '.')

  const amount = Number(normalized)
  return Number.isFinite(amount) ? amount : null
}

function parseTypeValue(raw: string, amount: number): TransactionType {
  const value = normalizeText(raw)
  if (['gasto', 'expense', 'debit', 'cargo'].includes(value)) return 'EXPENSE'
  if (['ingreso', 'income', 'credit', 'abono'].includes(value)) return 'INCOME'
  if (['ahorro', 'saving', 'savings'].includes(value)) return 'SAVING'
  if (['transferencia', 'transfer', 'traspaso', 'transferencia interna'].includes(value)) return 'TRANSFER'
  if (['ajuste', 'adjustment', 'ajuste manual'].includes(value)) return 'ADJUSTMENT'
  return amount < 0 ? 'EXPENSE' : 'INCOME'
}

function parseVisibilityValue(raw: string): Visibility {
  const value = normalizeText(raw)
  if (['private', 'privado', 'privada'].includes(value)) return 'PRIVATE'
  return 'SHARED'
}

function splitTags(raw: string) {
  return raw
    .split(/[|,]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20)
}

function makeSourceHash(input: {
  externalId: string
  draft: ImportDraft
  categoryLabel: string
  sourceAccountLabel: string
  destinationAccountLabel: string
}) {
  const basis = input.externalId || JSON.stringify({
    type: input.draft.type,
    date: input.draft.date,
    amount: input.draft.amount,
    description: normalizeText(input.draft.description),
    category: normalizeText(input.categoryLabel),
    source: normalizeText(input.sourceAccountLabel),
    destination: normalizeText(input.destinationAccountLabel),
    merchant: normalizeText(input.draft.merchantName),
  })

  return createHash('sha256').update(basis).digest('hex')
}

function findUser(users: Array<{ id: string; email: string; displayName: string }>, raw: string) {
  const value = normalizeText(raw)
  return users.find(user => normalizeText(user.email) === value || normalizeText(user.displayName) === value)
}

function splitParts(raw: string) {
  if (!raw.trim()) return []
  const delimiter = raw.includes('|') ? '|' : ','
  return raw.split(delimiter).map(part => part.trim()).filter(Boolean)
}

function parseBeneficiarySplits(raw: string, users: Array<{ id: string; email: string; displayName: string }>) {
  const warnings: string[] = []
  const parts = splitParts(raw)
  if (!parts.length) return { splits: null, warnings }

  const splits = parts.map(part => {
    const [userValue, percentValue] = part.split('=')
    const user = findUser(users, userValue ?? '')
    const percent = Number(String(percentValue ?? '').replace(',', '.'))
    if (!user || !Number.isFinite(percent)) return null
    return { userId: user.id, percent }
  })

  if (splits.some(split => split == null)) {
    warnings.push('No se ha podido leer el reparto; se usara el reparto por defecto.')
    return { splits: null, warnings }
  }

  const parsedSplits = splits as Array<{ userId: string; percent: number }>
  const total = parsedSplits.reduce((sum, split) => sum + split.percent, 0)
  if (Math.abs(total - 100) > 0.01) {
    warnings.push('El reparto del CSV no suma 100%; se usara el reparto por defecto.')
    return { splits: null, warnings }
  }

  return { splits: parsedSplits, warnings }
}

function equalSplits(users: Array<{ id: string }>) {
  const base = Number((100 / users.length).toFixed(2))
  return users.map((user, index) => ({
    userId: user.id,
    percent: index === users.length - 1 ? Number((100 - base * (users.length - 1)).toFixed(2)) : base,
  }))
}

function defaultSplits(input: {
  visibility: Visibility
  users: Array<{ id: string; email: string; displayName: string }>
  actorUserId: string
  sharedSplit: { miguelPercent: number; saraPercent: number }
}) {
  if (input.visibility !== 'SHARED' || input.users.length < 2) {
    return [{ userId: input.actorUserId, percent: 100 }]
  }

  const miguel = input.users.find(user => normalizeText(user.displayName).includes('miguel') || normalizeText(user.email).includes('miguel'))
  const sara = input.users.find(user => normalizeText(user.displayName).includes('sara') || normalizeText(user.email).includes('sara'))
  if (miguel && sara) {
    return [
      { userId: miguel.id, percent: input.sharedSplit.miguelPercent },
      { userId: sara.id, percent: input.sharedSplit.saraPercent },
    ]
  }

  return equalSplits(input.users)
}

async function getSharedSplit(householdId: string) {
  const setting = await prisma.adminSetting.findUnique({
    where: { householdId_key: { householdId, key: 'sharedSplit' } },
  })
  const value = setting?.value as { miguelPercent?: unknown; saraPercent?: unknown } | undefined
  const miguelPercent = Number(value?.miguelPercent ?? 50)
  const saraPercent = Number(value?.saraPercent ?? 50)
  return {
    miguelPercent: Number.isFinite(miguelPercent) ? miguelPercent : 50,
    saraPercent: Number.isFinite(saraPercent) ? saraPercent : 50,
  }
}

async function buildPreviewRows(input: {
  user: AuthUser
  fileName: string
  content: string
  defaultSourceAccountId?: string | null
  defaultDestinationAccountId?: string | null
}) {
  const [categories, accounts, users, sharedSplit] = await Promise.all([
    prisma.category.findMany({ where: { householdId: input.user.householdId, archived: false } }),
    prisma.account.findMany({
      where: accountVisibilityWhere(input.user.id, input.user.householdId),
      orderBy: [{ visibility: 'asc' }, { name: 'asc' }],
    }),
    prisma.user.findMany({
      where: { householdId: input.user.householdId, active: true },
      orderBy: { displayName: 'asc' },
      select: { id: true, email: true, displayName: true },
    }),
    getSharedSplit(input.user.householdId),
  ])

  const records = parseCsv(input.content)
  const findCategory = (raw: string, type: TransactionType) => {
    const value = normalizeText(raw)
    const found = categories.find(category =>
      normalizeText(category.slug) === value
      || normalizeText(category.name) === value
      || normalizeText(category.id) === value
    )
    if (found) return { category: found, usedFallback: false }

    const fallbackSlug = fallbackCategoryByType[type]
    const fallback = categories.find(category => category.slug === fallbackSlug) ?? categories[0]
    return { category: fallback, usedFallback: true }
  }

  type PreviewAccount = typeof accounts[number]
  const findAccount = (raw: string, fallbackId?: string | null): { account: PreviewAccount | null; usedFallback: boolean } => {
    const value = normalizeText(raw)
    const byCsv = value
      ? accounts.find(account => normalizeText(account.id) === value || normalizeText(account.name) === value)
      : null
    if (byCsv) return { account: byCsv, usedFallback: false }

    const byFallback = fallbackId ? accounts.find(account => account.id === fallbackId) : null
    if (byFallback) return { account: byFallback, usedFallback: Boolean(raw) }

    return { account: accounts[0] ?? null, usedFallback: true }
  }

  const rows = records.map((record, index) => {
    const rowNumber = index + 2
    const warnings: string[] = []
    const errors: string[] = []

    const rawDate = pick(record, ['date', 'fecha', 'booking_date'])
    const rawAmount = pick(record, ['amount_eur', 'amount', 'importe', 'cantidad'])
    const rawType = pick(record, ['type', 'tipo'])
    const rawDescription = pick(record, ['description', 'descripcion', 'concepto', 'merchant_description'])
    const rawCategory = pick(record, ['category', 'categoria', 'category_slug'])
    const rawSourceAccount = pick(record, ['source_account', 'source_account_name', 'cuenta', 'cuenta_origen'])
    const rawDestinationAccount = pick(record, ['destination_account', 'destination_account_name', 'cuenta_destino'])
    const rawVisibility = pick(record, ['visibility', 'visibilidad'])
    const rawPaidBy = pick(record, ['paid_by_email', 'pagado_por'])
    const rawBeneficiarySplit = pick(record, ['beneficiary_split', 'reparto'])
    const rawMerchant = pick(record, ['merchant', 'comercio'])
    const rawTags = pick(record, ['tags', 'etiquetas'])
    const rawNotes = pick(record, ['notes', 'notas'])
    const rawExternalId = pick(record, ['external_id', 'id_externo', 'bank_id'])

    const date = parseDateValue(rawDate)
    const parsedAmount = parseAmountValue(rawAmount)
    const description = rawDescription.trim()

    if (!date) errors.push('Fecha invalida.')
    if (parsedAmount == null) errors.push('Importe invalido.')
    if (!description) errors.push('Descripcion obligatoria.')

    const type = parseTypeValue(rawType, parsedAmount ?? 0)
    const visibility = parseVisibilityValue(rawVisibility)
    const categoryResult = findCategory(rawCategory, type)
    if (!categoryResult.category) errors.push('No hay categorias disponibles.')
    if (categoryResult.usedFallback) warnings.push(`Categoria no encontrada; se usara ${categoryResult.category?.name ?? 'la primera disponible'}.`)

    const sourceResult = findAccount(rawSourceAccount, input.defaultSourceAccountId)
    if (sourceResult.usedFallback && sourceResult.account) warnings.push(`Cuenta origen no encontrada; se usara ${sourceResult.account.name}.`)

    let destinationResult = findAccount(rawDestinationAccount, input.defaultDestinationAccountId)
    if ((type === 'SAVING' || type === 'TRANSFER') && (!destinationResult.account || destinationResult.account.id === sourceResult.account?.id)) {
      const alternative = accounts.find(account => account.id !== sourceResult.account?.id && (account.type === 'SAVINGS' || account.type === 'SHARED'))
        ?? accounts.find(account => account.id !== sourceResult.account?.id)
      destinationResult = { account: alternative ?? null, usedFallback: true }
    }
    if (rawDestinationAccount && destinationResult.usedFallback && destinationResult.account) {
      warnings.push(`Cuenta destino no encontrada; se usara ${destinationResult.account.name}.`)
    }

    if ((type === 'EXPENSE' || type === 'INCOME' || type === 'ADJUSTMENT') && !sourceResult.account) {
      errors.push('Falta cuenta origen.')
    }
    if ((type === 'SAVING' || type === 'TRANSFER') && (!sourceResult.account || !destinationResult.account)) {
      errors.push('Faltan cuenta origen y destino.')
    }
    if ((type === 'SAVING' || type === 'TRANSFER') && sourceResult.account?.id === destinationResult.account?.id) {
      errors.push('La cuenta origen y destino no pueden ser la misma.')
    }

    const paidByUser = rawPaidBy ? findUser(users, rawPaidBy) : users.find(user => user.id === input.user.id)
    if (rawPaidBy && !paidByUser) warnings.push('Pagador no encontrado; se usara el usuario actual.')

    const parsedSplits = parseBeneficiarySplits(rawBeneficiarySplit, users)
    warnings.push(...parsedSplits.warnings)
    const beneficiarySplits = parsedSplits.splits ?? defaultSplits({
      visibility,
      users,
      actorUserId: input.user.id,
      sharedSplit,
    })

    const draft: ImportDraft = {
      type,
      date: date ?? '1970-01-01',
      amount: type === 'ADJUSTMENT' ? toMoney(parsedAmount ?? 0) : Math.abs(toMoney(parsedAmount ?? 0)),
      description,
      categoryId: categoryResult.category?.id ?? '',
      sourceAccountId: sourceResult.account?.id ?? null,
      destinationAccountId: (type === 'SAVING' || type === 'TRANSFER') ? destinationResult.account?.id ?? null : null,
      visibility,
      paidByUserId: paidByUser?.id ?? input.user.id,
      beneficiarySplits,
      merchantName: rawMerchant || null,
      tags: splitTags(rawTags),
      notes: rawNotes || null,
    }

    const schemaResult = createTransactionSchema.safeParse(draft)
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(issue => issue.message))
    }

    try {
      assertSplitTotal(beneficiarySplits)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'El reparto debe sumar 100%.')
    }

    const sourceHash = makeSourceHash({
      externalId: rawExternalId,
      draft,
      categoryLabel: rawCategory || categoryResult.category?.slug || '',
      sourceAccountLabel: rawSourceAccount || sourceResult.account?.name || '',
      destinationAccountLabel: rawDestinationAccount || destinationResult.account?.name || '',
    })

    return {
      rowNumber,
      status: errors.length ? 'error' : 'ready',
      duplicate: false,
      sourceHash,
      warnings,
      errors,
      draft: errors.length ? null : draft,
      display: {
        date,
        type,
        typeLabel: typeLabels[type],
        amount: parsedAmount == null ? null : draft.amount,
        description,
        category: categoryResult.category?.name ?? rawCategory,
        sourceAccount: sourceResult.account?.name ?? rawSourceAccount,
        destinationAccount: destinationResult.account?.name ?? rawDestinationAccount,
        visibility,
      },
    }
  })

  const hashes = rows.filter(row => row.draft).map(row => row.sourceHash)
  const existingHashes = new Set((await prisma.transaction.findMany({
    where: { householdId: input.user.householdId, sourceHash: { in: hashes } },
    select: { sourceHash: true },
  })).map(row => row.sourceHash).filter(Boolean) as string[])

  return rows.map(row => {
    if (row.draft && existingHashes.has(row.sourceHash)) {
      return {
        ...row,
        status: 'duplicate',
        duplicate: true,
        warnings: [...row.warnings, 'Posible duplicado ya existente.'],
      }
    }
    return row
  })
}

async function createImportedTransaction(input: {
  user: AuthUser
  importBatchId: string
  sourceHash: string
  draft: ImportDraft
}) {
  const body = createTransactionSchema.parse(input.draft)
  assertSplitTotal(body.beneficiarySplits)

  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, householdId: input.user.householdId, archived: false },
  })
  if (!category) throw new Error('Categoria invalida')

  const accountIds = [body.sourceAccountId, body.destinationAccountId].filter(Boolean) as string[]
  if (accountIds.length) {
    const count = await prisma.account.count({
      where: { id: { in: accountIds }, ...accountVisibilityWhere(input.user.id, input.user.householdId) },
    })
    if (count !== accountIds.length) throw new Error('Cuenta invalida o sin permisos')
  }

  const beneficiaryUsers = await prisma.user.findMany({
    where: {
      householdId: input.user.householdId,
      id: { in: body.beneficiarySplits.map(split => split.userId) },
      active: true,
    },
  })
  if (beneficiaryUsers.length !== body.beneficiarySplits.length) throw new Error('Beneficiario invalido')

  const merchant = body.merchantName
    ? await prisma.merchant.upsert({
        where: {
          householdId_normalizedName: {
            householdId: input.user.householdId,
            normalizedName: body.merchantName.toLowerCase().trim(),
          },
        },
        create: {
          householdId: input.user.householdId,
          name: body.merchantName.trim(),
          normalizedName: body.merchantName.toLowerCase().trim(),
        },
        update: {},
      })
    : null

  return prisma.$transaction(async tx => {
    const created = await tx.transaction.create({
      data: {
        householdId: input.user.householdId,
        type: body.type,
        date: dateOnly(body.date),
        amount: body.type === 'ADJUSTMENT' ? toMoney(body.amount) : Math.abs(toMoney(body.amount)),
        description: body.description,
        categoryId: body.categoryId,
        merchantId: merchant?.id ?? null,
        sourceAccountId: body.sourceAccountId ?? null,
        destinationAccountId: body.destinationAccountId ?? null,
        visibility: body.visibility,
        paidByUserId: body.paidByUserId ?? null,
        createdByUserId: input.user.id,
        notes: body.notes ?? null,
        importBatchId: input.importBatchId,
        sourceHash: input.sourceHash,
        beneficiaries: {
          create: body.beneficiarySplits.map(split => ({
            userId: split.userId,
            percent: split.percent,
          })),
        },
      },
    })

    const entries = buildAccountEntries({
      transactionId: created.id,
      type: created.type,
      amount: Number(created.amount),
      sourceAccountId: created.sourceAccountId,
      destinationAccountId: created.destinationAccountId,
    })
    if (entries.length) await tx.accountEntry.createMany({ data: entries })

    for (const tagName of [...new Set(body.tags)]) {
      const tag = await tx.tag.upsert({
        where: { householdId_name: { householdId: input.user.householdId, name: tagName } },
        create: { householdId: input.user.householdId, name: tagName },
        update: {},
      })
      await tx.transactionTag.create({ data: { transactionId: created.id, tagId: tag.id } })
    }

    return created
  })
}

export async function registerCsvImportRoutes(app: FastifyInstance) {
  app.post('/api/imports/csv/preview', { preHandler: requireAuth, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const user = request.user!
    const body = csvPreviewBodySchema.parse(request.body)

    const rows = await buildPreviewRows({
      user,
      fileName: body.fileName,
      content: body.content,
      defaultSourceAccountId: body.defaultSourceAccountId,
      defaultDestinationAccountId: body.defaultDestinationAccountId,
    })

    const warningsCount = rows.reduce((sum, row) => sum + row.warnings.length, 0)
    const importBatch = await prisma.importBatch.create({
      data: {
        householdId: user.householdId,
        importedById: user.id,
        fileName: body.fileName,
        status: 'PREVIEWED',
        rowsCount: rows.length,
        warningsCount,
      },
    })

    await auditLog({
      householdId: user.householdId,
      actorUserId: user.id,
      entity: 'import',
      entityId: importBatch.id,
      action: 'previewCsv',
      metadata: { fileName: body.fileName, rowsCount: rows.length, warningsCount },
    })

    return {
      importBatch,
      summary: {
        total: rows.length,
        ready: rows.filter(row => row.status === 'ready').length,
        duplicates: rows.filter(row => row.duplicate).length,
        errors: rows.filter(row => row.status === 'error').length,
        warnings: warningsCount,
      },
      rows,
    }
  })

  app.post('/api/imports/csv/:id/commit', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = z.object({ id: z.string().min(1) }).parse(request.params)
    const body = csvCommitBodySchema.parse(request.body)

    const importBatch = await prisma.importBatch.findFirst({
      where: { id: params.id, householdId: user.householdId, status: 'PREVIEWED' },
    })
    if (!importBatch) return reply.code(404).send({ error: 'Importacion no encontrada o ya confirmada' })

    const createdIds: string[] = []
    const skippedDuplicates: Array<{ rowNumber: number; sourceHash: string }> = []
    const failed: Array<{ rowNumber: number; error: string }> = []

    for (const row of body.rows) {
      const existing = await prisma.transaction.findFirst({
        where: { householdId: user.householdId, sourceHash: row.sourceHash },
        select: { id: true },
      })
      if (existing && !body.includeDuplicates) {
        skippedDuplicates.push({ rowNumber: row.rowNumber, sourceHash: row.sourceHash })
        continue
      }

      try {
        const created = await createImportedTransaction({
          user,
          importBatchId: importBatch.id,
          sourceHash: row.sourceHash,
          draft: row.draft,
        })
        createdIds.push(created.id)
      } catch (error) {
        failed.push({ rowNumber: row.rowNumber, error: error instanceof Error ? error.message : 'Error desconocido' })
      }
    }

    const status = createdIds.length > 0 || skippedDuplicates.length > 0 ? 'COMMITTED' : 'FAILED'
    await prisma.importBatch.update({
      where: { id: importBatch.id },
      data: {
        status,
        committedAt: new Date(),
        warningsCount: skippedDuplicates.length + failed.length,
      },
    })

    await auditLog({
      householdId: user.householdId,
      actorUserId: user.id,
      entity: 'import',
      entityId: importBatch.id,
      action: 'commitCsv',
      metadata: { created: createdIds.length, skippedDuplicates: skippedDuplicates.length, failed: failed.length },
    })

    return {
      ok: failed.length === 0,
      summary: {
        created: createdIds.length,
        skippedDuplicates: skippedDuplicates.length,
        failed: failed.length,
      },
      createdIds,
      skippedDuplicates,
      failed,
    }
  })
}
