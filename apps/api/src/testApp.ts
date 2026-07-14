/**
 * Test app builder for API integration tests.
 * Creates a Fastify instance with all routes registered but doesn't start the server.
 */

import fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { z } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import {
  aiSettingsSchema,
  backupPolicySchema,
  createTransactionSchema,
  loginBodySchema,
  sharedSplitSchema,
  transactionFiltersSchema,
  updateTransactionSchema,
  updateCategorySchema,
  entityIdParamsSchema,
  aiInsightsBodySchema,
  adminChangePasswordBodySchema,
  TransactionType,
  Visibility,
} from '@toppfinance/shared'
import { anonymizeTransactions, callOpenRouter, defaultAiSettings } from './ai.js'
import { clearSessionCookie, requireAdmin, requireAuth, setSessionCookie } from './auth.js'
import { runBackup } from './backup.js'
import { config, corsOrigins } from './config.js'
import { registerCsvImportRoutes } from './csvImport.js'
import { accountWithBalance } from './finance.js'
import { prisma } from './db.js'
import type { PrismaClient } from '@prisma/client'
import {
  accountVisibilityWhere,
  assertSplitTotal,
  buildAccountEntries,
  dateOnly,
  toMoney,
  transactionVisibilityWhere,
  transactionsToCsv,
} from '@toppfinance/shared'
import { appLog, auditLog } from './logging.js'
import { createSessionToken, hashIp, hashPassword, hashToken, LogLevel, LogCategory, verifyPassword } from '@toppfinance/shared'
import { ApiError, toApiError, isApiError, ApiErrorCode, API_PREFIX } from './apiErrors.js'
import { success, created, noContent, paginated, getPaginationParams } from './apiResponse.js'
import { createVersionNegotiationHook, API_VERSION_CONFIG } from './apiVersion.js'

export async function buildTestApp(prismaClient?: PrismaClient): Promise<FastifyInstance> {
  const app = fastify({
    logger: false, // Disable logger in tests
  })

  // Use provided prisma client, or the mocked one from db.js (used in tests)
  const db = prismaClient || prisma

  // Add API version negotiation hook
  app.addHook('preHandler', createVersionNegotiationHook(API_VERSION_CONFIG))

  // Custom error handler with standardized ApiError responses
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error)

    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      const apiError = ApiError.validation('Error de validación', error.errors.map(e => ({
        path: e.path,
        message: e.message,
      })))
      return reply.status(apiError.statusCode).send(apiError.toResponse())
    }

    // Handle Prisma unique constraint errors
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      const apiError = ApiError.alreadyExists('Recurso')
      return reply.status(apiError.statusCode).send(apiError.toResponse())
    }

    // Handle our custom ApiError
    if (isApiError(error)) {
      return reply.status(error.statusCode).send(error.toResponse())
    }

    // Generic error
    const apiError = ApiError.internal()
    return reply.status(apiError.statusCode).send(apiError.toResponse())
  })

  // Register plugins
  await app.register(cookie, {
    // No secret for tests - we use unsigned cookies
    hook: 'onRequest',
    parseOptions: {},
  })

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  })

  // Health endpoint
  app.get(`${API_PREFIX}/health`, async () => {
    try {
      await db.$queryRaw`SELECT 1`
      return { ok: true, name: 'ToppFinance', version: API_VERSION_CONFIG.current, timestamp: new Date().toISOString() }
    } catch {
      throw ApiError.database('Database connection failed')
    }
  })

  // Auth routes
  app.post(`${API_PREFIX}/auth/login`, async (request, reply) => {
    const body = loginBodySchema.parse(request.body)

    const user = await db.user.findUnique({
      where: { email: body.email.toLowerCase() },
      include: { household: true },
    })

    if (!user || !user.active || !(await verifyPassword(user.passwordHash, body.password))) {
      await appLog({ level: LogLevel.WARN, category: LogCategory.SECURITY, message: 'Login fallido', metadata: { email: body.email } })
      throw ApiError.invalidCredentials()
    }

    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
    await db.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
    })

    setSessionCookie(reply, token, expiresAt)

    return created(reply, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        householdId: user.householdId,
        avatarUrl: user.avatarUrl,
      },
    })
  })

  app.post(`${API_PREFIX}/auth/logout`, { preHandler: requireAuth }, async (request, reply) => {
    const token = request.cookies[config.SESSION_COOKIE_NAME]
    if (token) {
      await db.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
    }
    clearSessionCookie(reply)
    return noContent(reply)
  })

  app.get(`${API_PREFIX}/auth/me`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    return success(reply, {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        householdId: user.householdId,
        avatarUrl: user.avatarUrl,
      },
    })
  })

  // Accounts routes
  app.get(`${API_PREFIX}/accounts`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const accounts = await db.account.findMany({
      where: accountVisibilityWhere(user.id, user.householdId),
      orderBy: [{ visibility: 'asc' }, { name: 'asc' }],
    })
    const accountsWithBalance = await Promise.all(accounts.map(acc => accountWithBalance(acc.id)))
    return success(reply, { accounts: accountsWithBalance })
  })

  // Account creation schema (inline for tests)
  const createAccountSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT', 'CASH', 'INVESTMENT', 'OTHER']),
    visibility: z.enum(['SHARED', 'PRIVATE']),
    ownerUserId: z.string().optional(),
    currency: z.string().optional(),
  })

  app.post(`${API_PREFIX}/accounts`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = createAccountSchema.parse(request.body)

    const account = await db.account.create({
      data: {
        householdId: user.householdId,
        name: body.name,
        type: body.type,
        visibility: body.visibility,
        ownerUserId: body.ownerUserId ?? null,
        currency: body.currency ?? 'EUR',
      },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'account', entityId: account.id, action: 'create' })
    return created(reply, { account })
  })

  app.patch(`${API_PREFIX}/accounts/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)
    const body = updateCategorySchema.parse(request.body)

    const existing = await db.account.findFirst({
      where: { id: params.id, ...accountVisibilityWhere(user.id, user.householdId) },
    })
    if (!existing) throw ApiError.notFound('Cuenta')

    const updated = await db.account.update({
      where: { id: params.id },
      data: {
        name: body.name,
        type: body.type,
        visibility: body.visibility,
        ownerUserId: body.ownerUserId,
      },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'account', entityId: updated.id, action: 'update' })
    return success(reply, { account: updated })
  })

  app.delete(`${API_PREFIX}/accounts/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)

    const existing = await db.account.findFirst({
      where: { id: params.id, ...accountVisibilityWhere(user.id, user.householdId) },
    })
    if (!existing) throw ApiError.notFound('Cuenta')

    const entriesCount = await db.accountEntry.count({ where: { accountId: params.id } })
    if (entriesCount > 0) throw ApiError.conflict('La cuenta tiene movimientos asociados')

    await db.account.delete({ where: { id: params.id } })
    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'account', entityId: params.id, action: 'delete' })
    return success(reply, { ok: true })
  })

  // Categories routes
  app.get(`${API_PREFIX}/categories`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const categories = await db.category.findMany({
      where: { householdId: user.householdId, archived: false },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
    return success(reply, { categories })
  })

  // Category creation schema (inline for tests)
  const createCategorySchema = z.object({
    name: z.string().min(1),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'ADJUSTMENT']),
    color: z.string().optional(),
    icon: z.string().optional(),
  })

  app.post(`${API_PREFIX}/categories`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = createCategorySchema.parse(request.body)

    const category = await db.category.create({
      data: {
        householdId: user.householdId,
        slug: body.name.toLowerCase().replace(/\s+/g, '-'),
        name: body.name,
        type: body.type,
        color: body.color ?? '#000000',
        icon: body.icon ?? '📁',
      },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'category', entityId: category.id, action: 'create' })
    return created(reply, { category })
  })

  app.patch(`${API_PREFIX}/categories/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)
    const body = updateCategorySchema.parse(request.body)

    const existing = await db.category.findFirst({
      where: { id: params.id, householdId: user.householdId },
    })
    if (!existing) throw ApiError.notFound('Categoría')

    const updated = await db.category.update({
      where: { id: params.id },
      data: {
        name: body.name,
        slug: body.slug,
        type: body.type,
        color: body.color,
        icon: body.icon,
        archived: body.archived,
      },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'category', entityId: updated.id, action: 'update' })
    return success(reply, { category: updated })
  })

  app.delete(`${API_PREFIX}/categories/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)

    const existing = await db.category.findFirst({
      where: { id: params.id, householdId: user.householdId },
    })
    if (!existing) throw ApiError.notFound('Categoría')

    const txCount = await db.transaction.count({ where: { categoryId: params.id } })
    if (txCount > 0) throw ApiError.conflict('La categoría tiene transacciones asociadas')

    await db.category.delete({ where: { id: params.id } })
    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'category', entityId: params.id, action: 'delete' })
    return success(reply, { ok: true })
  })

  // Settings routes
  app.get(`${API_PREFIX}/settings`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const [sharedSplit, aiSettings, backupPolicy] = await Promise.all([
      db.adminSetting.findUnique({ where: { householdId_key: { householdId: user.householdId, key: 'sharedSplit' } } }),
      db.adminSetting.findUnique({ where: { householdId_key: { householdId: user.householdId, key: 'aiSettings' } } }),
      db.adminSetting.findUnique({ where: { householdId_key: { householdId: user.householdId, key: 'backupPolicy' } } }),
    ])

    return success(reply, {
      sharedSplit: sharedSplit?.value ?? { miguelPercent: 50, saraPercent: 50 },
      aiSettings: aiSettings?.value ?? defaultAiSettings(),
      backupPolicy: backupPolicy?.value ?? { enabled: false, schedule: '0 2 * * *', retentionWeeks: 4 },
    })
  })

  app.patch(`${API_PREFIX}/settings`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = request.body as Record<string, unknown>
    // Simplified: just upsert a generic setting
    const updated = await db.adminSetting.upsert({
      where: { householdId_key: { householdId: user.householdId, key: 'general' } },
      update: { value: body },
      create: { householdId: user.householdId, key: 'general', value: body },
    })
    return success(reply, updated.value)
  })

  app.patch(`${API_PREFIX}/admin/settings/shared-split`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const body = sharedSplitSchema.parse(request.body)

    if (body.miguelPercent + body.saraPercent !== 100) throw ApiError.validation('Los porcentajes deben sumar 100')

    const updated = await db.adminSetting.upsert({
      where: { householdId_key: { householdId: user.householdId, key: 'sharedSplit' } },
      update: { value: body },
      create: { householdId: user.householdId, key: 'sharedSplit', value: body },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'settings', entityId: 'sharedSplit', action: 'update' })
    return success(reply, { sharedSplit: updated.value })
  })

  app.patch(`${API_PREFIX}/admin/settings/ai`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const body = aiSettingsSchema.parse(request.body)

    const updated = await db.adminSetting.upsert({
      where: { householdId_key: { householdId: user.householdId, key: 'aiSettings' } },
      update: { value: body },
      create: { householdId: user.householdId, key: 'aiSettings', value: body },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'settings', entityId: 'aiSettings', action: 'update' })
    return success(reply, { aiSettings: updated.value })
  })

  app.patch(`${API_PREFIX}/admin/settings/backup-policy`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const body = backupPolicySchema.parse(request.body)

    const updated = await db.adminSetting.upsert({
      where: { householdId_key: { householdId: user.householdId, key: 'backupPolicy' } },
      update: { value: body },
      create: { householdId: user.householdId, key: 'backupPolicy', value: body },
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'settings', entityId: 'backupPolicy', action: 'update' })
    return success(reply, { backupPolicy: updated.value })
  })

  // Transactions routes
  app.get(`${API_PREFIX}/transactions`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    // Extract pagination before Zod parsing (which strips unknown keys)
    const { page, pageSize, skip, take } = getPaginationParams(request.query as Record<string, string | string[] | undefined>)
    const query = transactionFiltersSchema.parse(request.query)

    const where = {
      ...transactionVisibilityWhere(user.id, user.householdId),
      ...(query.type ? { type: query.type } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.sourceAccountId ? { sourceAccountId: query.sourceAccountId } : {}),
      ...(query.destinationAccountId ? { destinationAccountId: query.destinationAccountId } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: dateOnly(query.from) } : {}),
              ...(query.to ? { lte: dateOnly(query.to) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' as const } },
              { notes: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [transactions, total] = await Promise.all([
      db.transaction.findMany({
        where,
        include: {
          category: true,
          merchant: true,
          sourceAccount: true,
          destinationAccount: true,
          paidByUser: true,
          beneficiaries: { include: { user: true } },
          tags: { include: { tag: true } },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      db.transaction.count({ where }),
    ])

    return paginated(reply, transactions.map(tx => ({
      ...tx,
      amount: Number(tx.amount),
      beneficiaries: tx.beneficiaries.map(split => ({
        userId: split.userId,
        displayName: split.user.displayName,
        percent: Number(split.percent),
        amount: split.amount == null ? null : Number(split.amount),
      })),
      tags: tx.tags.map(item => item.tag.name),
    })), total, page, pageSize)
  })

  app.post(`${API_PREFIX}/transactions`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = createTransactionSchema.parse(request.body)
    assertSplitTotal(body.beneficiarySplits)

    const category = await db.category.findFirst({
      where: { id: body.categoryId, householdId: user.householdId, archived: false },
    })
    if (!category) throw ApiError.invalidCategory()

    const accountIds = [body.sourceAccountId, body.destinationAccountId].filter(Boolean) as string[]
    if (accountIds.length) {
      const count = await db.account.count({
        where: { id: { in: accountIds }, ...accountVisibilityWhere(user.id, user.householdId) },
      })
      if (count !== accountIds.length) throw ApiError.invalidAccount()
    }

    const beneficiaryUsers = await db.user.findMany({
      where: { householdId: user.householdId, id: { in: body.beneficiarySplits.map(split => split.userId) }, active: true },
    })
    if (beneficiaryUsers.length !== body.beneficiarySplits.length) throw ApiError.invalidBeneficiary()

    const merchant = body.merchantName
      ? await db.merchant.upsert({
          where: {
            householdId_normalizedName: {
              householdId: user.householdId,
              normalizedName: body.merchantName.toLowerCase().trim(),
            },
          },
          create: { householdId: user.householdId, name: body.merchantName.trim(), normalizedName: body.merchantName.toLowerCase().trim() },
          update: {},
        })
      : null

    const result = await db.$transaction(async (tx: any) => {
      const created = await tx.transaction.create({
        data: {
          householdId: user.householdId,
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
          createdByUserId: user.id,
          notes: body.notes ?? null,
          importBatchId: null,
          externalId: body.externalId ?? null,
          fingerprint: null,
          sourceHash: null,
          beneficiaries: {
            create: body.beneficiarySplits.map(split => ({ userId: split.userId, percent: split.percent })),
          },
        },
        include: { beneficiaries: { include: { user: true } }, tags: { include: { tag: true } } },
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
          where: { householdId_name: { householdId: user.householdId, name: tagName } },
          create: { householdId: user.householdId, name: tagName },
          update: {},
        })
        await tx.transactionTag.create({ data: { transactionId: created.id, tagId: tag.id } })
      }

      return created
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: result.id, action: 'create' })

    return created(reply, {
      transaction: {
        ...result,
        amount: Number(result.amount) / 100,
        beneficiaries: result.beneficiaries.map(split => ({
          userId: split.userId,
          displayName: split.user.displayName,
          percent: Number(split.percent),
          amount: split.amount == null ? null : Number(split.amount),
        })),
        tags: result.tags.map(item => item.tag.name),
      },
    })
  })

  app.patch(`${API_PREFIX}/transactions/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)
    const body = updateTransactionSchema.parse(request.body)
    if (body.beneficiarySplits) assertSplitTotal(body.beneficiarySplits)

    const existing = await db.transaction.findFirst({
      where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
      include: { beneficiaries: true, tags: true },
    })
    if (!existing) throw ApiError.notFound('Transacción')

    if (body.categoryId) {
      const category = await db.category.findFirst({
        where: { id: body.categoryId, householdId: user.householdId, archived: false },
      })
      if (!category) throw ApiError.invalidCategory()
    }

    if (body.sourceAccountId || body.destinationAccountId) {
      const accountIds = [body.sourceAccountId ?? existing.sourceAccountId, body.destinationAccountId ?? existing.destinationAccountId].filter(Boolean) as string[]
      const count = await db.account.count({
        where: { id: { in: accountIds }, ...accountVisibilityWhere(user.id, user.householdId) },
      })
      if (count !== accountIds.length) throw ApiError.invalidAccount()
    }

    const result = await db.$transaction(async (tx: any) => {
      const updated = await tx.transaction.update({
        where: { id: params.id },
        data: {
          type: body.type ?? existing.type,
          date: body.date ? dateOnly(body.date) : existing.date,
          amount: body.amount !== undefined
            ? (body.type === 'ADJUSTMENT' || existing.type === 'ADJUSTMENT' ? toMoney(body.amount) : Math.abs(toMoney(body.amount)))
            : existing.amount,
          description: body.description ?? existing.description,
          categoryId: body.categoryId ?? existing.categoryId,
          sourceAccountId: body.sourceAccountId ?? existing.sourceAccountId,
          destinationAccountId: body.destinationAccountId ?? existing.destinationAccountId,
          visibility: body.visibility ?? existing.visibility,
          paidByUserId: body.paidByUserId ?? existing.paidByUserId,
          notes: body.notes ?? existing.notes,
        },
        include: { beneficiaries: { include: { user: true } }, tags: { include: { tag: true } } },
      })

      if (body.beneficiarySplits) {
        const beneficiaryUsers = await tx.user.findMany({
          where: { householdId: user.householdId, id: { in: body.beneficiarySplits.map(split => split.userId) }, active: true },
        })
        if (beneficiaryUsers.length !== body.beneficiarySplits.length) throw ApiError.invalidBeneficiary()

        await tx.transactionBeneficiary.deleteMany({ where: { transactionId: params.id } })
        await tx.transactionBeneficiary.createMany({
          data: body.beneficiarySplits.map(split => ({ transactionId: params.id, userId: split.userId, percent: split.percent })),
        })
      }

      if (body.tags) {
        await tx.transactionTag.deleteMany({ where: { transactionId: params.id } })
        for (const tagName of [...new Set(body.tags)]) {
          const tag = await tx.tag.upsert({
            where: { householdId_name: { householdId: user.householdId, name: tagName } },
            create: { householdId: user.householdId, name: tagName },
            update: {},
          })
          await tx.transactionTag.create({ data: { transactionId: params.id, tagId: tag.id } })
        }
      }

      if (body.amount !== undefined || body.sourceAccountId || body.destinationAccountId || body.type) {
        await tx.accountEntry.deleteMany({ where: { transactionId: params.id } })
        const entries = buildAccountEntries({
          transactionId: updated.id,
          type: updated.type as unknown as import('@toppfinance/shared').TransactionType,
          amount: Number(updated.amount),
          sourceAccountId: updated.sourceAccountId,
          destinationAccountId: updated.destinationAccountId,
        })
        if (entries.length) await tx.accountEntry.createMany({ data: entries })
      }

      return updated
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: result.id, action: 'update' })

    return success(reply, {
      transaction: {
        ...result,
        amount: Number(result.amount),
        beneficiaries: result.beneficiaries.map(split => ({
          userId: split.userId,
          displayName: split.user.displayName,
          percent: Number(split.percent),
          amount: split.amount == null ? null : Number(split.amount),
        })),
        tags: result.tags.map(item => item.tag.name),
      },
    })
  })

  app.delete(`${API_PREFIX}/transactions/:id`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const params = entityIdParamsSchema.parse(request.params)

    const existing = await db.transaction.findFirst({
      where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
    })
    if (!existing) throw ApiError.notFound('Transacción')

    await db.$transaction(async (tx: any) => {
      await tx.transaction.delete({ where: { id: params.id } })
      await tx.accountEntry.deleteMany({ where: { transactionId: params.id } })
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: params.id, action: 'delete' })
    return success(reply, { ok: true })
  })

  // AI Insights routes
  // Simple schema for test compatibility
  const aiInsightsTestSchema = z.object({
    month: z.string().optional(),
    prompt: z.string().optional(),
    filters: transactionFiltersSchema.optional(),
  }).passthrough()

  app.post(`${API_PREFIX}/ai/insights`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = aiInsightsTestSchema.parse(request.body)

    // Support both test format (month) and production format (prompt + filters)
    const prompt = body.prompt ?? `Analyze finances for ${body.month ?? 'current month'}`
    const filters = body.filters ?? (body.month ? { from: `${body.month}-01` } : {})

    const parsedFilters = transactionFiltersSchema.parse(filters)
    const where = {
      ...transactionVisibilityWhere(user.id, user.householdId),
      ...(parsedFilters.type ? { type: parsedFilters.type } : {}),
      ...(parsedFilters.categoryId ? { categoryId: parsedFilters.categoryId } : {}),
      ...(parsedFilters.from || parsedFilters.to
        ? {
            date: {
              ...(parsedFilters.from ? { gte: dateOnly(parsedFilters.from) } : {}),
              ...(parsedFilters.to ? { lte: dateOnly(parsedFilters.to) } : {}),
            },
          }
        : {}),
    }

    const transactions = await db.transaction.findMany({
      where,
      include: { category: true, merchant: true, sourceAccount: true, destinationAccount: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    })

    const anonymized = anonymizeTransactions(transactions)

    const settingsRecord = await db.adminSetting.findUnique({
      where: { householdId_key: { householdId: user.householdId, key: 'aiSettings' } },
    })
    const settings = settingsRecord?.value ?? defaultAiSettings()

    const response = await callOpenRouter({
      prompt,
      transactions: anonymized,
      model: settings.defaultModel,
      fallbackModels: settings.fallbackModels,
      privacyMode: settings.privacyMode,
      maxTokens: 2000,
      temperature: 0.3,
    })

    await db.aiRequest.create({
      data: {
        householdId: user.householdId,
        userId: user.id,
        modelUsed: response.modelUsed,
        promptTokens: response.promptTokens,
        completionTokens: response.outputTokens,
        latencyMs: response.latencyMs,
        promptHash: Buffer.from(prompt).toString('base64').slice(0, 64),
        responseSummary: response.content.slice(0, 200),
      },
    })

    return success(reply, { insight: response.content, modelUsed: response.modelUsed, promptTokens: response.promptTokens, outputTokens: response.outputTokens, latencyMs: response.latencyMs })
  })

  app.post(`${API_PREFIX}/ai/categorize`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const body = aiInsightsBodySchema.parse(request.body)

    const transactions = await db.transaction.findMany({
      where: { ...transactionVisibilityWhere(user.id, user.householdId), categoryId: null },
      include: { merchant: true, sourceAccount: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    })

    const anonymized = anonymizeTransactions(transactions)

    const response = await callOpenRouter({
      prompt: `Categoriza cada transacción. Responde solo con JSON: [{"transactionId": "id", "categoryId": "cat-id", "confidence": 0.9}]\n\nTransacciones: ${JSON.stringify(anonymized)}`,
      transactions: anonymized,
      model: 'gpt-4o-mini',
      fallbackModels: [],
      privacyMode: 'strict',
      maxTokens: 2000,
      temperature: 0.1,
    })

    return success(reply, { suggestions: response.content })
  })

  // Admin routes
  app.post(`${API_PREFIX}/admin/change-password`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const body = adminChangePasswordBodySchema.parse(request.body)

    const targetUser = await db.user.findFirst({
      where: { id: body.userId, householdId: user.householdId },
    })
    if (!targetUser) throw ApiError.notFound('Usuario')

    const newHash = await hashPassword(body.newPassword)
    await db.user.update({ where: { id: targetUser.id }, data: { passwordHash: newHash } })
    await db.session.updateMany({ where: { userId: targetUser.id }, data: { revokedAt: new Date() } })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'user', entityId: targetUser.id, action: 'change_password' })
    return success(reply, { ok: true })
  })

  app.get(`${API_PREFIX}/admin/logs`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const query = request.query as Record<string, string | undefined>
    const level = query.level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | undefined
    const category = query.category as 'APPLICATION' | 'AUDIT' | 'ERROR' | 'SCHEDULER' | 'INTEGRATION' | 'SECURITY' | undefined

    const logs = await db.appLog.findMany({
      where: {
        OR: [{ householdId: user.householdId }, { householdId: null }],
        ...(level ? { level } : {}),
        ...(category ? { category } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    return success(reply, { logs })
  })

  app.get(`${API_PREFIX}/admin/audit-logs`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const logs = await db.auditLog.findMany({
      where: { householdId: user.householdId },
      orderBy: { createdAt: 'desc' },
      take: 300,
    })
    return success(reply, { logs })
  })

  app.get(`${API_PREFIX}/admin/backups`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const backups = await db.backupRun.findMany({
      where: { OR: [{ householdId: user.householdId }, { householdId: null }] },
      orderBy: { startedAt: 'desc' },
      take: 100,
    })
    return success(reply, { backups: backups.map(backup => ({ ...backup, sizeBytes: backup.sizeBytes?.toString() ?? null })) })
  })

  app.post(`${API_PREFIX}/admin/backups/run`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const backup = await runBackup(user.householdId)
    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'backup', entityId: backup.id, action: 'run', metadata: { status: backup.status } })
    return success(reply, { backup: { ...backup, sizeBytes: backup.sizeBytes?.toString() ?? null } })
  })

  app.get(`${API_PREFIX}/admin/users`, { preHandler: requireAdmin }, async (request, reply) => {
    const user = request.user!
    const users = await db.user.findMany({
      where: { householdId: user.householdId },
      orderBy: { displayName: 'asc' },
    })
    return success(reply, { users: users.map(u => ({ id: u.id, email: u.email, displayName: u.displayName, role: u.role })) })
  })

  app.patch(`${API_PREFIX}/admin/users/:id/password`, { preHandler: requireAdmin }, async (request, reply) => {
    const actor = request.user!
    const params = entityIdParamsSchema.parse(request.params)
    const body = adminChangePasswordBodySchema.parse(request.body)
    const target = await db.user.findFirst({ where: { id: params.id, householdId: actor.householdId } })
    if (!target) throw ApiError.notFound('Usuario')

    await db.user.update({
      where: { id: target.id },
      data: { passwordHash: await hashPassword(body.password) },
    })
    await db.session.updateMany({ where: { userId: target.id }, data: { revokedAt: new Date() } })
    await auditLog({ householdId: actor.householdId, actorUserId: actor.id, entity: 'user', entityId: target.id, action: 'passwordChange' })
    return success(reply, { ok: true })
  })

  // Export routes (matching server.ts)
  app.get(`${API_PREFIX}/exports/history.csv`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const transactions = await db.transaction.findMany({
      where: transactionVisibilityWhere(user.id, user.householdId),
      include: {
        category: true,
        merchant: true,
        sourceAccount: true,
        destinationAccount: true,
        paidByUser: true,
        beneficiaries: { include: { user: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })

    const csvRows = transactions.map(tx => ({
      date: tx.date,
      type: tx.type as TransactionType,
      amount: Number(tx.amount),
      description: tx.description,
      sourceAccount: tx.sourceAccount ? { name: tx.sourceAccount.name } : null,
      destinationAccount: tx.destinationAccount ? { name: tx.destinationAccount.name } : null,
      category: { name: tx.category.name },
      visibility: tx.visibility as Visibility,
      paidByUser: tx.paidByUser ? { email: tx.paidByUser.email } : null,
      beneficiaries: tx.beneficiaries.map(b => ({ user: { email: b.user.email }, percent: Number(b.percent) })),
      merchant: tx.merchant ? { name: tx.merchant.name } : null,
      tags: tx.tags.map(t => t.tag.name),
      notes: tx.notes ?? null,
      externalId: tx.externalId ?? null,
    }))

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'export', action: 'historyCsv' })
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="toppfinance-history.csv"')
    return transactionsToCsv(csvRows)
  })

  app.get(`${API_PREFIX}/exports/history.json`, { preHandler: requireAuth }, async (request, reply) => {
    const user = request.user!
    const transactions = await db.transaction.findMany({
      where: transactionVisibilityWhere(user.id, user.householdId),
      include: {
        category: true,
        merchant: true,
        sourceAccount: true,
        destinationAccount: true,
        paidByUser: true,
        beneficiaries: { include: { user: true } },
        tags: { include: { tag: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    })

    await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'export', action: 'historyJson' })
    return success(reply, {
      exportedAt: new Date().toISOString(),
      transactions: transactions.map(tx => ({
        ...tx,
        amount: Number(tx.amount),
        beneficiaries: tx.beneficiaries.map(split => ({
          email: split.user.email,
          percent: Number(split.percent),
        })),
        tags: tx.tags.map(item => item.tag.name),
      })),
    })
  })

  // Register CSV import routes
  await registerCsvImportRoutes(app, db)

  // Serve static files from web build (production)
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const publicPath = path.join(__dirname, '..', '..', '..', 'apps', 'web', 'dist')
  if (existsSync(publicPath)) {
    await app.register(fastifyStatic, { root: publicPath, prefix: '/' })
    app.setNotFoundHandler((request, reply) => {
      if (!request.url.startsWith('/api/')) {
        return reply.sendFile('index.html')
      }
      const apiError = ApiError.notFound('Ruta')
      return reply.status(apiError.statusCode).send(apiError.toResponse(request.url))
    })
  }

  return app
}