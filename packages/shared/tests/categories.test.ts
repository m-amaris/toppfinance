import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapApiCategory,
  localizeCategoryName,
  getCategoriesByType,
  getExpenseCategorySlugs,
  getIncomeCategorySlugs,
  getDefaultCategorySlug,
  getCategoryColor,
  getCategoryIcon,
  isValidCategoryForType,
  buildCategoryGroups,
  CATEGORIES_BY_TYPE,
  DEFAULT_CATEGORY_SLUG_BY_TYPE,
  isValidCategorySlug,
  getDefaultIconForType,
  getDefaultColorForType,
  getCategoryTypeBySlug,
  isIncomeCategory,
  isExpenseCategory,
  sortCategoriesForType,
  EXPENSE_CATEGORY_ORDER,
  INCOME_CATEGORY_ORDER,
} from '../src/categories.js'
import { TransactionType } from '../src/enums.js'

describe('categories.ts — Category utilities', () => {
  // ============================================================
  // mapApiCategory
  // ============================================================
  describe('mapApiCategory', () => {
    it('maps API category to CategoryGroup', () => {
      const apiCategory = {
        id: 'cat-1',
        slug: 'alimentacion',
        name: 'Alimentación',
        icon: 'ShoppingCart',
        color: '#437a22',
        type: TransactionType.EXPENSE,
      }
      const result = mapApiCategory(apiCategory)

      expect(result.id).toBe('alimentacion')
      expect(result.apiId).toBe('cat-1')
      expect(result.label).toBe('Alimentación')
      expect(result.icon).toBe('ShoppingCart')
      expect(result.color).toBe('#437a22')
      expect(result.type).toBe(TransactionType.EXPENSE)
    })

    it('localizes known category names', () => {
      const categories = [
        { id: '1', slug: 'alimentacion', name: 'Alimentacion', icon: '', color: '#fff', type: TransactionType.EXPENSE },
        { id: '2', slug: 'nomina', name: 'Nomina', icon: '', color: '#fff', type: TransactionType.INCOME },
        { id: '3', slug: 'educacion', name: 'Educacion', icon: '', color: '#fff', type: TransactionType.EXPENSE },
        { id: '4', slug: 'otros_ingreso', name: 'Otros ingresos', icon: '', color: '#fff', type: TransactionType.INCOME },
        { id: '5', slug: 'transferencia_interna', name: 'Transferencia interna', icon: '', color: '#fff', type: TransactionType.TRANSFER },
      ]

      expect(mapApiCategory(categories[0]).label).toBe('Alimentación')
      expect(mapApiCategory(categories[1]).label).toBe('Nómina')
      expect(mapApiCategory(categories[2]).label).toBe('Educación')
      expect(mapApiCategory(categories[3]).label).toBe('Otros')
      expect(mapApiCategory(categories[4]).label).toBe('Transferencia interna')
    })

    it('keeps unknown names as-is', () => {
      const cat = { id: '1', slug: 'custom', name: 'Custom Category', icon: 'X', color: '#000', type: TransactionType.EXPENSE }
      expect(mapApiCategory(cat).label).toBe('Custom Category')
    })
  })

  // ============================================================
  // localizeCategoryName
  // ============================================================
  describe('localizeCategoryName', () => {
    it('localizes known Spanish names with accents', () => {
      expect(localizeCategoryName('Alimentacion')).toBe('Alimentación')
      expect(localizeCategoryName('Nomina')).toBe('Nómina')
      expect(localizeCategoryName('Educacion')).toBe('Educación')
    })

    it('localizes income category names', () => {
      expect(localizeCategoryName('Otros ingresos')).toBe('Otros')
    })

    it('localizes transfer category', () => {
      expect(localizeCategoryName('Transferencia interna')).toBe('Transferencia interna')
    })

    it('returns original for unknown names', () => {
      expect(localizeCategoryName('Unknown')).toBe('Unknown')
      expect(localizeCategoryName('')).toBe('')
    })
  })

  // ============================================================
  // getCategoriesByType
  // ============================================================
  describe('getCategoriesByType', () => {
    it('returns expense categories', () => {
      const expenseCats = getCategoriesByType(TransactionType.EXPENSE)
      expect(expenseCats.length).toBeGreaterThan(0)
      expect(expenseCats.every(c => c.type === TransactionType.EXPENSE)).toBe(true)
    })

    it('returns income categories', () => {
      const incomeCats = getCategoriesByType(TransactionType.INCOME)
      expect(incomeCats.length).toBeGreaterThan(0)
      expect(incomeCats.every(c => c.type === TransactionType.INCOME)).toBe(true)
    })

    it('returns saving categories', () => {
      const savingCats = getCategoriesByType(TransactionType.SAVING)
      expect(savingCats.length).toBeGreaterThan(0)
      expect(savingCats.every(c => c.type === TransactionType.SAVING)).toBe(true)
    })

    it('returns transfer categories', () => {
      const transferCats = getCategoriesByType(TransactionType.TRANSFER)
      expect(transferCats.length).toBeGreaterThan(0)
      expect(transferCats.every(c => c.type === TransactionType.TRANSFER)).toBe(true)
    })

    it('returns adjustment categories', () => {
      const adjCats = getCategoriesByType(TransactionType.ADJUSTMENT)
      expect(adjCats.length).toBeGreaterThan(0)
      expect(adjCats.every(c => c.type === TransactionType.ADJUSTMENT)).toBe(true)
    })
  })

  // ============================================================
  // getExpenseCategorySlugs / getIncomeCategorySlugs
  // ============================================================
  describe('getExpenseCategorySlugs', () => {
    it('returns array of expense slugs', () => {
      const slugs = getExpenseCategorySlugs()
      expect(slugs).toContain('vivienda')
      expect(slugs).toContain('alimentacion')
      expect(slugs).toContain('otros')
      expect(slugs).not.toContain('nomina')
    })

    it('returns only expense type slugs', () => {
      const slugs = getExpenseCategorySlugs()
      expect(slugs.length).toBeGreaterThan(10)
    })
  })

  describe('getIncomeCategorySlugs', () => {
    it('returns array of income slugs', () => {
      const slugs = getIncomeCategorySlugs()
      expect(slugs).toContain('nomina')
      expect(slugs).toContain('freelance')
      expect(slugs).toContain('inversiones')
      expect(slugs).toContain('otros_ingreso')
      expect(slugs).not.toContain('vivienda')
    })
  })

  // ============================================================
  // getDefaultCategorySlug
  // ============================================================
  describe('getDefaultCategorySlug', () => {
    it('returns correct default for each transaction type', () => {
      expect(getDefaultCategorySlug(TransactionType.EXPENSE)).toBe('otros')
      expect(getDefaultCategorySlug(TransactionType.INCOME)).toBe('otros_ingreso')
      expect(getDefaultCategorySlug(TransactionType.SAVING)).toBe('ahorro')
      expect(getDefaultCategorySlug(TransactionType.TRANSFER)).toBe('transferencia_interna')
      expect(getDefaultCategorySlug(TransactionType.ADJUSTMENT)).toBe('ajuste_manual')
    })
  })

  // ============================================================
  // getCategoryColor / getCategoryIcon
  // ============================================================
  describe('getCategoryColor', () => {
    it('returns color for known slug', () => {
      expect(getCategoryColor('vivienda')).toBe('#01696f')
      expect(getCategoryColor('alimentacion')).toBe('#437a22')
      expect(getCategoryColor('nomina')).toBe('#01696f')
    })

    it('returns fallback color for unknown slug', () => {
      expect(getCategoryColor('unknown')).toBe('#7a7974')
      expect(getCategoryColor('')).toBe('#7a7974')
    })
  })

  describe('getCategoryIcon', () => {
    it('returns icon for known slug', () => {
      expect(getCategoryIcon('vivienda')).toBe('Home')
      expect(getCategoryIcon('alimentacion')).toBe('ShoppingCart')
      expect(getCategoryIcon('nomina')).toBe('Briefcase')
    })

    it('returns fallback icon for unknown slug', () => {
      expect(getCategoryIcon('unknown')).toBe('MoreHorizontal')
      expect(getCategoryIcon('')).toBe('MoreHorizontal')
    })
  })

  // ============================================================
  // isValidCategoryForType
  // ============================================================
  describe('isValidCategoryForType', () => {
    it('returns true for valid expense category', () => {
      expect(isValidCategoryForType('vivienda', TransactionType.EXPENSE)).toBe(true)
      expect(isValidCategoryForType('alimentacion', TransactionType.EXPENSE)).toBe(true)
      expect(isValidCategoryForType('otros', TransactionType.EXPENSE)).toBe(true)
    })

    it('returns true for valid income category', () => {
      expect(isValidCategoryForType('nomina', TransactionType.INCOME)).toBe(true)
      expect(isValidCategoryForType('freelance', TransactionType.INCOME)).toBe(true)
    })

    it('returns false for expense slug with income type', () => {
      expect(isValidCategoryForType('vivienda', TransactionType.INCOME)).toBe(false)
    })

    it('returns false for income slug with expense type', () => {
      expect(isValidCategoryForType('nomina', TransactionType.EXPENSE)).toBe(false)
    })

    it('returns false for unknown slug', () => {
      expect(isValidCategoryForType('unknown', TransactionType.EXPENSE)).toBe(false)
    })

    it('returns false for empty slug', () => {
      expect(isValidCategoryForType('', TransactionType.EXPENSE)).toBe(false)
    })
  })

  // ============================================================
  // buildCategoryGroups
  // ============================================================
  describe('buildCategoryGroups', () => {
    const mockCategoryGroups = [
      { id: 'cat-1', slug: 'vivienda', label: 'Vivienda', icon: 'Home', color: '#01696f', type: TransactionType.EXPENSE },
      { id: 'cat-2', slug: 'nomina', label: 'Nómina', icon: 'Briefcase', color: '#01696f', type: TransactionType.INCOME },
      { id: 'cat-3', slug: 'ahorro', label: 'Ahorro', icon: 'PiggyBank', color: '#01696f', type: TransactionType.SAVING },
      { id: 'cat-4', slug: 'transferencia_interna', label: 'Transferencia', icon: 'ArrowLeftRight', color: '#0f766e', type: TransactionType.TRANSFER },
      { id: 'cat-5', slug: 'ajuste_manual', label: 'Ajuste', icon: 'Scale', color: '#7a7974', type: TransactionType.ADJUSTMENT },
    ]

    it('groups categories by type', () => {
      const groups = buildCategoryGroups(mockCategoryGroups)

      expect(groups.gasto).toHaveLength(1)
      expect(groups.gasto[0].slug).toBe('vivienda')

      expect(groups.ingreso).toHaveLength(1)
      expect(groups.ingreso[0].slug).toBe('nomina')

      expect(groups.ahorro).toHaveLength(1)
      expect(groups.ahorro[0].slug).toBe('ahorro')

      expect(groups.transferencia).toHaveLength(1)
      expect(groups.transferencia[0].slug).toBe('transferencia_interna')

      expect(groups.ajuste).toHaveLength(1)
      expect(groups.ajuste[0].slug).toBe('ajuste_manual')
    })

    it('handles empty array', () => {
      const groups = buildCategoryGroups([])
      expect(groups.gasto).toEqual([])
      expect(groups.ingreso).toEqual([])
      expect(groups.ahorro).toEqual([])
      expect(groups.transferencia).toEqual([])
      expect(groups.ajuste).toEqual([])
    })
  })

  // ============================================================
  // CATEGORIES_BY_TYPE constant
  // ============================================================
  describe('CATEGORIES_BY_TYPE', () => {
    it('has all transaction types as keys', () => {
      expect(CATEGORIES_BY_TYPE[TransactionType.EXPENSE]).toBeDefined()
      expect(CATEGORIES_BY_TYPE[TransactionType.INCOME]).toBeDefined()
      expect(CATEGORIES_BY_TYPE[TransactionType.SAVING]).toBeDefined()
      expect(CATEGORIES_BY_TYPE[TransactionType.TRANSFER]).toBeDefined()
      expect(CATEGORIES_BY_TYPE[TransactionType.ADJUSTMENT]).toBeDefined()
    })

    it('populates from DEFAULT_CATEGORIES', () => {
      expect(CATEGORIES_BY_TYPE[TransactionType.EXPENSE].length).toBeGreaterThan(10)
      expect(CATEGORIES_BY_TYPE[TransactionType.INCOME].length).toBe(4)
      expect(CATEGORIES_BY_TYPE[TransactionType.SAVING].length).toBe(1)
      expect(CATEGORIES_BY_TYPE[TransactionType.TRANSFER].length).toBe(1)
      expect(CATEGORIES_BY_TYPE[TransactionType.ADJUSTMENT].length).toBe(1)
    })

    it('each entry has slug, name, icon, color', () => {
      const exp = CATEGORIES_BY_TYPE[TransactionType.EXPENSE][0]
      expect(exp).toHaveProperty('slug')
      expect(exp).toHaveProperty('name')
      expect(exp).toHaveProperty('icon')
      expect(exp).toHaveProperty('color')
    })
  })

  // ============================================================
  // DEFAULT_CATEGORY_SLUG_BY_TYPE
  // ============================================================
  describe('DEFAULT_CATEGORY_SLUG_BY_TYPE', () => {
    it('is alias for getDefaultCategorySlug', () => {
      expect(DEFAULT_CATEGORY_SLUG_BY_TYPE).toBe(getDefaultCategorySlug)
      expect(DEFAULT_CATEGORY_SLUG_BY_TYPE(TransactionType.EXPENSE)).toBe('otros')
    })
  })

  // ============================================================
  // isValidCategorySlug
  // ============================================================
  describe('isValidCategorySlug', () => {
    it('returns true for known slugs', () => {
      expect(isValidCategorySlug('vivienda')).toBe(true)
      expect(isValidCategorySlug('nomina')).toBe(true)
      expect(isValidCategorySlug('ahorro')).toBe(true)
    })

    it('returns false for unknown slugs', () => {
      expect(isValidCategorySlug('unknown')).toBe(false)
      expect(isValidCategorySlug('')).toBe(false)
    })
  })

  // ============================================================
  // getDefaultIconForType / getDefaultColorForType
  // ============================================================
  describe('getDefaultIconForType', () => {
    it('returns icon for default category of each type', () => {
      expect(getDefaultIconForType(TransactionType.EXPENSE)).toBe('MoreHorizontal') // 'otros' icon
      expect(getDefaultIconForType(TransactionType.INCOME)).toBe('Plus') // 'otros_ingreso' icon
      expect(getDefaultIconForType(TransactionType.SAVING)).toBe('PiggyBank')
      expect(getDefaultIconForType(TransactionType.TRANSFER)).toBe('ArrowLeftRight')
      expect(getDefaultIconForType(TransactionType.ADJUSTMENT)).toBe('Scale')
    })
  })

  describe('getDefaultColorForType', () => {
    it('returns color for default category of each type', () => {
      expect(getDefaultColorForType(TransactionType.EXPENSE)).toBe('#7a7974') // 'otros' color
      expect(getDefaultColorForType(TransactionType.INCOME)).toBe('#7a7974') // 'otros_ingreso' color
      expect(getDefaultColorForType(TransactionType.SAVING)).toBe('#01696f')
      expect(getDefaultColorForType(TransactionType.TRANSFER)).toBe('#0f766e')
      expect(getDefaultColorForType(TransactionType.ADJUSTMENT)).toBe('#7a7974')
    })
  })

  // ============================================================
  // getCategoryTypeBySlug
  // ============================================================
  describe('getCategoryTypeBySlug', () => {
    it('returns type for known slugs', () => {
      expect(getCategoryTypeBySlug('vivienda')).toBe(TransactionType.EXPENSE)
      expect(getCategoryTypeBySlug('nomina')).toBe(TransactionType.INCOME)
      expect(getCategoryTypeBySlug('ahorro')).toBe(TransactionType.SAVING)
      expect(getCategoryTypeBySlug('transferencia_interna')).toBe(TransactionType.TRANSFER)
      expect(getCategoryTypeBySlug('ajuste_manual')).toBe(TransactionType.ADJUSTMENT)
    })

    it('returns undefined for unknown slug', () => {
      expect(getCategoryTypeBySlug('unknown')).toBeUndefined()
      expect(getCategoryTypeBySlug('')).toBeUndefined()
    })
  })

  // ============================================================
  // isIncomeCategory / isExpenseCategory
  // ============================================================
  describe('isIncomeCategory', () => {
    it('returns true for income slugs', () => {
      expect(isIncomeCategory('nomina')).toBe(true)
      expect(isIncomeCategory('freelance')).toBe(true)
      expect(isIncomeCategory('inversiones')).toBe(true)
      expect(isIncomeCategory('otros_ingreso')).toBe(true)
    })

    it('returns false for expense slugs', () => {
      expect(isIncomeCategory('vivienda')).toBe(false)
      expect(isIncomeCategory('alimentacion')).toBe(false)
    })

    it('returns false for unknown slugs', () => {
      expect(isIncomeCategory('unknown')).toBe(false)
    })
  })

  describe('isExpenseCategory', () => {
    it('returns true for expense slugs', () => {
      expect(isExpenseCategory('vivienda')).toBe(true)
      expect(isExpenseCategory('alimentacion')).toBe(true)
      expect(isExpenseCategory('otros')).toBe(true)
    })

    it('returns false for income slugs', () => {
      expect(isExpenseCategory('nomina')).toBe(false)
    })

    it('returns false for unknown slugs', () => {
      expect(isExpenseCategory('unknown')).toBe(false)
    })
  })

  // ============================================================
  // sortCategoriesForType
  // ============================================================
  describe('sortCategoriesForType', () => {
    const categories = [
      { slug: 'otros', name: 'Otros' },
      { slug: 'vivienda', name: 'Vivienda' },
      { slug: 'alimentacion', name: 'Alimentación' },
      { slug: 'transporte', name: 'Transporte' },
      { slug: 'unknown', name: 'Unknown' },
    ]

    it('sorts by predefined order', () => {
      const sorted = sortCategoriesForType(categories, EXPENSE_CATEGORY_ORDER)
      expect(sorted.map(c => c.slug)).toEqual([
        'vivienda',
        'alimentacion',
        'transporte',
        'otros',
        'unknown', // unknown goes to end
      ])
    })

    it('puts unknown categories at the end', () => {
      const sorted = sortCategoriesForType(categories, EXPENSE_CATEGORY_ORDER)
      const unknownIndex = sorted.findIndex(c => c.slug === 'unknown')
      expect(unknownIndex).toBe(sorted.length - 1)
    })

    it('works with income order', () => {
      const incomeCats = [
        { slug: 'inversiones', name: 'Inversiones' },
        { slug: 'nomina', name: 'Nómina' },
        { slug: 'freelance', name: 'Freelance' },
      ]
      const sorted = sortCategoriesForType(incomeCats, INCOME_CATEGORY_ORDER)
      expect(sorted.map(c => c.slug)).toEqual(['nomina', 'freelance', 'inversiones'])
    })

    it('handles empty array', () => {
      expect(sortCategoriesForType([], EXPENSE_CATEGORY_ORDER)).toEqual([])
    })

    it('does not mutate original array', () => {
      const original = [...categories]
      sortCategoriesForType(categories, EXPENSE_CATEGORY_ORDER)
      expect(categories).toEqual(original)
    })
  })

  // ============================================================
  // EXPENSE_CATEGORY_ORDER / INCOME_CATEGORY_ORDER
  // ============================================================
  describe('Category orders', () => {
    it('EXPENSE_CATEGORY_ORDER has expected slugs', () => {
      expect(EXPENSE_CATEGORY_ORDER).toContain('vivienda')
      expect(EXPENSE_CATEGORY_ORDER).toContain('alimentacion')
      expect(EXPENSE_CATEGORY_ORDER).toContain('otros')
      expect(EXPENSE_CATEGORY_ORDER.length).toBe(13)
    })

    it('INCOME_CATEGORY_ORDER has expected slugs', () => {
      expect(INCOME_CATEGORY_ORDER).toContain('nomina')
      expect(INCOME_CATEGORY_ORDER).toContain('freelance')
      expect(INCOME_CATEGORY_ORDER).toContain('otros_ingreso')
      expect(INCOME_CATEGORY_ORDER.length).toBe(4)
    })
  })
})