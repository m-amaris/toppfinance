/**
 * Integration tests for critical API endpoints.
 * Tests health, authentication, transactions, categories, accounts, and CSV imports.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { buildTestApp } from '../src/testApp.js'
import { mockPrisma } from './setup.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

const TEST_USER = {
  id: 'user-1',
  email: 'test@example.com',
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$testhash', // 'password123'
  displayName: 'Test User',
  householdId: 'household-1',
  role: 'MEMBER',
  active: true,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const TEST_HOUSEHOLD = {
  id: 'household-1',
  name: 'Test Household',
  currency: 'EUR',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const TEST_SESSION_TOKEN = 'test-session-token-123'
const TEST_SESSION = {
  id: 'session-1',
  userId: TEST_USER.id,
  token: TEST_SESSION_TOKEN,
  tokenHash: `hashed-${TEST_SESSION_TOKEN}`,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  revokedAt: null,
  createdAt: new Date(),
  user: TEST_USER,
}

const TEST_CATEGORY = {
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
}

const TEST_ACCOUNT = {
  id: 'acc-1',
  householdId: 'household-1',
  name: 'Test Checking',
  type: 'CHECKING',
  visibility: 'SHARED',
  ownerUserId: null,
  currency: 'EUR',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const TEST_TRANSACTION = {
  id: 'tx-1',
  householdId: 'household-1',
  type: 'EXPENSE',
  date: new Date('2024-01-15'),
  amount: 1550, // cents (15.50 EUR)
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
  category: TEST_CATEGORY,
  merchant: null,
  sourceAccount: TEST_ACCOUNT,
  destinationAccount: null,
  paidByUser: TEST_USER,
  beneficiaries: [{ userId: 'user-1', percent: 100, amount: 1550, user: TEST_USER }],
  tags: [{ tag: { name: 'test' } }],
}

const ADMIN_USER = { ...TEST_USER, role: 'ADMIN', id: 'admin-1' }
const ADMIN_SESSION = { ...TEST_SESSION, userId: ADMIN_USER.id, token: 'admin-token', user: ADMIN_USER }

function resetMocks() {
  vi.clearAllMocks()
}

function setupAuthMocks() {
  // Mock user lookup for login
  ;(mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_USER)
  // Mock session creation
  ;(mockPrisma.session.create as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_SESSION)
  // Mock session lookup for authenticated routes
  ;(mockPrisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_SESSION)
  // Mock session update (for lastSeenAt in requireAuth)
  ;(mockPrisma.session.update as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_SESSION)
  ;(mockPrisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
  // Mock household lookup
  ;(mockPrisma.household.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_HOUSEHOLD)
  // Mock adminSetting findUnique for settings endpoints
  ;(mockPrisma.adminSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
  ;(mockPrisma.adminSetting.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'setting-1', value: {} })
  // Mock user findMany for beneficiary validation
  ;(mockPrisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_USER])
  // Mock callOpenRouter for AI insights
  ;(mockPrisma.aiRequest.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
  // Mock merchant upsert
  ;(mockPrisma.merchant.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'merchant-1', name: 'Test Merchant' })
  // Mock tag upsert
  ;(mockPrisma.tag.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'tag-1', name: 'test' })
  // Mock transactionTag create
  ;(mockPrisma.transactionTag.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
  // Mock accountEntry createMany
  ;(mockPrisma.accountEntry.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
  // Mock accountEntry deleteMany
  ;(mockPrisma.accountEntry.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
  // Mock transactionBeneficiary createMany/deleteMany
  ;(mockPrisma.transactionBeneficiary.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
  ;(mockPrisma.transactionBeneficiary.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
}

function setupTransactionMocks() {
  ;(mockPrisma.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_TRANSACTION)
  ;(mockPrisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_TRANSACTION])
  ;(mockPrisma.transaction.create as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_TRANSACTION)
  ;(mockPrisma.transaction.update as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_TRANSACTION)
  ;(mockPrisma.transaction.delete as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_TRANSACTION)
  ;(mockPrisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  ;(mockPrisma.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_CATEGORY)
  ;(mockPrisma.account.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_ACCOUNT])
  ;(mockPrisma.account.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_ACCOUNT)
  ;(mockPrisma.account.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  ;(mockPrisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_CATEGORY])
}

function setupCategoryMocks() {
  ;(mockPrisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_CATEGORY])
  ;(mockPrisma.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_CATEGORY)
  ;(mockPrisma.category.create as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_CATEGORY)
  ;(mockPrisma.category.update as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_CATEGORY)
  ;(mockPrisma.category.delete as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_CATEGORY)
  ;(mockPrisma.transaction.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
}

function setupAccountMocks() {
  ;(mockPrisma.account.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_ACCOUNT])
  ;(mockPrisma.account.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_ACCOUNT)
  ;(mockPrisma.account.create as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_ACCOUNT)
  ;(mockPrisma.account.update as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_ACCOUNT)
  ;(mockPrisma.account.delete as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_ACCOUNT)
  ;(mockPrisma.account.count as ReturnType<typeof vi.fn>).mockResolvedValue(1)
  ;(mockPrisma.accountEntry.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
}

function setupImportMocks() {
  ;(mockPrisma.importBatch.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'import-1',
    householdId: 'household-1',
    importedById: 'user-1',
    fileName: 'test.csv',
    status: 'PREVIEWED',
    rowsCount: 2,
    warningsCount: 0,
    createdAt: new Date(),
    committedAt: null,
  })
  ;(mockPrisma.importBatch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'import-1',
    householdId: 'household-1',
    importedById: 'user-1',
    fileName: 'test.csv',
    status: 'PREVIEWED',
    rowsCount: 2,
    warningsCount: 0,
    createdAt: new Date(),
    committedAt: null,
  })
  ;(mockPrisma.importBatch.update as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'import-1',
    status: 'COMMITTED',
    committedAt: new Date(),
  })
  ;(mockPrisma.category.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_CATEGORY])
  ;(mockPrisma.account.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_ACCOUNT])
  ;(mockPrisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_USER])
  ;(mockPrisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(mockPrisma.adminSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
}

function setupExportMocks() {
  ;(mockPrisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_TRANSACTION])
}

function setupAdminMocks() {
  ;(mockPrisma.appLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(mockPrisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(mockPrisma.backupRun.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
  ;(mockPrisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([ADMIN_USER])
  ;(mockPrisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN_USER)
  ;(mockPrisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN_USER)
  ;(mockPrisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
}

async function inject(app: FastifyInstance, options: { method: string; url: string; body?: unknown; headers?: Record<string, string>; cookies?: string }) {
  const headers: Record<string, string> = {
    ...options.headers,
    cookie: options.cookies || '',
  }
  // Only set content-type for requests with a body
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json'
  }
  return app.inject({
    method: options.method,
    url: options.url,
    payload: options.body,
    headers,
  })
}

beforeAll(async () => {
  app = await buildTestApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetMocks()
})

describe('Health Endpoint', () => {
  beforeEach(() => {
    ;(mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }])
  })

  it('GET /api/v1/health returns ok with version', async () => {
    const res = await inject(app, { method: 'GET', url: '/api/v1/health' })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.name).toBe('ToppFinance')
    expect(body.version).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })

  it('GET /api/v1/health returns 500 when database is down', async () => {
    ;(mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Connection refused'))

    const res = await inject(app, { method: 'GET', url: '/api/v1/health' })

    expect(res.statusCode).toBe(500)
    const body = JSON.parse(res.body)
    expect(body.error).toBe('Database connection failed')
    expect(body.code).toBe('DATABASE_ERROR')
  })
})

describe('Authentication Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  describe('POST /api/v1/auth/login', () => {
    it('returns 201 and session cookie on valid credentials', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: 'test@example.com', password: 'password123' },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.user).toBeDefined()
      expect(body.data.user.email).toBe('test@example.com')
      expect(res.headers['set-cookie']).toBeDefined()
    })

    it('returns 401 for invalid credentials', async () => {
      ;(mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: 'wrong@example.com', password: 'password123' },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Credenciales inválidas')
      expect(body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 400 for missing credentials', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/auth/login',
        body: { email: '' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('returns 204 and clears session cookie', async () => {
      setupAuthMocks()

      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/auth/logout',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(204)
      expect(res.headers['set-cookie']).toBeDefined()
    })
  })

  describe('GET /api/v1/auth/me', () => {
    it('returns 200 with user data when authenticated', async () => {
      setupAuthMocks()

      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.user).toBeDefined()
      expect(body.data.user.email).toBe('test@example.com')
    })

    it('returns 401 when not authenticated', async () => {
      ;(mockPrisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/auth/me',
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('UNAUTHENTICATED')
    })
  })
})

describe('Transaction Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
    setupTransactionMocks()
  })

  describe('GET /api/v1/transactions', () => {
    it('returns 200 with paginated transactions', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/transactions',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.items).toBeDefined()
      expect(body.data.total).toBeDefined()
      expect(body.data.page).toBe(1)
      expect(body.data.pageSize).toBe(20)
    })

    it('respects pagination parameters', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/transactions?page=2&pageSize=10',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.page).toBe(2)
      expect(body.data.pageSize).toBe(10)
    })

    it('returns 401 without authentication', async () => {
      const res = await inject(app, { method: 'GET', url: '/api/v1/transactions' })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/v1/transactions', () => {
    it('creates a transaction and returns 201', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/transactions',
        cookies: 'test_session=test-session-token-123',
        body: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 15.50,
          description: 'Test expense',
          categoryId: 'cat-1',
          sourceAccountId: 'acc-1',
          visibility: 'SHARED',
          paidByUserId: 'user-1',
          beneficiarySplits: [{ userId: 'user-1', percent: 100 }],
          tags: [],
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.transaction).toBeDefined()
      expect(body.data.transaction.amount).toBe(15.50)
    })

    it('returns 400 for invalid transaction data', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/transactions',
        cookies: 'test_session=test-session-token-123',
        body: { type: 'INVALID', amount: -10 },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid category', async () => {
      ;(mockPrisma.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/transactions',
        cookies: 'test_session=test-session-token-123',
        body: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 15.50,
          description: 'Test',
          categoryId: 'invalid-cat',
          sourceAccountId: 'acc-1',
          visibility: 'SHARED',
          paidByUserId: 'user-1',
          beneficiarySplits: [{ userId: 'user-1', percent: 100 }],
          tags: [],
        },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('INVALID_CATEGORY')
    })
  })

  describe('PATCH /api/v1/transactions/:id', () => {
    it('updates a transaction and returns 200', async () => {
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/transactions/tx-1',
        cookies: 'test_session=test-session-token-123',
        body: { description: 'Updated description' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.transaction).toBeDefined()
    })

    it('returns 404 for non-existent transaction', async () => {
      ;(mockPrisma.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/transactions/non-existent',
        cookies: 'test_session=test-session-token-123',
        body: { description: 'Updated' },
      })

      expect(res.statusCode).toBe(404)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('NOT_FOUND')
    })
  })

  describe('DELETE /api/v1/transactions/:id', () => {
    it('deletes a transaction and returns 200', async () => {
      const res = await inject(app, {
        method: 'DELETE',
        url: '/api/v1/transactions/tx-1',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.ok).toBe(true)
    })

    it('returns 404 for non-existent transaction', async () => {
      ;(mockPrisma.transaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'DELETE',
        url: '/api/v1/transactions/non-existent',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('Category Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
    setupCategoryMocks()
  })

  describe('GET /api/v1/categories', () => {
    it('returns 200 with categories list', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/categories',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.categories).toBeDefined()
      expect(Array.isArray(body.data.categories)).toBe(true)
    })
  })

  describe('POST /api/v1/categories', () => {
    it('creates a category and returns 201', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/categories',
        cookies: 'test_session=test-session-token-123',
        body: {
          name: 'New Category',
          type: 'EXPENSE',
          color: '#00ff00',
          icon: '🏷️',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.category).toBeDefined()
    })

    it('returns 400 for invalid category data', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/categories',
        cookies: 'test_session=test-session-token-123',
        body: { name: '', type: 'INVALID' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('PATCH /api/v1/categories/:id', () => {
    it('updates a category and returns 200', async () => {
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/categories/cat-1',
        cookies: 'test_session=test-session-token-123',
        body: { name: 'Updated Category' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.category).toBeDefined()
    })

    it('returns 404 for non-existent category', async () => {
      ;(mockPrisma.category.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/categories/non-existent',
        cookies: 'test_session=test-session-token-123',
        body: { name: 'Updated' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/v1/categories/:id', () => {
    it('archives a category and returns 200', async () => {
      const res = await inject(app, {
        method: 'DELETE',
        url: '/api/v1/categories/cat-1',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.ok).toBe(true)
    })
  })
})

describe('Account Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
    setupAccountMocks()
  })

  describe('GET /api/v1/accounts', () => {
    it('returns 200 with accounts list', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/accounts',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.accounts).toBeDefined()
      expect(Array.isArray(body.data.accounts)).toBe(true)
    })
  })

  describe('POST /api/v1/accounts', () => {
    it('creates an account and returns 201', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/accounts',
        cookies: 'test_session=test-session-token-123',
        body: {
          name: 'New Account',
          type: 'SAVINGS',
          visibility: 'SHARED',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.account).toBeDefined()
    })
  })

  describe('PATCH /api/v1/accounts/:id', () => {
    it('updates an account and returns 200', async () => {
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/accounts/acc-1',
        cookies: 'test_session=test-session-token-123',
        body: { name: 'Updated Account' },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('DELETE /api/v1/accounts/:id', () => {
    it('deletes an account and returns 200', async () => {
      const res = await inject(app, {
        method: 'DELETE',
        url: '/api/v1/accounts/acc-1',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
    })
  })
})

describe('CSV Import Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
    setupImportMocks()
  })

  describe('POST /api/v1/imports/csv/preview', () => {
    it('returns 200 with import preview', async () => {
      const csvContent = 'Date,Description,Amount\n2024-01-15,Test,15.50'

      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/imports/csv/preview',
        cookies: 'test_session=test-session-token-123',
        body: {
          fileName: 'test.csv',
          content: csvContent,
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.importBatch).toBeDefined()
      expect(body.data.rows).toBeDefined()
      expect(body.data.summary).toBeDefined()
    })

    it('returns 400 for missing CSV content', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/imports/csv/preview',
        cookies: 'test_session=test-session-token-123',
        body: { fileName: 'test.csv' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/v1/imports/csv/:id/commit', () => {
    it('commits import and returns 200', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/imports/csv/import-1/commit',
        cookies: 'test_session=test-session-token-123',
        body: {
          rows: [
            { rowNumber: 1, sourceHash: 'a'.repeat(16), draft: { type: 'EXPENSE', date: '2024-01-15', amount: 15.50, description: 'Test', categoryId: 'cat-1', sourceAccountId: 'acc-1', visibility: 'SHARED', paidByUserId: 'user-1', beneficiarySplits: [{ userId: 'user-1', percent: 100 }], tags: [] } },
          ],
          includeDuplicates: false,
        },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.summary).toBeDefined()
    })

    it('returns 404 for non-existent import batch', async () => {
      ;(mockPrisma.importBatch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/imports/csv/non-existent/commit',
        cookies: 'test_session=test-session-token-123',
        body: {
          rows: [
            { rowNumber: 1, sourceHash: 'a'.repeat(16), draft: { type: 'EXPENSE', date: '2024-01-15', amount: 15.50, description: 'Test', categoryId: 'cat-1', sourceAccountId: 'acc-1', visibility: 'SHARED', paidByUserId: 'user-1', beneficiarySplits: [{ userId: 'user-1', percent: 100 }], tags: [] } },
          ],
          includeDuplicates: false,
        },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('Export Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
    setupExportMocks()
  })

  describe('GET /api/v1/exports/history.csv', () => {
    it('returns 200 with CSV content', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/exports/history.csv',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
    })
  })

  describe('GET /api/v1/exports/history.json', () => {
    it('returns 200 with JSON data', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/exports/history.json',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.exportedAt).toBeDefined()
      expect(body.data.transactions).toBeDefined()
    })
  })
})

describe('Settings Endpoints', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  describe('GET /api/v1/settings', () => {
    it('returns 200 with settings', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/settings',
        cookies: 'test_session=test-session-token-123',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('PATCH /api/v1/settings', () => {
    it('updates settings and returns 200', async () => {
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/settings',
        cookies: 'test_session=test-session-token-123',
        body: { currency: 'USD' },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})

describe('AI Insights Endpoint', () => {
  beforeEach(() => {
    setupAuthMocks()
    ;(mockPrisma.transaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([TEST_TRANSACTION])
    ;(mockPrisma.adminSetting.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    ;(mockPrisma.aiRequest.create as ReturnType<typeof vi.fn>).mockResolvedValue({})
  })

  describe('POST /api/v1/ai/insights', () => {
    it('returns 200 with AI insight', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/ai/insights',
        cookies: 'test_session=test-session-token-123',
        body: { month: '2024-01' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.insight).toBeDefined()
      expect(body.data.modelUsed).toBeDefined()
    })
  })
})

describe('Admin Endpoints', () => {
  beforeEach(() => {
    resetMocks()
    ;(mockPrisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN_USER)
    ;(mockPrisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(ADMIN_SESSION)
    ;(mockPrisma.household.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(TEST_HOUSEHOLD)
    setupAdminMocks()
  })

  describe('GET /api/v1/admin/logs', () => {
    it('returns 200 with logs for admin', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/admin/logs',
        cookies: 'test_session=admin-token',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/v1/admin/audit-logs', () => {
    it('returns 200 with audit logs for admin', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
        cookies: 'test_session=admin-token',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/v1/admin/backups', () => {
    it('returns 200 with backups for admin', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/admin/backups',
        cookies: 'test_session=admin-token',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('POST /api/v1/admin/backups/run', () => {
    it('runs backup and returns 200', async () => {
      const res = await inject(app, {
        method: 'POST',
        url: '/api/v1/admin/backups/run',
        cookies: 'test_session=admin-token',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/v1/admin/users', () => {
    it('returns 200 with users for admin', async () => {
      const res = await inject(app, {
        method: 'GET',
        url: '/api/v1/admin/users',
        cookies: 'test_session=admin-token',
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('PATCH /api/v1/admin/users/:id/password', () => {
    it('changes user password and returns 200', async () => {
      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/admin/users/user-1/password',
        cookies: 'test_session=admin-token',
        body: { password: 'newpassword123' },
      })

      expect(res.statusCode).toBe(200)
    })

    it('returns 404 for non-existent user', async () => {
      ;(mockPrisma.user.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const res = await inject(app, {
        method: 'PATCH',
        url: '/api/v1/admin/users/non-existent/password',
        cookies: 'test_session=admin-token',
        body: { password: 'newpassword123' },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('API Versioning', () => {
  beforeEach(() => {
    resetMocks()
    setupAuthMocks()
    setupTransactionMocks()
    ;(mockPrisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([{ '?column?': 1 }])
  })

  it('includes version headers in responses', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.headers['x-api-version']).toBe('v1')
    expect(res.headers['x-api-supported-versions']).toBe('v1')
  })

  it('negotiates version via Accept-Version header', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'Accept-Version': 'v1' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['x-api-version']).toBe('v1')
  })

  it('falls back to default version for unknown version', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'Accept-Version': 'v999' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers['x-api-version']).toBe('v1')
  })
})

describe('Error Response Format', () => {
  beforeEach(() => {
    setupAuthMocks()
  })

  it('returns standardized error format for 404', async () => {
    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/nonexistent',
    })

    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
    expect(body.code).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })

  it('returns standardized error format for validation errors', async () => {
    const res = await inject(app, {
      method: 'POST',
      url: '/api/v1/transactions',
      cookies: 'test_session=test-session-token-123',
      body: { invalid: 'data' },
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.details).toBeDefined()
  })

  it('returns standardized error format for 401', async () => {
    ;(mockPrisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

    const res = await inject(app, {
      method: 'GET',
      url: '/api/v1/auth/me',
    })

    expect(res.statusCode).toBe(401)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
    expect(body.code).toBe('UNAUTHENTICATED')
  })
})