/**
 * Real database integration tests for critical API endpoints.
 * Tests against actual Fastify app with ephemeral PostgreSQL via Testcontainers.
 */

import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { testContext, resetDb, loginAs, getApp } from './setup-db.js'

// Cookie for authenticated requests
let cookie: string

describe('Health Endpoint', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  it('GET /api/v1/health returns ok with version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.name).toBe('ToppFinance')
    expect(body.version).toBeDefined()
    expect(body.timestamp).toBeDefined()
  })

  it('GET /api/v1/health/ready returns 200 with database check', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.ok).toBe(true)
    expect(body.checks.database.ok).toBe(true)
  })
})

describe('Authentication Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  describe('POST /api/v1/auth/login', () => {
    it('returns 201 and session cookie on valid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: testContext.adminEmail, password: testContext.adminPassword },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.user).toBeDefined()
      expect(body.data.user.email).toBe(testContext.adminEmail)
      expect(body.data.household).toBeDefined()
      expect(res.headers['set-cookie']).toBeDefined()
    })

    it('returns 401 for invalid credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'wrong@example.com', password: 'wrongpassword' },
      })

      expect(res.statusCode).toBe(401)
      const body = JSON.parse(res.body)
      expect(body.error).toBe('Credenciales inválidas')
      expect(body.code).toBe('INVALID_CREDENTIALS')
    })

    it('returns 400 for missing credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: '' },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('POST /api/v1/auth/logout', () => {
    it('returns 200 and clears session cookie', async () => {
      // First login to get a valid cookie
      const loginRes = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { cookie: loginRes },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.ok).toBe(true)
      expect(res.headers['set-cookie']).toBeDefined()
    })
  })

  describe('GET /api/v1/auth/me', () => {
    beforeEach(async () => {
      cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
    })

    it('returns 200 with user data when authenticated', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.user).toBeDefined()
      expect(body.data.user.email).toBe(testContext.adminEmail)
      expect(body.data.household).toBeDefined()
    })

    it('returns 401 when not authenticated', async () => {
      const res = await app.inject({
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
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/transactions', () => {
    it('returns 200 with paginated transactions (empty initially)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.items).toBeDefined()
      expect(body.data.items).toEqual([])
      expect(body.data.total).toBe(0)
      expect(body.data.page).toBe(1)
      expect(body.data.pageSize).toBe(20)
    })

    it('returns 401 without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions',
      })

      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/v1/transactions', () => {
    it('creates an EXPENSE transaction and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { cookie },
        payload: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 15.5,
          description: 'Test expense transaction',
          categoryId: testContext.categoryId,
          sourceAccountId: testContext.accountId,
          visibility: 'SHARED',
          paidByUserId: testContext.adminId,
          beneficiarySplits: [{ userId: testContext.adminId, percent: 100 }],
          tags: [],
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.transaction).toBeDefined()
      // Amount is returned as decimal (production returns Number(amount), not cents)
      expect(body.data.transaction.amount).toBe(15.5)
      expect(body.data.transaction.description).toBe('Test expense transaction')
    })

    it('returns 400 for invalid transaction data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { cookie },
        payload: { type: 'INVALID', amount: -10 },
      })

      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 for invalid category', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { cookie },
        payload: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 10,
          description: 'Test',
          categoryId: 'nonexistent-category',
          sourceAccountId: testContext.accountId,
          visibility: 'SHARED',
          paidByUserId: testContext.adminId,
          beneficiarySplits: [{ userId: testContext.adminId, percent: 100 }],
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
      // First create a transaction
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { cookie },
        payload: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 10,
          description: 'Test expense',
          categoryId: testContext.categoryId,
          sourceAccountId: testContext.accountId,
          visibility: 'SHARED',
          paidByUserId: testContext.adminId,
          beneficiarySplits: [{ userId: testContext.adminId, percent: 100 }],
          tags: [],
        },
      })
      const created = JSON.parse(createRes.body).data.transaction
      const txId = created.id

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/transactions/${txId}`,
        headers: { cookie },
        payload: { description: 'Updated description' },
      })

      expect(updateRes.statusCode).toBe(200)
      const body = JSON.parse(updateRes.body)
      expect(body.data.transaction).toBeDefined()
      expect(body.data.transaction.description).toBe('Updated description')
    })

    it('returns 404 for non-existent transaction', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/transactions/nonexistent-id',
        headers: { cookie },
        payload: { description: 'Updated' },
      })

      expect(res.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/v1/transactions/:id', () => {
    it('deletes a transaction and returns 200', async () => {
      // First create a transaction
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/transactions',
        headers: { cookie },
        payload: {
          type: 'EXPENSE',
          date: '2024-01-15',
          amount: 10,
          description: 'To delete',
          categoryId: testContext.categoryId,
          sourceAccountId: testContext.accountId,
          visibility: 'SHARED',
          paidByUserId: testContext.adminId,
          beneficiarySplits: [{ userId: testContext.adminId, percent: 100 }],
          tags: [],
        },
      })
      const created = JSON.parse(createRes.body).data.transaction
      const txId = created.id

      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/transactions/${txId}`,
        headers: { cookie },
      })

      expect(delRes.statusCode).toBe(200)
      const body = JSON.parse(delRes.body)
      expect(body.data.ok).toBe(true)

      // Verify it's gone
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/transactions',
        headers: { cookie },
      })
      const listBody = JSON.parse(listRes.body)
      expect(listBody.data.total).toBe(0)
    })

    it('returns 404 for non-existent transaction', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/transactions/nonexistent-id',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('Category Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/categories', () => {
    it('returns 200 with categories list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/categories',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.categories).toBeDefined()
      expect(Array.isArray(body.data.categories)).toBe(true)
      // Our seed creates 'groceries' category
      const groceries = body.data.categories.find((c: { slug: string }) => c.slug === 'groceries')
      expect(groceries).toBeDefined()
    })
  })

  describe('POST /api/v1/categories', () => {
    it('creates a category and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/categories',
        headers: { cookie },
        payload: {
          type: 'EXPENSE',
          slug: 'new-category',
          name: 'New Category',
          color: '#00ff00',
          icon: '🏷️',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.category).toBeDefined()
      expect(body.data.category.name).toBe('New Category')
    })
  })

  describe('PATCH /api/v1/categories/:id', () => {
    it('updates a category and returns 200', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/categories/${testContext.categoryId}`,
        headers: { cookie },
        payload: { name: 'Updated Category Name' },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.category).toBeDefined()
    })

    it('returns 404 for non-existent category', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/categories/nonexistent-id',
        headers: { cookie },
        payload: { name: 'Updated' },
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

describe('Account Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/accounts', () => {
    it('returns 200 with accounts list', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/accounts',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.accounts).toBeDefined()
      expect(Array.isArray(body.data.accounts)).toBe(true)
    })
  })

  describe('POST /api/v1/accounts', () => {
    it('creates an account and returns 201', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/accounts',
        headers: { cookie },
        payload: {
          name: 'New Test Account',
          type: 'SAVINGS',
          visibility: 'SHARED',
        },
      })

      expect(res.statusCode).toBe(201)
      const body = JSON.parse(res.body)
      expect(body.data.account).toBeDefined()
      expect(body.data.account.name).toBe('New Test Account')
    })
  })
})

describe('CSV Import Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('POST /api/v1/imports/csv/preview', () => {
    it('returns 200 with import preview', async () => {
      const csvContent = 'Date,Description,Amount\n2024-01-15,Test expense,15.50'

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/csv/preview',
        headers: { cookie },
        payload: {
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
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/csv/preview',
        headers: { cookie },
        payload: { fileName: 'test.csv' },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  describe('POST /api/v1/imports/csv/:id/commit', () => {
    it('commits import and returns 200', async () => {
      const csvContent = 'Date,Description,Amount\n2024-01-15,Test expense,15.50'

      // Preview first
      const previewRes = await app.inject({
        method: 'POST',
        url: '/api/v1/imports/csv/preview',
        headers: { cookie },
        payload: {
          fileName: 'test.csv',
          content: csvContent,
        },
      })
      const previewBody = JSON.parse(previewRes.body)
      const importBatchId = previewBody.data.importBatch.id

      // Commit
      const commitRes = await app.inject({
        method: 'POST',
        url: `/api/v1/imports/csv/${importBatchId}/commit`,
        headers: { cookie },
        payload: {
          rows: previewBody.data.rows.map((row: { rowNumber: number; sourceHash: string; draft: unknown }) => ({
            rowNumber: row.rowNumber,
            sourceHash: row.sourceHash,
            draft: row.draft,
          })),
          includeDuplicates: false,
        },
      })

      expect(commitRes.statusCode).toBe(200)
      const body = JSON.parse(commitRes.body)
      expect(body.data.summary.created).toBeGreaterThan(0)
    })
  })
})

describe('Export Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/exports/history.csv', () => {
    it('returns 200 with CSV content', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/exports/history.csv',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/csv')
    })
  })

  describe('GET /api/v1/exports/history.json', () => {
    it('returns 200 with JSON data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/exports/history.json',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.data.exportedAt).toBeDefined()
      expect(body.data.transactions).toBeDefined()
    })
  })
})

describe('Settings Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/settings', () => {
    it('returns 200 with settings', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/settings',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})

describe('Admin Endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    await resetDb()
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  describe('GET /api/v1/admin/logs', () => {
    it('returns 200 with logs for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/logs',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/v1/admin/audit-logs', () => {
    it('returns 200 with audit logs for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/audit-logs',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('GET /api/v1/admin/backups', () => {
    it('returns 200 with backups for admin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/backups',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
    })
  })

  describe('POST /api/v1/admin/backups/run', () => {
    it('runs backup and returns 200', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/backups/run',
        headers: { cookie },
      })

      expect(res.statusCode).toBe(200)
    })
  })
})

describe('API Versioning', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  it('includes version headers in responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    expect(res.headers['x-api-version']).toBe('v1')
    expect(res.headers['x-api-supported-versions']).toBe('v1')
  })
})

describe('Error Response Format', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await getApp()
  })

  beforeEach(async () => {
    cookie = await loginAs(app, testContext.adminEmail, testContext.adminPassword)
  })

  it('returns standardized error format for 404', async () => {
    const res = await app.inject({
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
    // Note: resetDb is NOT called, but we have a valid cookie from beforeEach
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/transactions',
      headers: { cookie },
      payload: { invalid: 'data' },
    })

    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error).toBeDefined()
    expect(body.code).toBe('VALIDATION_ERROR')
    expect(body.details).toBeDefined()
  })
})