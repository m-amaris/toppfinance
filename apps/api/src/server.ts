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
} from '@toppfinance/shared'
import { anonymizeTransactions, callOpenRouter, defaultAiSettings } from './ai.js'
import { clearSessionCookie, requireAdmin, requireAuth, setSessionCookie } from './auth.js'
import { runBackup } from './backup.js'
import { config, corsOrigins } from './config.js'
import { registerCsvImportRoutes } from './csvImport.js'
import { prisma } from './db.js'
import { accountVisibilityWhere, accountWithBalance, assertSplitTotal, buildAccountEntries, dateOnly, toMoney, transactionVisibilityWhere } from './finance.js'
import { appLog, auditLog } from './logging.js'
import { createSessionToken, hashIp, hashPassword, hashToken, LogLevel, LogCategory, verifyPassword } from '@toppfinance/shared'

const app = fastify({
  logger: {
    // We can customize the logger here if needed, but for now we use the default
    // We'll use the default pino logger
  },
})

// Custom error handler
app.setErrorHandler((error, request, reply) => {
  // Log the error
  request.log.error(error)
  // Send a generic error message in production, but in development we can send the error message
  const isProduction = process.env.NODE_ENV === 'production'
  let message = 'Internal Server Error'
  if (error instanceof Error) {
    message = error.message
  }
  const statusCode = (typeof error === 'object' && error !== null && 'statusCode' in error && typeof (error as Record<string, unknown>).statusCode === 'number'
      ? (error as Record<string, unknown>).statusCode
      : 500)

  // If the error is a validation error from zod, we want to send 400
  if (error instanceof z.ZodError) {
    return reply.status(400).send({
      error: 'Validation Error',
      details: error.errors.map(e => ({
        path: e.path,
        message: e.message,
      })),
    })
  }

  return reply.status(statusCode as number).send({ error: message })
})

await app.register(cookie)
await app.register(cors, {
  credentials: true,
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) callback(null, true)
    else callback(new Error('Origin not allowed'), false)
  },
})

function publicUser(user: NonNullable<typeof app extends never ? never : unknown>) {
  const typed = user as { id: string; email: string; displayName: string; role: string }
  return {
    id: typed.id,
    email: typed.email,
    displayName: typed.displayName,
    role: typed.role,
  }
}

async function getSetting<T>(householdId: string, key: string, fallback: T): Promise<T> {
  const setting = await prisma.adminSetting.findUnique({
    where: { householdId_key: { householdId, key } },
  })
  return setting ? setting.value as T : fallback
}

async function upsertSetting(householdId: string, key: string, value: unknown) {
  return prisma.adminSetting.upsert({
    where: { householdId_key: { householdId, key } },
    create: { householdId, key, value: value as object },
    update: { value: value as object },
  })
}

app.get('/api/health', async () => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, name: 'ToppFinance', timestamp: new Date().toISOString() };
  } catch (error) {
    throw new Error('Database connection failed');
  }
})

app.post('/api/auth/login', async (request, reply) => {
  const body = loginBodySchema.parse(request.body)

  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
    include: { household: true },
  })

  if (!user || !user.active || !(await verifyPassword(user.passwordHash, body.password))) {
    await appLog({ level: LogLevel.WARN, category: LogCategory.SECURITY, message: 'Login fallido', metadata: { email: body.email } })
    return reply.code(401).send({ error: 'Credenciales invalidas' })
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

  return {
    user: publicUser(user),
    household: { id: user.household.id, name: user.household.name },
  }
})

app.post('/api/auth/logout', async (request, reply) => {
  const token = request.cookies[config.SESSION_COOKIE_NAME]
  if (token) {
    await prisma.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }
  clearSessionCookie(reply)
  return { ok: true }
})

app.get('/api/auth/me', { preHandler: requireAuth }, async request => {
  const user = request.user!
  const household = await prisma.household.findUniqueOrThrow({ where: { id: user.householdId } })
  return {
    user,
    household: { id: household.id, name: household.name },
  }
})

app.get('/api/accounts', { preHandler: requireAuth }, async request => {
  const user = request.user!
  const accounts = await prisma.account.findMany({
    where: accountVisibilityWhere(user.id, user.householdId),
    include: { entries: true, ownerUser: true },
    orderBy: [{ visibility: 'asc' }, { name: 'asc' }],
  })

  return {
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
  }
})

app.get('/api/categories', { preHandler: requireAuth }, async request => {
  const user = request.user!
  const categories = await prisma.category.findMany({
    where: { householdId: user.householdId, archived: false },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  })
  return { categories }
})

app.patch('/api/categories/:id', { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = z.object({ id: z.string() }).parse(request.params)
  const body = updateCategorySchema.parse(request.body)

  const category = await prisma.category.findFirst({ where: { id: params.id, householdId: user.householdId } })
  if (!category) return reply.code(404).send({ error: 'Categoria no encontrada' })

  const updated = await prisma.category.update({ where: { id: params.id }, data: body })
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'category', entityId: updated.id, action: 'update', metadata: body })
  return { category: updated }
})

app.get('/api/settings', { preHandler: requireAuth }, async request => {
  const user = request.user!
  const [sharedSplit, aiSettings, backupPolicy] = await Promise.all([
    getSetting(user.householdId, 'sharedSplit', { miguelPercent: 50, saraPercent: 50 }),
    getSetting(user.householdId, 'aiSettings', defaultAiSettings()),
    getSetting(user.householdId, 'backupPolicy', { frequency: 'weekly', retentionWeeks: 30, backupDir: config.BACKUP_DIR }),
  ])
  return { locale: 'es-ES', currency: 'EUR', sharedSplit, aiSettings, backupPolicy }
})

app.patch('/api/admin/settings/shared-split', { preHandler: requireAdmin }, async (request, reply) => {
  const user = request.user!
  const body = sharedSplitSchema.parse(request.body)

  await upsertSetting(user.householdId, 'sharedSplit', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateSharedSplit', metadata: body })
  return { sharedSplit: body }
})

app.patch('/api/admin/settings/ai', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const body = aiSettingsSchema.parse(request.body)
  await upsertSetting(user.householdId, 'aiSettings', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateAiSettings' })
  return { aiSettings: body }
})

app.patch('/api/admin/settings/backup-policy', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const body = backupPolicySchema.parse(request.body)
  await upsertSetting(user.householdId, 'backupPolicy', body)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'adminSetting', action: 'updateBackupPolicy', metadata: body })
  return { backupPolicy: body }
})

app.get('/api/transactions', { preHandler: requireAuth }, async request => {
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

  const transactions = await prisma.transaction.findMany({
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
    take: 500,
  })

  return {
    transactions: transactions.map(tx => ({
      ...tx,
      amount: Number(tx.amount),
      beneficiaries: tx.beneficiaries.map(split => ({
        userId: split.userId,
        displayName: split.user.displayName,
        percent: Number(split.percent),
        amount: split.amount == null ? null : Number(split.amount),
      })),
      tags: tx.tags.map(item => item.tag.name),
    })),
  }
})

app.get('/api/exports/history.csv', { preHandler: requireAuth }, async (request, reply) => {
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

  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const rows = [
    ['date', 'type', 'amount_eur', 'description', 'source_account', 'destination_account', 'category', 'visibility', 'paid_by_email', 'beneficiary_split', 'merchant', 'tags', 'notes'],
    ...transactions.map(tx => [
      tx.date.toISOString().slice(0, 10),
      tx.type,
      Number(tx.amount).toFixed(2).replace('.', ','),
      tx.description,
      tx.sourceAccount?.name ?? '',
      tx.destinationAccount?.name ?? '',
      tx.category.name,
      tx.visibility,
      tx.paidByUser?.email ?? '',
      tx.beneficiaries.map(split => `${split.user.email}=${Number(split.percent)}`).join('|'),
      tx.merchant?.name ?? '',
      tx.tags.map(item => item.tag.name).join('|'),
      tx.notes ?? '',
    ]).map(row => row.map(escape)),
  ]

  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'export', action: 'historyCsv' })
  reply.header('Content-Type', 'text/csv; charset=utf-8')
  reply.header('Content-Disposition', 'attachment; filename="toppfinance-history.csv"')
  return rows.map(row => row.join(';')).join('\n')
})

app.get('/api/exports/history.json', { preHandler: requireAuth }, async request => {
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
  return {
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
  }
})

await registerCsvImportRoutes(app)

app.post('/api/transactions', { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const body = createTransactionSchema.parse(request.body)
  assertSplitTotal(body.beneficiarySplits)

  const category = await prisma.category.findFirst({
    where: { id: body.categoryId, householdId: user.householdId, archived: false },
  })
  if (!category) return reply.code(400).send({ error: 'Categoria invalida' })

  const accountIds = [body.sourceAccountId, body.destinationAccountId].filter(Boolean) as string[]
  if (accountIds.length) {
    const count = await prisma.account.count({
      where: { id: { in: accountIds }, ...accountVisibilityWhere(user.id, user.householdId) },
    })
    if (count !== accountIds.length) return reply.code(400).send({ error: 'Cuenta invalida o sin permisos' })
  }

  const beneficiaryUsers = await prisma.user.findMany({
    where: { householdId: user.householdId, id: { in: body.beneficiarySplits.map(split => split.userId) }, active: true },
  })
  if (beneficiaryUsers.length !== body.beneficiarySplits.length) {
    return reply.code(400).send({ error: 'Beneficiario invalido' })
  }

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

    for (const tagName of body.tags) {
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
  return reply.code(201).send({ transaction: { ...result, amount: Number(result.amount) } })
})

app.patch('/api/transactions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = z.object({ id: z.string() }).parse(request.params)
  const body = updateTransactionSchema.parse(request.body)
  if (body.beneficiarySplits) assertSplitTotal(body.beneficiarySplits)

  const existing = await prisma.transaction.findFirst({
    where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
    include: { beneficiaries: true },
  })
  if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

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
  return { transaction: { ...updated, amount: Number(updated.amount) } }
})

app.delete('/api/transactions/:id', { preHandler: requireAuth }, async (request, reply) => {
  const user = request.user!
  const params = z.object({ id: z.string() }).parse(request.params)
  const existing = await prisma.transaction.findFirst({
    where: { id: params.id, ...transactionVisibilityWhere(user.id, user.householdId) },
  })
  if (!existing) return reply.code(404).send({ error: 'Movimiento no encontrado' })

  await prisma.transaction.delete({ where: { id: params.id } })
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'transaction', entityId: params.id, action: 'delete' })
  return { ok: true }
})

app.post('/api/ai/insights', { preHandler: requireAuth }, async request => {
  const user = request.user!
  const body = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.body ?? {})
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

  return { insight: response.content, modelUsed: response.modelUsed }
})

app.get('/api/admin/logs', { preHandler: requireAdmin }, async request => {
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
  return { logs }
})

app.get('/api/admin/audit-logs', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const logs = await prisma.auditLog.findMany({
    where: { householdId: user.householdId },
    orderBy: { createdAt: 'desc' },
    take: 300,
  })
  return { logs }
})

app.get('/api/admin/backups', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const backups = await prisma.backupRun.findMany({
    where: { OR: [{ householdId: user.householdId }, { householdId: null }] },
    orderBy: { startedAt: 'desc' },
    take: 100,
  })
  return { backups: backups.map(backup => ({ ...backup, sizeBytes: backup.sizeBytes?.toString() ?? null })) }
})

app.post('/api/admin/backups/run', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const backup = await runBackup(user.householdId)
  await auditLog({ householdId: user.householdId, actorUserId: user.id, entity: 'backup', entityId: backup.id, action: 'run', metadata: { status: backup.status } })
  return { backup: { ...backup, sizeBytes: backup.sizeBytes?.toString() ?? null } }
})

app.get('/api/admin/users', { preHandler: requireAdmin }, async request => {
  const user = request.user!
  const users = await prisma.user.findMany({
    where: { householdId: user.householdId },
    orderBy: { displayName: 'asc' },
  })
  return { users: users.map(publicUser) }
})

app.patch('/api/admin/users/:id/password', { preHandler: requireAdmin }, async (request, reply) => {
  const actor = request.user!
  const params = z.object({ id: z.string() }).parse(request.params)
  const body = z.object({ password: z.string().min(12) }).parse(request.body)
  const target = await prisma.user.findFirst({ where: { id: params.id, householdId: actor.householdId } })
  if (!target) return reply.code(404).send({ error: 'Usuario no encontrado' })

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(body.password) },
  })
  await prisma.session.updateMany({ where: { userId: target.id }, data: { revokedAt: new Date() } })
  await auditLog({ householdId: actor.householdId, actorUserId: actor.id, entity: 'user', entityId: target.id, action: 'passwordChange' })
  return { ok: true }
})

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
  if (request.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'Not found' })
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
