import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { z } from 'zod'
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
import { registerOpenApi } from './openapi.js'
import { registerRateLimit } from './rateLimit.js'
import { registerRequestId } from './requestId.js'
import { registerHelmet } from './helmet.js'

const app = fastify({
  logger: {
    // Customize logger if needed
  },
})

// 1. Security headers (first, so they apply to all responses)
await app.register(registerHelmet)

// 2. Request ID / correlation ID
await app.register(registerRequestId)

// 3. API version negotiation
app.addHook('preHandler', createVersionNegotiationHook(API_VERSION_CONFIG))

// 4. Rate limiting
await app.register(registerRateLimit)

// 5. OpenAPI / Swagger documentation
await app.register(registerOpenApi)

// 6. Custom error handler with standardized ApiError responses
app.setErrorHandler((error, request, reply) => {
  request.log.error({ err: error, reqId: request.id }, 'Request error')

  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    const apiError = ApiError.validation('Error de validación', error.errors.map(e => ({
      path: e.path,
      message: e.message,
    })))
    return reply.status(apiError.statusCode).send(apiError.toResponse(request.url))
  }

  // Handle Prisma unique constraint errors
  if (error instanceof Error && 'code' in error && error.code === 'P2002') {
    const apiError = ApiError.alreadyExists('Recurso')
    return reply.status(apiError.statusCode).send(apiError.toResponse(request.url))
  }

  // Handle our custom ApiError
  if (isApiError(error)) {
    return reply.status(error.statusCode).send(error.toResponse(request.url))
  }

  // Generic error
  const apiError = toApiError(error)
  return reply.status(apiError.statusCode).send(apiError.toResponse(request.url))
})

// 7. Register plugins
await app.register(cookie)
await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) callback(null, true)
    else callback(new Error('Origin not allowed'), false)
  },
})

function publicUser(user: { id: string; email: string; displayName: string; role: string }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
  }
}

async function getSetting<T>(householdId: string, key: string, fallback: T): Promise<T> {
  const setting = await prisma.adminSetting.findUnique({
    where: { householdId_key: { householdId, key } },
  })
  return setting ? (setting.value as T) : fallback
}

async function upsertSetting(householdId: string, key: string, value: unknown) {
  return prisma.adminSetting.upsert({
    where: { householdId_key: { householdId, key } },
    create: { householdId, key, value: value as object },
    update: { value: value as object },
  })
}

// Health endpoint - basic liveness check
app.get(`${API_PREFIX}/health`, async () => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, name: 'ToppFinance', version: API_VERSION_CONFIG.current, timestamp: new Date().toISOString() }
  } catch (error) {
    throw ApiError.database('Database connection failed')
  }
})

// Health endpoint - detailed readiness check (for k8s/liveness probes)
app.get(`${API_PREFIX}/health/ready`, async () => {
  const checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }> = {}
  let allOk = true

  // Database connectivity check
  const dbStart = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    checks.database = { ok: true, latencyMs: Date.now() - dbStart }
  } catch (error) {
    checks.database = { ok: false, latencyMs: Date.now() - dbStart, error: error instanceof Error ? error.message : 'Unknown error' }
    allOk = false
  }

  // Prisma client check (verify client is connected)
  const prismaStart = Date.now()
  try {
    await prisma.$connect()
    await prisma.$disconnect()
    checks.prisma = { ok: true, latencyMs: Date.now() - prismaStart }
  } catch (error) {
    checks.prisma = { ok: false, latencyMs: Date.now() - prismaStart, error: error instanceof Error ? error.message : 'Unknown error' }
    allOk = false
  }

  // Check if web dist exists (for production serving)
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const webDist = path.resolve(__dirname, '../../web/dist')
  checks.webAssets = { ok: fs.existsSync(webDist) }

  const statusCode = allOk ? 200 : 503
  return {
    ok: allOk,
    name: 'ToppFinance',
    version: API_VERSION_CONFIG.current,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsage: process.memoryUsage(),
    checks,
  }
})

// Auth routes
app.post(`${API_PREFIX}/auth/login`, async (request, reply) => {
  const body = loginBodySchema.parse(request.body)

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    include: { household: true },
  })

  if (!user || !user.active || !(await verifyPassword(user.passwordHash, body.password))) {
    await appLog({ level: LogLevel.WARN, category: LogCategory.SECURITY, message: 'Login fallido', metadata: { email: body.email } })
    throw ApiError.invalidCredentials()
  }

  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      userAgent: request.headers['user-agent'],
      ipHash: hashIp(request.ip),
      expiresAt,
    },
  })
  setSessionCookie(reply, token, expiresAt)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'session', action: 'login' })

  return created(reply, {
    user: publicUser(user),
    household: { id: user.household.id, name: user.household.name },
  })
})

app.post(`${API_PREFIX}/auth/logout`, async (request, reply) => {
  const token = request.cookies[config.SESSION_COOKIE_NAME]
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  clearSessionCookie(reply)
  return success(reply, { ok: true })
})

app.get(`${API_PREFIX}/auth/me`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const household = await prisma.household.findUniqueOrThrow({ where: { id: user.householdId } })
  return success(reply, {
    user,
    household: { id: household.id, name: household.name },
  })
})

// Accounts routes
app.get(`${API_PREFIX}/accounts`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const accounts = await prisma.account.findMany({
    where: accountVisibilityWhere(user.id, user.householdId),
    include: { entries: true, ownerUser: true },
    orderBy: [{ visibility: 'asc' }, { name: 'asc' }],
  })

  return success(reply, {
    accounts: await Promise.all(accounts.map(async account => ({
      id: account.id,
      name: account.name,
      type: account.type,
      visibility: account.visibility,
      ownerUserId: account.ownerUserId,
      ownerName: account.ownerUser?.displayName ?? null,
      openingBalance: Number(account.openingBalance),
      balance: await accountWithBalance(account),
      currency: account.currency,
      archived: account.archived,
    }))),
  })
})

// Categories routes
app.get(`${API_PREFIX}/categories`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const categories = await prisma.category.findMany({
    where: { householdId: user.householdId, archived: false },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return success(reply, { categories })
})

app.patch(`${API_PREFIX}/categories/:id`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = entityIdParamsSchema.parse(request.params)
  const body = updateCategorySchema.parse(request.body)

  const category = await prisma.category.findFirst({ where: { id: params.id, householdId: user.householdId } })
  if (!category) throw ApiError.notFound('Categoría')

  const updated = await prisma.category.update({ where: { id: params.id }, data: body })
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'category', entityId: updated.id, action: 'update', metadata: body })
  return success(reply, { category: updated })
})

// Settings routes
app.get(`${API_PREFIX}/settings`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const [sharedSplit, aiSettings, backupPolicy] = await Promise.all([
    getSetting(user.householdId, 'sharedSplit', { miguelPercent: 50, saraPercent: 50 }),
    getSetting(user.householdId, 'aiSettings', defaultAiSettings()),
    getSetting(user.householdId, 'backupPolicy', { frequency: 'weekly', retentionWeeks: 30, backupDir: config.BACKUP_DIR }),
  ])
  return success(reply, { locale: 'es-ES', currency: 'EUR', sharedSplit, aiSettings, backupPolicy })
})

app.patch(`${API_PREFIX}/admin/settings/shared-split`, { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const body = sharedSplitSchema.parse(request.body)

  await upsertSetting(user.householdId, 'sharedSplit', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateSharedSplit', metadata: body })
  return success(reply, { sharedSplit: body })
})

app.patch(`${API_PREFIX}/admin/settings/ai`, { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const body = aiSettingsSchema.parse(request.body)
  await upsertSetting(user.householdId, 'aiSettings', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateAiSettings' })
  return success(reply, { aiSettings: body })
})

app.patch(`${API_PREFIX}/admin/settings/backup-policy`, { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const body = backupPolicySchema.parse(request.body)
  await upsertSetting(user.householdId, 'backupPolicy', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateBackupPolicy', metadata: body })
  return success(reply, { backupPolicy: body })
})

// Transactions routes
app.get(`${API_PREFIX}/transactions`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const filters = transactionFiltersSchema.parse(request.query)
  const where = transactionVisibilityWhere(user.id, user.householdId)

  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: dateOnly(filters.from) } : {}),
      ...(filters.to ? { lte: dateOnly(filters.to) } : {}),
    }
  }
  if (filters.type) where.type = filters.type
  if (filters.categoryId) where.categoryId = filters.categoryId
  if (filters.visibility) where.visibility = filters.visibility
  if (filters.accountId) {
    where.OR = [
      ...(where.OR ?? []),
      { sourceAccountId: filters.accountId },
      { destinationAccountId: filters.accountId },
    ]
  }
  if (filters.search) {
    where.description = { contains: filters.search, mode: 'insensitive' }
  }
  if (filters.tag) {
    where.tags = { some: { tag: { name: filters.tag } } }
  }

  const { page, pageSize, skip, take } = getPaginationParams(request.query as Record<string, string | string[] | undefined>)

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
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
    prisma.transaction.count({ where }),
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

// Export routes
app.get(`${API_PREFIX}/exports/history.csv`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const transactions = await prisma.transaction.findMany({
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
  const transactions = await prisma.transaction.findMany({
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

// CSV Import routes
await registerCsvImportRoutes(app)

// Transaction CRUD
app.post(`${API_PREFIX}/transactions`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const body = createTransactionSchema.parse(request.body)
  assertSplitTotal(body.beneficiarySplits)

  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, householdId: user.householdId, archived: false },
  })
  if (!category) throw ApiError.invalidCategory()

  const accountIds = [body.sourceAccountId, body.destinationAccountId].filter(Boolean) as string[]
  if (accountIds.length) {
    const count = await prisma.account.count({
      where: { id: { in: accountIds }, ...accountVisibilityWhere(user.id, user.householdId) },
    })
    if (count !== accountIds.length) throw ApiError.invalidAccount()
  }

  const beneficiaryUsers = await prisma.user.findMany({
    where: { householdId: user.householdId, id: { in: body.beneficiarySplits.map(split => split.userId) }, active: true },
  })
  if (beneficiaryUsers.length !== body.beneficiarySplits.length) throw ApiError.invalidBeneficiary()

  const merchant = body.merchantName
    ? await prisma.merchant.upsert({
        where: {
          householdId_normalizedName: {
            householdId: user.householdId,
            normalizedName: body.merchantName.toLowerCase().trim(),
          },
        },
        create: {
          householdId: user.householdId,
          name: body.merchantName.trim(),
          normalizedName: body.merchantName.toLowerCase().trim(),
        },
        update: {},
      })
    : null

  const result = await prisma.$transaction(async tx => {
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
          create: body.beneficiarySplits.map(split => ({
            userId: split.userId,
            percent: split.percent,
          })),
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
  return created(reply, { transaction: { ...result, amount: Number(result.amount) } })
})

app.patch(`${API_PREFIX}/transactions/:id`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = entityIdParamsSchema.parse(request.params)
  const body = updateTransactionSchema.parse(request.body)
  if (body.beneficiarySplits) assertSplitTotal(body.beneficiarySplits)

  const existing = await prisma.transaction.findFirst({
    where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
    include: { beneficiaries: true },
  })
  if (!existing) throw ApiError.notFound('Movimiento')

  const updated = await prisma.$transaction(async tx => {
    const next = await tx.transaction.update({
      where: { id: params.id },
      data: {
        type: body.type,
        date: body.date ? dateOnly(body.date) : undefined,
        amount: body.amount == null ? undefined : body.type === 'ADJUSTMENT' ? toMoney(body.amount) : Math.abs(toMoney(body.amount)),
        description: body.description,
        categoryId: body.categoryId,
        sourceAccountId: body.sourceAccountId,
        destinationAccountId: body.destinationAccountId,
        visibility: body.visibility,
        paidByUserId: body.paidByUserId,
        notes: body.notes,
      },
    })

    await tx.accountEntry.deleteMany({ where: { transactionId: params.id } })
    const entries = buildAccountEntries({
      transactionId: next.id,
      type: next.type as unknown as import('@toppfinance/shared').TransactionType,
      amount: Number(next.amount),
      sourceAccountId: next.sourceAccountId,
      destinationAccountId: next.destinationAccountId,
    })
    if (entries.length) await tx.accountEntry.createMany({ data: entries })

    if (body.beneficiarySplits) {
      await tx.transactionBeneficiary.deleteMany({ where: { transactionId: params.id } })
      await tx.transactionBeneficiary.createMany({
        data: body.beneficiarySplits.map(split => ({
          transactionId: params.id,
          userId: split.userId,
          percent: split.percent,
        })),
      })
    }

    return next
  })

  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: updated.id, action: 'update' })
  return success(reply, { transaction: { ...updated, amount: Number(updated.amount) } })
})

app.delete(`${API_PREFIX}/transactions/:id`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = entityIdParamsSchema.parse(request.params)
  const existing = await prisma.transaction.findFirst({
    where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
  })
  if (!existing) throw ApiError.notFound('Movimiento')

  await prisma.transaction.delete({ where: { id: params.id } })
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: params.id, action: 'delete' })
  return success(reply, { ok: true })
})

// AI Insights
app.post(`${API_PREFIX}/ai/insights`, { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const body = aiInsightsBodySchema.parse(request.body ?? {})
  const settings = await getSetting(user.householdId, 'aiSettings', defaultAiSettings())
  const from = body.month ? `${body.month}-01` : undefined
  const rawTransactions = await prisma.transaction.findMany({
    where: {
      ...transactionVisibilityWhere(user.id, user.householdId),
      ...(from ? { date: { gte: dateOnly(from), lt: new Date(dateOnly(from).getFullYear(), dateOnly(from).getMonth() + 1, 1) } } : {}),
    },
    include: { category: true, merchant: true },
    take: 200,
    orderBy: { date: 'desc' },
  })
  const transactions = rawTransactions.map(tx => ({
    ...tx,
    amount: Number(tx.amount),
    type: tx.type as unknown as import('@toppfinance/shared').TransactionType,
  }))

  const response = await callOpenRouter({
    settings,
    messages: [
      { role: 'system', content: 'Eres un analista financiero prudente para una pareja. No inventes datos. Responde en espanol, con acciones concretas y sin exponer datos personales.' },
      { role: 'user', content: JSON.stringify({ locale: 'es-ES', currency: 'EUR', transactions: anonymizeTransactions(transactions) }) },
    ],
  })

  await prisma.aiRequest.create({
    data: {
      householdId: user.householdId,
      userId: user.id,
      feature: 'insights',
      modelRequested: settings.defaultModel,
      modelUsed: response.modelUsed,
      promptTokens: response.promptTokens,
      outputTokens: response.outputTokens,
      latencyMs: response.latencyMs,
      status: 'success',
    },
  })

  return success(reply, { insight: response.content, modelUsed: response.modelUsed })
})

// Admin routes
app.get(`${API_PREFIX}/admin/logs`, { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const query = request.query as Record<string, string | undefined>
  const level = query.level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | undefined
  const category = query.category as 'APPLICATION' | 'AUDIT' | 'ERROR' | 'SCHEDULER' | 'INTEGRATION' | 'SECURITY' | undefined

  const logs = await prisma.appLog.findMany({
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
  const logs = await prisma.auditLog.findMany({
    where: { householdId: user.householdId },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return success(reply, { logs })
})

app.get(`${API_PREFIX}/admin/backups`, { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const backups = await prisma.backupRun.findMany({
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
  const users = await prisma.user.findMany({
    where: { householdId: user.householdId },
    orderBy: { displayName: 'asc' },
  })
  return success(reply, { users: users.map(publicUser) })
})

app.patch(`${API_PREFIX}/admin/users/:id/password`, { preHandler: requireAdmin }, async (request, reply) => {
  const actor = request.user!
  const params = entityIdParamsSchema.parse(request.params)
  const body = adminChangePasswordBodySchema.parse(request.body)
  const target = await prisma.user.findFirst({ where: { id: params.id, householdId: actor.householdId } })
  if (!target) throw ApiError.notFound('Usuario')

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(body.password) },
  })
  await prisma.session.updateMany({ where: { userId: target.id }, data: { revokedAt: new Date() } })
  await auditLog({ householdId: actor.householdId, actorUserId: actor.id, entity: 'user', entityId: target.id, action: 'passwordChange' })
  return success(reply, { ok: true })
})

// Serve static files from web build (production)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webDist = path.resolve(__dirname, '../../web/dist')
const hasWebDist = existsSync(webDist)
if (hasWebDist) {
  await app.register(fastifyStatic, {
    root: webDist,
    prefix: '/',
    decorateReply: true,
  })
}

app.setNotFoundHandler(async (request, reply) => {
  if (request.url.startsWith(`${API_PREFIX}/`)) {
    throw ApiError.notFound('Endpoint')
  }
  if (hasWebDist) return reply.sendFile('index.html')
  return reply.code(404).send({ error: 'Frontend no compilado todavia' })
})

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  await appLog({ level: LogLevel.INFO, category: LogCategory.APPLICATION, message: 'API iniciada', metadata: { port: config.PORT } })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}