import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateBudgetUniqueness,
  calculateBudgetSpending,
  getBudgetAlertLevel,
  createBudgetSummary,
  getDefaultBudgetCategories,
  formatMonthEs,
  BudgetAlertLevel,
  type BudgetResponse,
  type BudgetWithSpending,
  type BudgetSummary,
  type CategorySummary,
} from '../src/budgets.js'
import { TransactionType, BudgetScope } from '../src/enums.js'

describe('budgets.ts — Budget utilities', () => {
  // ============================================================
  // formatMonthEs (internal helper, tested via validateBudgetUniqueness)
  // ============================================================
  describe('formatMonthEs', () => {
    it('formats month in Spanish', () => {
      // Test via validateBudgetUniqueness error message
      const result = validateBudgetUniqueness([], { month: '2024-01', scope: 'USER', ownerUserId: 'u1' })
      expect(result.valid).toBe(true)

      // Test the internal function directly by checking error message format
      const conflictResult = validateBudgetUniqueness(
        [{ month: '2024-01', scope: 'USER', ownerUserId: 'u1' }],
        { month: '2024-01', scope: 'USER', ownerUserId: 'u1' }
      )
      expect(conflictResult.error).toContain('enero de 2024')
    })

    it('formats different months correctly', () => {
      const months = [
        { month: '2024-01', expected: 'enero de 2024' },
        { month: '2024-06', expected: 'junio de 2024' },
        { month: '2024-12', expected: 'diciembre de 2024' },
        { month: '2025-03', expected: 'marzo de 2025' },
      ]
      months.forEach(({ month, expected }) => {
        const result = validateBudgetUniqueness(
          [{ month, scope: 'USER', ownerUserId: 'u1' }],
          { month, scope: 'USER', ownerUserId: 'u1' }
        )
        expect(result.error).toContain(expected)
      })
    })
  })

  // ============================================================
  // validateBudgetUniqueness
  // ============================================================
  describe('validateBudgetUniqueness', () => {
    const existingBudgets = [
      { month: '2024-01', scope: 'USER' as const, ownerUserId: 'user-1' },
      { month: '2024-01', scope: 'SHARED' as const, ownerUserId: null },
      { month: '2024-02', scope: 'USER' as const, ownerUserId: 'user-1' },
      { month: '2024-01', scope: 'USER' as const, ownerUserId: 'user-2' },
    ]

    it('returns valid=true when no conflict', () => {
      const result = validateBudgetUniqueness(existingBudgets, { month: '2024-03', scope: 'USER', ownerUserId: 'user-1' })
      expect(result.valid).toBe(true)
      expect(result.error).toBeUndefined()
    })

    it('returns valid=false for same month, scope, and owner', () => {
      const result = validateBudgetUniqueness(existingBudgets, { month: '2024-01', scope: 'USER', ownerUserId: 'user-1' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Ya existe un presupuesto personal de usuario para enero de 2024')
    })

    it('allows same month different scope', () => {
      // existingBudgets has USER scope for user-1 at 2024-01, new budget is SHARED scope
      const result = validateBudgetUniqueness(existingBudgets, { month: '2024-01', scope: 'SHARED', ownerUserId: 'user-1' })
      expect(result.valid).toBe(true)
    })

    it('allows same month different owner for USER scope', () => {
      const result = validateBudgetUniqueness(existingBudgets, { month: '2024-01', scope: 'USER', ownerUserId: 'user-3' })
      expect(result.valid).toBe(true)
    })

    it('allows same month different ownerUserId (null vs user) for SHARED scope', () => {
      // existingBudgets has SHARED with null ownerUserId at 2024-01
      // new budget is SHARED with user-1 - different ownerUserId
      const result = validateBudgetUniqueness(existingBudgets, { month: '2024-01', scope: 'SHARED', ownerUserId: 'user-1' })
      expect(result.valid).toBe(true)
    })

    it('detects conflict for SHARED scope with same ownerUserId', () => {
      const sharedBudgets = [{ month: '2024-01', scope: 'SHARED' as const, ownerUserId: 'user-1' }]
      const result = validateBudgetUniqueness(sharedBudgets, { month: '2024-01', scope: 'SHARED', ownerUserId: 'user-1' })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('compartido de usuario')
    })

    it('detects conflict for SHARED scope with null ownerUserId', () => {
      const sharedBudgets = [{ month: '2024-01', scope: 'SHARED' as const, ownerUserId: null }]
      const result = validateBudgetUniqueness(sharedBudgets, { month: '2024-01', scope: 'SHARED', ownerUserId: null })
      expect(result.valid).toBe(false)
      expect(result.error).toContain('compartido')
    })

    it('handles empty existing budgets', () => {
      const result = validateBudgetUniqueness([], { month: '2024-01', scope: 'USER', ownerUserId: 'user-1' })
      expect(result.valid).toBe(true)
    })

    it('treats undefined ownerUserId as different from null (strict equality)', () => {
      const budgets = [{ month: '2024-01', scope: 'USER' as const, ownerUserId: undefined }]
      const result = validateBudgetUniqueness(budgets as any, { month: '2024-01', scope: 'USER', ownerUserId: null })
      // undefined !== null with strict equality, so no conflict detected
      expect(result.valid).toBe(true)
    })
  })

  // ============================================================
  // calculateBudgetSpending
  // ============================================================
  describe('calculateBudgetSpending', () => {
    const mockBudget: BudgetResponse = {
      id: 'budget-1',
      householdId: 'hh-1',
      month: '2024-01',
      scope: BudgetScope.USER,
      ownerUserId: 'user-1',
      categories: [
        { categoryId: 'cat-1', limitAmount: 300, category: { id: 'cat-1', slug: 'alimentacion', name: 'Alimentación', icon: 'ShoppingCart', color: '#437a22', type: TransactionType.EXPENSE, archived: false, householdId: 'hh-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' } },
        { categoryId: 'cat-2', limitAmount: 150, category: { id: 'cat-2', slug: 'transporte', name: 'Transporte', icon: 'Car', color: '#006494', type: TransactionType.EXPENSE, archived: false, householdId: 'hh-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' } },
        { categoryId: 'cat-3', limitAmount: 100, category: { id: 'cat-3', slug: 'ocio', name: 'Ocio', icon: 'Gamepad2', color: '#d19900', type: TransactionType.EXPENSE, archived: false, householdId: 'hh-1', createdAt: '2024-01-01', updatedAt: '2024-01-01' } },
      ],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    const mockTransactions = [
      { categoryId: 'cat-1', amount: -50, type: TransactionType.EXPENSE, date: '2024-01-15' },
      { categoryId: 'cat-1', amount: -30, type: TransactionType.EXPENSE, date: '2024-01-20' },
      { categoryId: 'cat-2', amount: -100, type: TransactionType.EXPENSE, date: '2024-01-10' },
      { categoryId: 'cat-3', amount: -200, type: TransactionType.EXPENSE, date: '2024-01-05' }, // over budget
      { categoryId: 'cat-1', amount: -20, type: TransactionType.EXPENSE, date: '2024-02-01' }, // different month, ignored
      { categoryId: 'cat-1', amount: 100, type: TransactionType.INCOME, date: '2024-01-15' }, // income, ignored
    ]

    it('calculates spending per category correctly', () => {
      const result = calculateBudgetSpending(mockBudget, mockTransactions)

      const cat1 = result.categories.find(c => c.categoryId === 'cat-1')
      expect(cat1?.spent).toBe(80) // 50 + 30
      expect(cat1?.remaining).toBe(220) // 300 - 80
      expect(cat1?.percentUsed).toBeCloseTo(26.67, 1)

      const cat2 = result.categories.find(c => c.categoryId === 'cat-2')
      expect(cat2?.spent).toBe(100)
      expect(cat2?.remaining).toBe(50)
      expect(cat2?.percentUsed).toBeCloseTo(66.67, 1)

      const cat3 = result.categories.find(c => c.categoryId === 'cat-3')
      expect(cat3?.spent).toBe(200)
      expect(cat3?.remaining).toBe(-100) // over budget
      expect(cat3?.percentUsed).toBe(200)
    })

    it('filters transactions by budget month', () => {
      const result = calculateBudgetSpending(mockBudget, mockTransactions)
      // The Feb transaction should be ignored
      const cat1 = result.categories.find(c => c.categoryId === 'cat-1')
      expect(cat1?.spent).toBe(80) // only Jan transactions
    })

    it('ignores income transactions', () => {
      const result = calculateBudgetSpending(mockBudget, mockTransactions)
      const cat1 = result.categories.find(c => c.categoryId === 'cat-1')
      expect(cat1?.spent).toBe(80) // not 180 (ignores the +100 income)
    })

    it('calculates totals correctly', () => {
      const result = calculateBudgetSpending(mockBudget, mockTransactions)
      expect(result.totalBudget).toBe(550) // 300 + 150 + 100
      expect(result.totalSpent).toBe(380) // 80 + 100 + 200
      expect(result.totalRemaining).toBe(170) // 550 - 380
    })

    it('rounds to 2 decimal places', () => {
      const budgetWithDecimals: BudgetResponse = {
        ...mockBudget,
        categories: [
          { categoryId: 'cat-1', limitAmount: 100.01, category: mockBudget.categories[0].category },
        ],
      }
      const transactions = [{ categoryId: 'cat-1', amount: -33.333, type: TransactionType.EXPENSE, date: '2024-01-15' }]
      const result = calculateBudgetSpending(budgetWithDecimals, transactions)
      expect(result.categories[0].spent).toBe(33.33)
      expect(result.categories[0].remaining).toBe(66.68) // 100.01 - 33.33
      expect(result.categories[0].percentUsed).toBe(33.33) // (33.33/100.01)*100
    })

    it('handles zero limit amount', () => {
      const budgetZeroLimit: BudgetResponse = {
        ...mockBudget,
        categories: [
          { categoryId: 'cat-1', limitAmount: 0, category: mockBudget.categories[0].category },
        ],
      }
      const transactions = [{ categoryId: 'cat-1', amount: -50, type: TransactionType.EXPENSE, date: '2024-01-15' }]
      const result = calculateBudgetSpending(budgetZeroLimit, transactions)
      expect(result.categories[0].percentUsed).toBe(0)
    })

    it('handles empty transactions array', () => {
      const result = calculateBudgetSpending(mockBudget, [])
      expect(result.totalSpent).toBe(0)
      expect(result.categories.every(c => c.spent === 0)).toBe(true)
      expect(result.categories.every(c => c.remaining === c.limitAmount)).toBe(true)
    })

    it('handles categories with no matching transactions', () => {
      const budget = { ...mockBudget, categories: [...mockBudget.categories, { categoryId: 'cat-4', limitAmount: 50, category: { ...mockBudget.categories[0].category, id: 'cat-4', slug: 'otros' } }] }
      const result = calculateBudgetSpending(budget, mockTransactions)
      const cat4 = result.categories.find(c => c.categoryId === 'cat-4')
      expect(cat4?.spent).toBe(0)
      expect(cat4?.remaining).toBe(50)
      expect(cat4?.percentUsed).toBe(0)
    })

    it('preserves all budget fields in result', () => {
      const result = calculateBudgetSpending(mockBudget, mockTransactions)
      expect(result.id).toBe(mockBudget.id)
      expect(result.householdId).toBe(mockBudget.householdId)
      expect(result.month).toBe(mockBudget.month)
      expect(result.scope).toBe(mockBudget.scope)
      expect(result.ownerUserId).toBe(mockBudget.ownerUserId)
      expect(result.createdAt).toBe(mockBudget.createdAt)
      expect(result.updatedAt).toBe(mockBudget.updatedAt)
    })
  })

  // ============================================================
  // getBudgetAlertLevel
  // ============================================================
  describe('getBudgetAlertLevel', () => {
    it('returns OK for < 80%', () => {
      expect(getBudgetAlertLevel(0)).toBe(BudgetAlertLevel.OK)
      expect(getBudgetAlertLevel(50)).toBe(BudgetAlertLevel.OK)
      expect(getBudgetAlertLevel(79.99)).toBe(BudgetAlertLevel.OK)
    })

    it('returns WARNING for >= 80% and < 100%', () => {
      expect(getBudgetAlertLevel(80)).toBe(BudgetAlertLevel.WARNING)
      expect(getBudgetAlertLevel(90)).toBe(BudgetAlertLevel.WARNING)
      expect(getBudgetAlertLevel(99.99)).toBe(BudgetAlertLevel.WARNING)
    })

    it('returns CRITICAL for >= 100%', () => {
      expect(getBudgetAlertLevel(100)).toBe(BudgetAlertLevel.CRITICAL)
      expect(getBudgetAlertLevel(150)).toBe(BudgetAlertLevel.CRITICAL)
      expect(getBudgetAlertLevel(200)).toBe(BudgetAlertLevel.CRITICAL)
    })
  })

  // ============================================================
  // createBudgetSummary
  // ============================================================
  describe('createBudgetSummary', () => {
    const mockBudgetWithSpending: BudgetWithSpending = {
      id: 'budget-1',
      householdId: 'hh-1',
      month: '2024-01',
      scope: BudgetScope.USER,
      ownerUserId: 'user-1',
      categories: [
        { categoryId: 'cat-1', limitAmount: 300, category: {} as any, spent: 250, remaining: 50, percentUsed: 83.33 },
        { categoryId: 'cat-2', limitAmount: 100, category: {} as any, spent: 120, remaining: -20, percentUsed: 120 },
        { categoryId: 'cat-3', limitAmount: 200, category: {} as any, spent: 150, remaining: 50, percentUsed: 75 },
        { categoryId: 'cat-4', limitAmount: 50, category: {} as any, spent: 50, remaining: 0, percentUsed: 100 },
      ],
      totalBudget: 650,
      totalSpent: 570,
      totalRemaining: 80,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    }

    it('creates summary with correct totals', () => {
      const summary = createBudgetSummary(mockBudgetWithSpending)
      expect(summary.month).toBe('2024-01')
      expect(summary.scope).toBe(BudgetScope.USER)
      expect(summary.ownerUserId).toBe('user-1')
      expect(summary.totalBudget).toBe(650)
      expect(summary.totalSpent).toBe(570)
      expect(summary.totalRemaining).toBe(80)
    })

    it('counts categories over budget (>= 100%)', () => {
      const summary = createBudgetSummary(mockBudgetWithSpending)
      // cat-2 (120%), cat-4 (100%) = 2 categories over budget
      expect(summary.categoriesOverBudget).toBe(2)
    })

    it('counts categories near limit (>= 80% and < 100%)', () => {
      const summary = createBudgetSummary(mockBudgetWithSpending)
      // cat-1 (83.33%) = 1 category near limit
      expect(summary.categoriesNearLimit).toBe(1)
    })

    it('handles empty categories', () => {
      const emptyBudget: BudgetWithSpending = {
        ...mockBudgetWithSpending,
        categories: [],
        totalBudget: 0,
        totalSpent: 0,
        totalRemaining: 0,
      }
      const summary = createBudgetSummary(emptyBudget)
      expect(summary.categoriesOverBudget).toBe(0)
      expect(summary.categoriesNearLimit).toBe(0)
    })

    it('handles all OK categories', () => {
      const okBudget: BudgetWithSpending = {
        ...mockBudgetWithSpending,
        categories: [
          { categoryId: 'cat-1', limitAmount: 300, category: {} as any, spent: 100, remaining: 200, percentUsed: 33 },
          { categoryId: 'cat-2', limitAmount: 100, category: {} as any, spent: 50, remaining: 50, percentUsed: 50 },
        ],
        totalBudget: 400,
        totalSpent: 150,
        totalRemaining: 250,
      }
      const summary = createBudgetSummary(okBudget)
      expect(summary.categoriesOverBudget).toBe(0)
      expect(summary.categoriesNearLimit).toBe(0)
    })

    it('handles all WARNING categories', () => {
      const warnBudget: BudgetWithSpending = {
        ...mockBudgetWithSpending,
        categories: [
          { categoryId: 'cat-1', limitAmount: 300, category: {} as any, spent: 250, remaining: 50, percentUsed: 83 },
          { categoryId: 'cat-2', limitAmount: 100, category: {} as any, spent: 90, remaining: 10, percentUsed: 90 },
        ],
        totalBudget: 400,
        totalSpent: 340,
        totalRemaining: 60,
      }
      const summary = createBudgetSummary(warnBudget)
      expect(summary.categoriesOverBudget).toBe(0)
      expect(summary.categoriesNearLimit).toBe(2)
    })
  })

  // ============================================================
  // getDefaultBudgetCategories
  // ============================================================
  describe('getDefaultBudgetCategories', () => {
    const allCategories = [
      { id: 'cat-1', slug: 'vivienda', name: 'Vivienda', type: TransactionType.EXPENSE },
      { id: 'cat-2', slug: 'servicios', name: 'Servicios', type: TransactionType.EXPENSE },
      { id: 'cat-3', slug: 'alimentacion', name: 'Alimentación', type: TransactionType.EXPENSE },
      { id: 'cat-4', slug: 'transporte', name: 'Transporte', type: TransactionType.EXPENSE },
      { id: 'cat-5', slug: 'salud', name: 'Salud', type: TransactionType.EXPENSE },
      { id: 'cat-6', slug: 'deporte', name: 'Deporte', type: TransactionType.EXPENSE },
      { id: 'cat-7', slug: 'ocio', name: 'Ocio', type: TransactionType.EXPENSE },
      { id: 'cat-8', slug: 'compras', name: 'Compras', type: TransactionType.EXPENSE },
      { id: 'cat-9', slug: 'educacion', name: 'Educación', type: TransactionType.EXPENSE },
      { id: 'cat-10', slug: 'ropa', name: 'Ropa', type: TransactionType.EXPENSE },
      { id: 'cat-11', slug: 'viajes', name: 'Viajes', type: TransactionType.EXPENSE },
      { id: 'cat-12', slug: 'regalos', name: 'Regalos', type: TransactionType.EXPENSE },
      { id: 'cat-13', slug: 'otros', name: 'Otros', type: TransactionType.EXPENSE },
      { id: 'cat-14', slug: 'nomina', name: 'Nómina', type: TransactionType.INCOME },
    ]

    it('returns only expense categories', () => {
      const result = getDefaultBudgetCategories('USER', allCategories)
      expect(result.every(c => c.categoryId.startsWith('cat-') && c.categoryId !== 'cat-14')).toBe(true)
      // Should not include income category
      expect(result.find(c => c.categoryId === 'cat-14')).toBeUndefined()
    })

    it('works for SHARED scope', () => {
      const result = getDefaultBudgetCategories('SHARED', allCategories)
      expect(result.length).toBeGreaterThan(0)
    })

    it('maps known slugs to default limits', () => {
      const result = getDefaultBudgetCategories('USER', allCategories)
      const vivienda = result.find(c => c.categoryId === 'cat-1')
      expect(vivienda?.limitAmount).toBe(900)

      const alimentacion = result.find(c => c.categoryId === 'cat-3')
      expect(alimentacion?.limitAmount).toBe(250)

      const viajes = result.find(c => c.categoryId === 'cat-11')
      expect(viajes?.limitAmount).toBe(150)
    })

    it('filters out categories not in defaultLimits', () => {
      // The function filters by "slug in defaultLimits", so unknown slugs are excluded
      const unknownCategories = [
        { id: 'cat-x', slug: 'unknown_category', name: 'Unknown', type: TransactionType.EXPENSE },
      ]
      const result = getDefaultBudgetCategories('USER', unknownCategories)
      expect(result).toHaveLength(0)
    })

    it('returns empty array when no expense categories', () => {
      const incomeOnly = [{ id: 'cat-1', slug: 'nomina', name: 'Nómina', type: TransactionType.INCOME }]
      const result = getDefaultBudgetCategories('USER', incomeOnly)
      expect(result).toEqual([])
    })

    it('filters out categories not in defaultLimits but includes them with fallback', () => {
      // The function filters by "slug in defaultLimits"
      const categories = [
        { id: 'cat-1', slug: 'vivienda', name: 'Vivienda', type: TransactionType.EXPENSE },
        { id: 'cat-2', slug: 'nuevo_gasto', name: 'Nuevo Gasto', type: TransactionType.EXPENSE },
      ]
      const result = getDefaultBudgetCategories('USER', categories)
      // Only 'vivienda' is in defaultLimits
      expect(result).toHaveLength(1)
      expect(result[0].categoryId).toBe('cat-1')
    })
  })

  // ============================================================
  // Type exports verification
  // ============================================================
  describe('Type exports', () => {
    it('BudgetAlertLevel enum has correct values', () => {
      expect(BudgetAlertLevel.OK).toBe('OK')
      expect(BudgetAlertLevel.WARNING).toBe('WARNING')
      expect(BudgetAlertLevel.CRITICAL).toBe('CRITICAL')
    })

    it('BudgetResponse type works', () => {
      const budget: BudgetResponse = {
        id: 'b1',
        householdId: 'hh1',
        month: '2024-01',
        scope: BudgetScope.USER,
        ownerUserId: 'u1',
        categories: [],
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      expect(budget.month).toBe('2024-01')
    })

    it('BudgetWithSpending type works', () => {
      const budget: BudgetWithSpending = {
        id: 'b1',
        householdId: 'hh1',
        month: '2024-01',
        scope: BudgetScope.USER,
        ownerUserId: 'u1',
        categories: [{ categoryId: 'c1', limitAmount: 100, category: {} as any, spent: 50, remaining: 50, percentUsed: 50 }],
        totalBudget: 100,
        totalSpent: 50,
        totalRemaining: 50,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }
      expect(budget.categories[0].percentUsed).toBe(50)
    })

    it('BudgetSummary type works', () => {
      const summary: BudgetSummary = {
        month: '2024-01',
        scope: BudgetScope.USER,
        ownerUserId: 'u1',
        totalBudget: 1000,
        totalSpent: 500,
        totalRemaining: 500,
        categoriesOverBudget: 0,
        categoriesNearLimit: 1,
      }
      expect(summary.categoriesNearLimit).toBe(1)
    })
  })
})