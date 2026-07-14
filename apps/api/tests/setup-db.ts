/**
 * Real database test harness for API integration tests.
 * Uses Testcontainers for an ephemeral PostgreSQL, migrates, and seeds minimal data.
 */

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import fastify, { type FastifyInstance } from 'fastify'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { hash } from '@node-rs/argon2'
import { vi, beforeAll, afterAll } from 'vitest'
import { API_PREFIX } from '../src/apiErrors.js'

// Mock external services BEFORE the app is imported
// AI insights calls OpenRouter (external)
vi.mock('../src/ai.js', () => ({
  callOpenRouter: vi.fn().mockResolvedValue({
    content: 'Test insight output',
    modelUsed: 'test-model',
    promptTokens: 100,
    outputTokens: 50,
    latencyMs: 100,
  }),
  anonymizeTransactions: vi.fn((txs: unknown[]) => txs.map((t: Record<string, unknown>) => ({ ...t, description: '[REDACTED]' }))),
  defaultAiSettings: () => ({
    defaultModel: 'test-model',
    fallbackModels: [],
    enforceZdr: true,
    dataCollection: 'deny',
  }),
}))

// Backup runs pg_dump which is unavailable in the container
vi.mock('../src/backup.js', () => ({
  runBackup: vi.fn().mockResolvedValue({
    id: 'mock-backup-id',
    householdId: 'test-household',
    status: 'SUCCESS',
    filePath: '/backups/mock.dump',
    sizeBytes: 1024,
    checksum: 'abc123',
    startedAt: new Date(),
    finishedAt: new Date(),
    error: null,
  }),
}))

const execAsync = promisify(exec)

// Test context shared across tests
export interface TestContext {
  householdId: string
  adminId: string
  adminEmail: string
  adminPassword: string
  memberId: string
  memberEmail: string
  memberPassword: string
  categoryId: string
  accountId: string
}

// Minimal seed data (inline, no external password env vars needed)
const TEST_ADMIN_PASSWORD = 'AdminPass123!'
const TEST_MEMBER_PASSWORD = 'MemberPass123!'
let testContext: TestContext

// Module-level state for container and app
let container: Awaited<ReturnType<typeof PostgreSqlContainer.start>> | null = null
let appInstance: FastifyInstance | null = null

// Determine project root at runtime (handles vitest transformation)
let ROOT_DIR: string
if (process.cwd().endsWith('apps/api') || process.cwd().endsWith('apps\\api')) {
  ROOT_DIR = process.cwd().slice(0, -8)
} else {
  ROOT_DIR = process.cwd()
}

async function runMigrations(databaseUrl: string) {
  // Use npx to run prisma migrate deploy - works on both Unix and Windows
  // Prisma binary is hoisted to monorepo root but we use npx for cross-platform compatibility
  const { stderr } = await execAsync(`npx prisma migrate deploy`, {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: ROOT_DIR,
  })
  if (stderr) console.error('Prisma migrate stderr:', stderr)
}

async function seedMinimal(databaseUrl: string): Promise<TestContext> {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  })

  try {
    // Create household
    const household = await prisma.household.upsert({
      where: { id: 'test-household' },
      create: { id: 'test-household', name: 'Test Household' },
      update: { name: 'Test Household' },
    })

    // Create admin user
    const adminHash = await hash(TEST_ADMIN_PASSWORD)
    const admin = await prisma.user.upsert({
      where: { email: 'admin@test.local' },
      create: {
        householdId: household.id,
        email: 'admin@test.local',
        displayName: 'Admin User',
        role: 'ADMIN',
        passwordHash: adminHash,
      },
      update: {
        householdId: household.id,
        displayName: 'Admin User',
        role: 'ADMIN',
        active: true,
      },
    })

    // Create member user
    const memberHash = await hash(TEST_MEMBER_PASSWORD)
    const member = await prisma.user.upsert({
      where: { email: 'member@test.local' },
      create: {
        householdId: household.id,
        email: 'member@test.local',
        displayName: 'Member User',
        role: 'MEMBER',
        passwordHash: memberHash,
      },
      update: {
        householdId: household.id,
        displayName: 'Member User',
        active: true,
      },
    })

    // Create one EXPENSE category (shared) with fixed ID for test stability
    const category = await prisma.category.upsert({
      where: { id: 'test-category' },
      create: {
        id: 'test-category',
        householdId: household.id,
        type: 'EXPENSE',
        slug: 'groceries',
        name: 'Groceries',
        icon: '🛒',
        color: '#ff6b6b',
      },
      update: {
        householdId: household.id,
        type: 'EXPENSE',
        slug: 'groceries',
        name: 'Groceries',
      },
    })

    // Create SHARED account (visible to all users)
    const account = await prisma.account.upsert({
      where: { id: 'shared-account' },
      create: {
        id: 'shared-account',
        householdId: household.id,
        name: 'Shared Account',
        type: 'SHARED',
        visibility: 'SHARED',
        openingBalance: 0,
        currency: 'EUR',
      },
      update: {
        name: 'Shared Account',
        archived: false,
      },
    })

    // Set sharedSplit default (50/50)
    await prisma.adminSetting.upsert({
      where: { householdId_key: { householdId: household.id, key: 'sharedSplit' } },
      create: {
        householdId: household.id,
        key: 'sharedSplit',
        value: { miguelPercent: 50, saraPercent: 50 },
      },
      update: {},
    })

    return {
      householdId: household.id,
      adminId: admin.id,
      adminEmail: admin.email,
      adminPassword: TEST_ADMIN_PASSWORD,
      memberId: member.id,
      memberEmail: member.email,
      memberPassword: TEST_MEMBER_PASSWORD,
      categoryId: category.id,
      accountId: account.id,
    }
  } finally {
    await prisma.$disconnect()
  }
}

export async function resetDb() {
  // Import prisma dynamically to get the singleton client used by the app
  const { prisma } = await import('../src/db.js')
  const tables = [
    'AccountEntry',
    'TransactionTag',
    'TransactionBeneficiary',
    'Transaction',
    'Tag',
    'Merchant',
    'Category',
    'Account',
    'AuditLog',
    'AppLog',
    'AdminSetting',
    'AiRequest',
    'ImportBatch',
    'Session',
    'User',
    'Household',
    'BackupRun',
  ]
  // PostgreSQL TRUNCATE RESTART IDENTITY CASCADE resets serial sequences
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tables.join('","')}" RESTART IDENTITY CASCADE`)
  testContext = await seedMinimal(process.env.DATABASE_URL!)
}

export async function loginAs(app: FastifyInstance, email: string, password: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `${API_PREFIX}/auth/login`,
    payload: { email, password },
  })

  const setCookie = res.headers['set-cookie']
  if (!setCookie) throw new Error('Login failed: no cookie returned')
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
  const match = cookieHeader.match(/([^=;]+)=([^;]+)/)
  return match ? `${match[1]}=${match[2]}` : cookieHeader
}

// Export getApp for tests to use the pre-built app
export async function getApp(): Promise<FastifyInstance> {
  if (!appInstance) {
    throw new Error('Test app not initialized - beforeAll hook did not run')
  }
  return appInstance
}

// Test harness hooks
beforeAll(async () => {
  const postgres = await new PostgreSqlContainer('postgres:16-alpine').start()
  container = postgres
  const databaseUrl = postgres.getConnectionUri()

  // Set env for subsequent imports
  process.env.DATABASE_URL = databaseUrl
  process.env.NODE_ENV = 'test'
  process.env.COOKIE_SECURE = 'false'
  process.env.SESSION_COOKIE_NAME = 'toppfinance_session'
  process.env.SESSION_TTL_DAYS = '7'
  process.env.CORS_ORIGIN = 'http://localhost:5175'
  process.env.BACKUP_DIR = './backups'
  process.env.BACKUP_RETENTION_WEEKS = '4'
  process.env.OPENROUTER_FALLBACK_MODELS = ''
  process.env.OPENROUTER_API_KEY = ''
  process.env.OPENROUTER_ZDR = 'true'
  process.env.PORT = '3000'
  process.env.APP_URL = 'http://localhost:3000'

  // Run migrations against the container
  await runMigrations(databaseUrl)

  // Seed minimal data
  testContext = await seedMinimal(databaseUrl)

  // Build the app (imports db.js which creates PrismaClient)
  appInstance = await fastify({ logger: false })
  // We need to dynamically build the app with plugins
  const { buildApp } = await import('../src/app.js')
  appInstance = await buildApp({ logger: false, enableRateLimit: false })
}, 120000)

afterAll(async () => {
  if (appInstance) {
    await appInstance.close()
  }
  if (container) {
    await container.stop()
  }
})

export { testContext }
// Re-export for tests
export const getTestContext = () => testContext