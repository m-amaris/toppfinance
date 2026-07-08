import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { Visibility } from '@prisma/client'
import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import {
  createTransactionSchema,
  csvPreviewBodySchema as sharedCsvPreviewBodySchema,
  csvCommitBodySchema as sharedCsvCommitBodySchema,
  TransactionType,
} from '@toppfinance/shared'
import { requireAuth } from './auth.js'
import type { AuthUser } from '@toppfinance/shared'
import { prisma } from './db.js'
import { accountVisibilityWhere, assertSplitTotal, buildAccountEntries, dateOnly, toMoney } from '@toppfinance/shared'
import { auditLog } from './logging.js'
import {
  parseCsv,
  parseDateValue,
  parseMoney,
  parseTypeValue,
  parseVisibilityValue,
  splitTags,
  findCategory,
  findAccount,
  makeSourceHash,
  findUser,
  parseBeneficiarySplits,
  defaultSplits,
  TRANSACTION_TYPE_LABELS,
  FALLBACK_CATEGORY_BY_TYPE,
} from '@toppfinance/shared'

// Re-export schemas from shared (they match exactly)
export const csvPreviewBodySchema = sharedCsvPreviewBodySchema
export const csvCommitBodySchema = sharedCsvCommitBodySchema

type CsvRecord = Record<string, unknown>
type ImportDraft = z.infer<typeof createTransactionSchema>

async function buildPreviewRows(input: {
  user: AuthUser
  fileName: string
  content: string
  defaultSourceAccountId?: string | null
  defaultDestinationAccountId?: string | null
}): Promise<import('@toppfinance/shared').BuildPreviewRowsOutput> {
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
    getSharedSplitFromDb(input.user.householdId),
  ])

  const records = parseCsv(input.content)

  const rows: import('@toppfinance/shared').CsvPreviewRow[] = records.map((record, index) => {
    const rowNumber = index + 2
    const warnings: string[] = []
    const errors: string[] = []

    // Extract raw values using shared CSV_COLUMN_ALIASES
    const { CSV_COLUMN_ALIASES } = require('@toppfinance/shared')
    const rawDate = (record as any)[CSV_COLUMN_ALIASES.date[0]] ?? ''
    const rawAmount = (record as any)[CSV_COLUMN_ALIASES.amount[0]] ?? ''
    const rawType = (record as any)[CSV_COLUMN_ALIASES.type[0]] ?? ''
    const rawDescription = (record as any)[CSV_COLUMN_ALIASES.description[0]] ?? ''
    const rawCategory = (record as any)[CSV_COLUMN_ALIASES.category[0]] ?? ''
    const rawSourceAccount = (record as any)[CSV_COLUMN_ALIASES.sourceAccount[0]] ?? ''
    const rawDestinationAccount = (record as any)[CSV_COLUMN_ALIASES.destinationAccount[0]] ?? ''
    const rawVisibility = (record as any)[CSV_COLUMN_ALIASES.visibility[0]] ?? ''
    const rawPaidBy = (record as any)[CSV_COLUMN_ALIASES.paidBy[0]] ?? ''
    const rawBeneficiarySplit = (record as any)[CSV_COLUMN_ALIASES.beneficiarySplit[0]] ?? ''
    const rawMerchant = (record as any)[CSV_COLUMN_ALIASES.merchant[0]] ?? ''
    const rawTags = (record as any)[CSV_COLUMN_ALIASES.tags[0]] ?? ''
    const rawNotes = (record as any)[CSV_COLUMN_ALIASES.notes[0]] ?? ''
    const rawExternalId = (record as any)[CSV_COLUMN_ALIASES.externalId[0]] ?? ''

    // Parse values
    const date = parseDateValue(rawDate)
    const parsedAmount = parseMoney(rawAmount)
    const description = rawDescription.trim()

    // Validate required fields
    if (!date) errors.push('Fecha inválida.')
    if (parsedAmount == null) errors.push('Importe inválido.')
    if (!description) errors.push('Descripción obligatoria.')

    const type = parseTypeValue(rawType, parsedAmount ?? 0)
    const visibility = parseVisibilityValue(rawVisibility)
    const categoryResult = findCategory(rawCategory, type, categories as any)
    if (!categoryResult.category) errors.push('No hay categorías disponibles.')
    if (categoryResult.usedFallback && categoryResult.category) {
      warnings.push(`Categoría no encontrada; se usará ${categoryResult.category.name}.`)
    }

    // Filter accounts by visibility
    const visibleAccounts = accounts.filter(acc =>
      acc.visibility === Visibility.SHARED || acc.ownerUserId === input.user.id
    )

    const sourceResult = findAccount(rawSourceAccount, visibleAccounts, input.defaultSourceAccountId)
    if (sourceResult.usedFallback && sourceResult.account) warnings.push(`Cuenta origen no encontrada; se usará ${sourceResult.account.name}.`)

    let destinationResult = findAccount(rawDestinationAccount, visibleAccounts, input.defaultDestinationAccountId)
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        (!destinationResult.account || destinationResult.account?.id === sourceResult.account?.id)) {
      const alternative = visibleAccounts.find(acc =>
        acc.id !== sourceResult.account?.id &&
        (acc.type === 'SAVINGS' || acc.type === 'SHARED')
      ) ?? visibleAccounts.find(acc => acc.id !== sourceResult.account?.id)
      destinationResult = { account: alternative ?? null, usedFallback: true }
    }
    if (rawDestinationAccount && destinationResult.usedFallback && destinationResult.account) {
      warnings.push(`Cuenta destino no encontrada; se usará ${destinationResult.account.name}.`)
    }

    // Validate accounts per transaction type
    if ((type === TransactionType.EXPENSE || type === TransactionType.INCOME || type === TransactionType.ADJUSTMENT) &&
        !sourceResult.account) {
      errors.push('Falta cuenta origen.')
    }
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        (!sourceResult.account || !destinationResult.account)) {
      errors.push('Faltan cuenta origen y destino.')
    }
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        sourceResult.account?.id === destinationResult.account?.id) {
      errors.push('La cuenta origen y destino no pueden ser la misma.')
    }

    // Parse paid by
    const paidByUser = rawPaidBy ? findUser(users, rawPaidBy) : users.find(u => u.id === input.user.id)
    if (rawPaidBy && !paidByUser) warnings.push('Pagador no encontrado; se usará el usuario actual.')

    // Parse beneficiary splits
    const parsedSplits = parseBeneficiarySplits(rawBeneficiarySplit, users)
    warnings.push(...parsedSplits.warnings)
    const beneficiarySplits = parsedSplits.splits ?? defaultSplits({
      visibility,
      users,
      actorUserId: input.user.id,
      sharedSplit,
    })

    // Build draft
    const draft: ImportDraft = {
      type,
      date: date ?? '1970-01-01',
      amount: type === TransactionType.ADJUSTMENT ? toMoney(parsedAmount ?? 0) : Math.abs(toMoney(parsedAmount ?? 0)),
      description,
      categoryId: categoryResult.category?.id ?? '',
      sourceAccountId: sourceResult.account?.id ?? null,
      destinationAccountId: (type === TransactionType.SAVING || type === TransactionType.TRANSFER)
        ? destinationResult.account?.id ?? null
        : null,
      visibility,
      paidByUserId: paidByUser?.id ?? input.user.id,
      beneficiarySplits,
      merchantName: rawMerchant || null,
      tags: splitTags(rawTags),
      notes: rawNotes || null,
    }

    // Validate against schema
    const schemaResult = createTransactionSchema.safeParse(draft)
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(issue => issue.message))
    }

    // Validate splits
    try {
      assertSplitTotal(beneficiarySplits)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'El reparto debe sumar 100%.')
    }

    // Generate source hash
    const sourceHash = makeSourceHash({
      externalId: rawExternalId,
      draft: {
        type: draft.type,
        date: draft.date,
        amount: draft.amount,
        description: draft.description,
        categoryId: draft.categoryId,
        sourceAccountId: draft.sourceAccountId ?? null,
        destinationAccountId: draft.destinationAccountId ?? null,
        merchantName: draft.merchantName ?? null,
      },
      categoryLabel: rawCategory || categoryResult.category?.slug || '',
      sourceAccountLabel: rawSourceAccount || sourceResult.account?.name || '',
      destinationAccountLabel: rawDestinationAccount || destinationResult.account?.name || '',
    })

    return {
      rowNumber,
      status: (errors.length ? 'error' : 'ready') as 'error' | 'ready',
      duplicate: false,
      sourceHash,
      warnings,
      errors,
      draft: errors.length ? null : draft,
      display: {
        date,
        type,
        typeLabel: TRANSACTION_TYPE_LABELS[type],
        amount: parsedAmount == null ? null : draft.amount,
        description,
        category: categoryResult.category?.name ?? rawCategory,
        sourceAccount: sourceResult.account?.name ?? rawSourceAccount,
        destinationAccount: destinationResult.account?.name ?? rawDestinationAccount,
        visibility,
      },
    }
  })

  // Check for duplicates against existing hashes
  const hashes = rows.filter(row => row.draft).map(row => row.sourceHash)
  const existingHashes = new Set((await prisma.transaction.findMany({
    where: { householdId: input.user.householdId, sourceHash: { in: hashes } },
    select: { sourceHash: true },
  })).map(row => row.sourceHash).filter(Boolean) as string[])

  const rowsWithDupes: import('@toppfinance/shared').CsvPreviewRow[] = rows.map(row => {
    if (row.draft && existingHashes.has(row.sourceHash)) {
      return {
        ...row,
        status: 'duplicate' as const,
        duplicate: true,
        warnings: [...row.warnings, 'Posible duplicado ya existente.'],
      }
    }
    return row
  })

  const warningsCount = rowsWithDupes.reduce((sum, row) => sum + row.warnings.length, 0)

  return {
    rows: rowsWithDupes,
    importBatch: {
      id: '',
      status: 'PREVIEWED',
      rowsCount: rowsWithDupes.length,
      warningsCount,
    },
    summary: {
      total: rowsWithDupes.length,
      ready: rowsWithDupes.filter(r => r.status === 'ready').length,
      duplicates: rowsWithDupes.filter(r => r.duplicate).length,
      errors: rowsWithDupes.filter(r => r.status === 'error').length,
      warnings: warningsCount,
    },
  }
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
      type: created.type as unknown as import('@toppfinance/shared').TransactionType,
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

async function getSharedSplitFromDb(householdId: string): Promise<{ miguelPercent: number; saraPercent: number }> {
  const setting = await prisma.adminSetting.findUnique({
    where: { householdId_key: { householdId, key: 'sharedSplit' } },
  })
  return (setting?.value as { miguelPercent: number; saraPercent: number } | null) ?? { miguelPercent: 50, saraPercent: 50 }
}

export async function registerCsvImportRoutes(app: FastifyInstance) {
  app.post('/api/imports/csv/preview', { preHandler: requireAuth, bodyLimit: 5 * 1024 * 1024 }, async (request, reply) => {
    const user = request.user!
    const body = sharedCsvPreviewBodySchema.parse(request.body)

    const { rows, importBatch: previewBatch, summary: previewSummary } = await buildPreviewRows({
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
    const body = sharedCsvCommitBodySchema.parse(request.body)

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