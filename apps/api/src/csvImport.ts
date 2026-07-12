import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import {
  absMoney,
  accountVisibilityWhere,
  assertSplitTotal,
  buildAccountEntries,
  buildPreviewRows,
  computeImportFingerprint,
  createTransactionSchema,
  csvCommitBodySchema as sharedCsvCommitBodySchema,
  csvCommitParamsSchema,
  csvPreviewBodySchema as sharedCsvPreviewBodySchema,
  dateOnly,
  fromCents,
  normalizeCsvRow,
  parseCsv,
  toCents,
  toIsoDateString,
  toMoney,
  TransactionType,
  Visibility,
} from '@toppfinance/shared'
import type {
  AuthUser,
  CreateTransactionInput,
  ImportClassificationContext,
} from '@toppfinance/shared'
import { requireAuth } from './auth.js'
import { prisma } from './db.js'
import { auditLog } from './logging.js'

// Re-export schemas from shared (they match exactly)
export const csvPreviewBodySchema = sharedCsvPreviewBodySchema
export const csvCommitBodySchema = sharedCsvCommitBodySchema

/**
 * Builds the DB lookup data injected into the pure classification stage.
 * @see docs/financial-domain.md (idempotency / reconciliation)
 *
 * - fingerprints / externalIds: existing rows keyed by their idempotency key → id.
 * - candidates: existing transactions keyed by ABSOLUTE cents, listing their
 *   (date, id). Scoped to the absolute-cent magnitudes present in the incoming
 *   CSV, so we never scan the whole ledger — only amounts that could actually match.
 */
async function buildClassificationContext(
  householdId: string,
  incomingAbsCents: ReadonlySet<number>,
): Promise<ImportClassificationContext> {
  const fingerprints = new Map<string, string>()
  const externalIds = new Map<string, string>()
  const candidates = new Map<number, Array<{ date: string; transactionId: string }>>()

  // Candidate scope: stored amounts equal to ±each incoming magnitude.
  // Non-ADJUSTMENT rows are stored positive; ADJUSTMENT keeps the sign, so we
  // probe both +c and -c for every incoming absolute magnitude.
  const candidateAmounts = incomingAbsCents.size
    ? [...incomingAbsCents].flatMap(cents => [fromCents(cents), fromCents(-cents)])
    : []

  const [idRows, candidateRows] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        householdId,
        OR: [{ fingerprint: { not: null } }, { externalId: { not: null } }],
      },
      select: { id: true, fingerprint: true, externalId: true },
    }),
    candidateAmounts.length
      ? prisma.transaction.findMany({
          where: { householdId, amount: { in: candidateAmounts } },
          select: { id: true, date: true, amount: true },
        })
      : Promise.resolve([]),
  ])

  for (const row of idRows) {
    if (row.fingerprint) fingerprints.set(row.fingerprint, row.id)
    if (row.externalId) externalIds.set(row.externalId, row.id)
  }

  for (const row of candidateRows) {
    const cents = Math.abs(toCents(Number(row.amount)))
    let list = candidates.get(cents)
    if (!list) {
      list = []
      candidates.set(cents, list)
    }
    list.push({ date: toIsoDateString(row.date), transactionId: row.id })
  }

  return { fingerprints, externalIds, candidates }
}

/**
 * Returns true when `error` is a Prisma unique-constraint violation (P2002),
 * e.g. a fingerprint or externalId already exists for this household. These are
 * treated as duplicate skips, not import failures.
 */
function isPrismaUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

async function createImportedTransaction(input: {
  user: AuthUser
  importBatchId: string
  draft: CreateTransactionInput
  fingerprint: string
}) {
  // Re-validate server-side; never trust the client draft blindly.
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
        amount: body.type === 'ADJUSTMENT' ? toMoney(body.amount) : absMoney(body.amount),
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
        externalId: body.externalId ?? null,
        fingerprint: input.fingerprint,
        sourceHash: input.fingerprint,
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
      type: created.type as unknown as TransactionType,
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

    const [categories, accounts, users, sharedSplit] = await Promise.all([
      prisma.category.findMany({
        where: { householdId: user.householdId, archived: false },
        select: { id: true, slug: true, name: true, type: true },
      }),
      prisma.account.findMany({
        where: accountVisibilityWhere(user.id, user.householdId),
        select: { id: true, name: true, type: true, visibility: true, ownerUserId: true },
        orderBy: [{ visibility: 'asc' }, { name: 'asc' }],
      }),
      prisma.user.findMany({
        where: { householdId: user.householdId, active: true },
        select: { id: true, email: true, displayName: true },
        orderBy: { displayName: 'asc' },
      }),
      getSharedSplitFromDb(user.householdId),
    ])

    // Scope the candidate lookup to absolute-cent magnitudes present in the input.
    const incomingAbsCents = new Set<number>()
    for (const record of parseCsv(body.content)) {
      const normalized = normalizeCsvRow(record)
      if (normalized.amountCents != null) incomingAbsCents.add(Math.abs(normalized.amountCents))
    }
    const classificationContext = await buildClassificationContext(user.householdId, incomingAbsCents)

    const { rows, summary } = await buildPreviewRows({
      user: { id: user.id, householdId: user.householdId },
      fileName: body.fileName,
      content: body.content,
      categories: categories as unknown as Array<{ id: string; slug: string; name: string; type: TransactionType }>,
      accounts: accounts as unknown as Array<{ id: string; name: string; type: string; visibility: Visibility; ownerUserId: string | null }>,
      users,
      sharedSplit,
      defaultSourceAccountId: body.defaultSourceAccountId,
      defaultDestinationAccountId: body.defaultDestinationAccountId,
      classificationContext,
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
      summary,
      rows,
    }
  })

  app.post('/api/imports/csv/:id/commit', { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = csvCommitParamsSchema.parse(request.params)
    const body = sharedCsvCommitBodySchema.parse(request.body)

    const importBatch = await prisma.importBatch.findFirst({
      where: { id: params.id, householdId: user.householdId, status: 'PREVIEWED' },
    })
    if (!importBatch) return reply.code(404).send({ error: 'Importacion no encontrada o ya confirmada' })

    // Resolve account id → name so the fingerprint is recomputed server-side from
    // the same canonical labels used during preview (server-authoritative idempotency key).
    const accounts = await prisma.account.findMany({
      where: accountVisibilityWhere(user.id, user.householdId),
      select: { id: true, name: true },
    })
    const accountNameById = new Map(accounts.map(account => [account.id, account.name]))

    const createdIds: string[] = []
    const skippedDuplicates: Array<{ rowNumber: number; sourceHash: string; reason: string }> = []
    const failed: Array<{ rowNumber: number; error: string }> = []
    const seenKeys = new Set<string>()

    for (const row of body.rows) {
      const draft = row.draft
      const fingerprint = computeImportFingerprint({
        date: draft.date,
        type: draft.type,
        amountCents: Math.abs(toCents(draft.amount)),
        description: draft.description,
        sourceAccountName: draft.sourceAccountId ? (accountNameById.get(draft.sourceAccountId) ?? '') : '',
        destinationAccountName: draft.destinationAccountId ? (accountNameById.get(draft.destinationAccountId) ?? '') : '',
        merchant: draft.merchantName ?? '',
      })
      const idempotencyKey = draft.externalId ?? fingerprint

      if (!body.includeDuplicates && seenKeys.has(idempotencyKey)) {
        skippedDuplicates.push({ rowNumber: row.rowNumber, sourceHash: fingerprint, reason: 'Repetido dentro del mismo lote.' })
        continue
      }

      try {
        const created = await createImportedTransaction({
          user,
          importBatchId: importBatch.id,
          draft,
          fingerprint,
        })
        seenKeys.add(idempotencyKey)
        createdIds.push(created.id)
      } catch (error) {
        if (isPrismaUniqueViolation(error)) {
          skippedDuplicates.push({ rowNumber: row.rowNumber, sourceHash: fingerprint, reason: 'Ya existe una transacción con este externalId o fingerprint.' })
          continue
        }
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
