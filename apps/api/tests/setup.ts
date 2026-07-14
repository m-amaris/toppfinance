/**
 * Test setup for API integration tests.
 * Configures test database, mock services, and global test utilities.
 */

import { vi } from 'vitest'

// Create a shared mock Prisma client
function createMockPrisma() {
  const mockPrisma: any = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    household: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    account: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    category: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    accountEntry: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    transactionBeneficiary: {
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    importBatch: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    adminSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    appLog: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    backupRun: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    aiRequest: {
      create: vi.fn(),
    },
    merchant: {
      upsert: vi.fn(),
    },
    tag: {
      upsert: vi.fn(),
    },
    transactionTag: {
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn((callback: any) => callback(mockPrisma)),
  }

  return mockPrisma
}

const mockPrisma = createMockPrisma()

// Mock Prisma client for both module specifiers used in the codebase
vi.mock('../src/db.js', () => ({
  prisma: mockPrisma,
}))

// Also mock the relative import used by testApp.ts (src/testApp.ts -> ./db.js = src/db.js)
// testApp.ts is in apps/api/src/, so ./db.js resolves to apps/api/src/db.js
// From tests/, ../src/db.js also resolves to apps/api/src/db.js
// But to be safe, mock both
vi.mock('../../src/db.js', () => ({
  prisma: mockPrisma,
}))

// Mock shared utilities (verifyPassword, hashToken, etc.)
vi.mock('@toppfinance/shared', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    verifyPassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue('hashed-password'),
    hashToken: vi.fn((token: string) => `hashed-${token}`),
    hashIp: vi.fn((ip: string) => `hashed-ip-${ip}`),
    createSessionToken: vi.fn(() => 'test-session-token-123'),
    dateOnly: vi.fn((d: Date | Date) => new Date(d)),
    toMoney: vi.fn((n: number) => Math.round(n * 100)),
    accountVisibilityWhere: vi.fn(() => ({})),
    transactionVisibilityWhere: vi.fn(() => ({})),
    assertSplitTotal: vi.fn(),
    buildAccountEntries: vi.fn(() => []),
    transactionsToCsv: vi.fn((txs: any[]) => 'csv-output'),
    anonymizeTransactions: vi.fn((txs: any[]) => txs.map(t => ({ ...t, description: '[REDACTED]' }))),
    TransactionType: { EXPENSE: 'EXPENSE', INCOME: 'INCOME', TRANSFER: 'TRANSFER', ADJUSTMENT: 'ADJUSTMENT' },
    Visibility: { SHARED: 'SHARED', PRIVATE: 'PRIVATE' },
    LogLevel: { DEBUG: 'DEBUG', INFO: 'INFO', WARN: 'WARN', ERROR: 'ERROR' },
    LogCategory: { APPLICATION: 'APPLICATION', AUDIT: 'AUDIT', ERROR: 'ERROR', SCHEDULER: 'SCHEDULER', INTEGRATION: 'INTEGRATION', SECURITY: 'SECURITY' },
    envSchema: {
      parse: vi.fn((env: any) => ({
        NODE_ENV: env.NODE_ENV || 'test',
        APP_NAME: env.APP_NAME || 'Test',
        APP_URL: env.APP_URL || 'http://localhost:3000',
        PORT: env.PORT || 3000,
        DATABASE_URL: env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
        SESSION_COOKIE_NAME: env.SESSION_COOKIE_NAME || 'test_session',
        SESSION_TTL_DAYS: env.SESSION_TTL_DAYS || 7,
        COOKIE_SECURE: env.COOKIE_SECURE === 'true',
        CORS_ORIGIN: env.CORS_ORIGIN || 'http://localhost:5175',
        BACKUP_DIR: env.BACKUP_DIR || './backups',
        BACKUP_RETENTION_WEEKS: env.BACKUP_RETENTION_WEEKS || 4,
        OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
        OPENROUTER_DEFAULT_MODEL: env.OPENROUTER_DEFAULT_MODEL,
        OPENROUTER_FALLBACK_MODELS: env.OPENROUTER_FALLBACK_MODELS,
        OPENROUTER_ZDR: env.OPENROUTER_ZDR,
        SEED_ADMIN_EMAIL: env.SEED_ADMIN_EMAIL,
        SEED_ADMIN_NAME: env.SEED_ADMIN_NAME,
        SEED_ADMIN_PASSWORD: env.SEED_ADMIN_PASSWORD,
        SEED_MEMBER_EMAIL: env.SEED_MEMBER_EMAIL,
        SEED_MEMBER_NAME: env.SEED_MEMBER_NAME,
        SEED_MEMBER_PASSWORD: env.SEED_MEMBER_PASSWORD,
      })),
    },
  }
})

// Mock ai.js for AI insights endpoint
vi.mock('../src/ai.js', () => ({
  callOpenRouter: vi.fn().mockResolvedValue({
    content: 'Test insight',
    modelUsed: 'test-model',
    promptTokens: 100,
    outputTokens: 50,
    latencyMs: 100,
  }),
  anonymizeTransactions: vi.fn((txs: any[]) => txs.map(t => ({ ...t, description: '[REDACTED]' }))),
  defaultAiSettings: vi.fn(() => ({ defaultModel: 'test', fallbackModels: [], privacyMode: 'strict' })),
}))

// Mock finance.js for accountWithBalance
vi.mock('../src/finance.js', () => ({
  accountWithBalance: vi.fn().mockResolvedValue(1500),
}))

// Mock backup.js for runBackup
vi.mock('../src/backup.js', () => ({
  runBackup: vi.fn().mockResolvedValue({
    id: 'backup-1',
    householdId: 'household-1',
    status: 'SUCCESS',
    filePath: '/backups/test.dump',
    sizeBytes: 1024n,
    checksum: 'abc123',
    startedAt: new Date(),
    finishedAt: new Date(),
    error: null,
  }),
}))

// Export mockPrisma for use in tests
export { mockPrisma }

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.SESSION_COOKIE_NAME = 'test_session'
process.env.SESSION_TTL_DAYS = '7'
process.env.COOKIE_SECURE = 'false'
process.env.CORS_ORIGIN = 'http://localhost:5175'
process.env.BACKUP_DIR = './backups'
process.env.BACKUP_RETENTION_WEEKS = '4'
process.env.OPENROUTER_FALLBACK_MODELS = ''
process.env.OPENROUTER_API_KEY = ''
process.env.OPENROUTER_DEFAULT_MODEL = 'test-model'
process.env.OPENROUTER_ZDR = 'true'
process.env.APP_NAME = 'Test'
process.env.APP_URL = 'http://localhost:3000'
process.env.PORT = '3000'

// Test utilities
export function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hashed',
    displayName: 'Test User',
    householdId: 'household-1',
    role: 'MEMBER',
    active: true,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createMockHousehold(overrides = {}) {
  return {
    id: 'household-1',
    name: 'Test Household',
    currency: 'EUR',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createMockTransaction(overrides = {}) {
  return {
    id: 'tx-1',
    householdId: 'household-1',
    type: 'EXPENSE',
    date: new Date('2024-01-15'),
    amount: 1500, // cents
    description: 'Test transaction',
    categoryId: 'cat-1',
    merchantId: null,
    sourceAccountId: 'acc-1',
    destinationAccountId: null,
    visibility: 'SHARED',
    paidByUserId: 'user-1',
    createdByUserId: 'user-1',
    notes: null,
    importBatchId: null,
    externalId: null,
    fingerprint: null,
    sourceHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createMockAccount(overrides = {}) {
  return {
    id: 'acc-1',
    householdId: 'household-1',
    name: 'Test Account',
    type: 'CHECKING',
    visibility: 'SHARED',
    ownerUserId: null,
    currency: 'EUR',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

export function createMockCategory(overrides = {}) {
  return {
    id: 'cat-1',
    householdId: 'household-1',
    slug: 'groceries',
    name: 'Groceries',
    type: 'EXPENSE',
    color: '#ff0000',
    icon: '🛒',
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// Extend Vitest matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveStatusCode(status: number): T
    toHaveApiError(code: string, message?: string): T
  }
}