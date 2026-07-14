import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  assertSplitTotal,
  normalizeSplits,
  equalSplits,
  findUser,
  parseBeneficiarySplits,
  defaultSplits,
  calculateSplitAmounts,
  validateSplitUsers,
  normalizeText,
  getSplitRequirement,
  makeSourceHash,
  type SplitUser,
  type SharedSplitConfig,
} from '../src/splits.js'
import { TransactionType, Visibility } from '../src/enums.js'

describe('splits.ts — Split utilities', () => {
  const mockUsers: SplitUser[] = [
    { id: 'user1', email: 'miguel@test.com', displayName: 'Miguel' },
    { id: 'user2', email: 'sara@test.com', displayName: 'Sara' },
    { id: 'user3', email: 'juan@test.com', displayName: 'Juan' },
  ]

  const sharedSplit: SharedSplitConfig = { miguelPercent: 60, saraPercent: 40 }

  // ============================================================
  // normalizeText
  // ============================================================
  describe('normalizeText', () => {
    it('trims whitespace', () => {
      expect(normalizeText('  hello  ')).toBe('hello')
    })

    it('lowercases', () => {
      expect(normalizeText('HELLO')).toBe('hello')
    })

    it('removes accents', () => {
      expect(normalizeText('café')).toBe('cafe')
      expect(normalizeText('niño')).toBe('nino')
      expect(normalizeText('MÁLAGA')).toBe('malaga')
    })

    it('handles empty string', () => {
      expect(normalizeText('')).toBe('')
    })
  })

  // ============================================================
  // assertSplitTotal
  // ============================================================
  describe('assertSplitTotal', () => {
    it('passes for exact 100%', () => {
      expect(() => assertSplitTotal([{ percent: 100 }])).not.toThrow()
      expect(() => assertSplitTotal([{ percent: 50 }, { percent: 50 }])).not.toThrow()
    })

    it('passes for within tolerance', () => {
      expect(() => assertSplitTotal([{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.34 }])).not.toThrow()
      expect(() => assertSplitTotal([{ percent: 33.3 }, { percent: 33.3 }, { percent: 33.4 }])).not.toThrow()
    })

    it('throws for sum < 99.99', () => {
      expect(() => assertSplitTotal([{ percent: 50 }, { percent: 49 }])).toThrow('El reparto debe sumar 100%')
    })

    it('throws for sum > 100.01', () => {
      expect(() => assertSplitTotal([{ percent: 60 }, { percent: 41 }])).toThrow('El reparto debe sumar 100%')
    })

    it('throws for empty array', () => {
      expect(() => assertSplitTotal([])).toThrow('El reparto debe sumar 100%')
    })
  })

  // ============================================================
  // normalizeSplits
  // ============================================================
  describe('normalizeSplits', () => {
    it('normalizes splits that sum close to 100%', () => {
      const splits = [{ userId: 'user1', percent: 50 }, { userId: 'user2', percent: 50 }]
      const result = normalizeSplits(splits)

      const total = result.reduce((sum, s) => sum + s.percent, 0)
      expect(total).toBe(100)
      expect(result[0].percent).toBe(50)
      expect(result[1].percent).toBe(50)
    })

    it('preserves userIds', () => {
      const splits = [{ userId: 'a', percent: 25 }, { userId: 'b', percent: 25 }, { userId: 'c', percent: 50 }]
      const result = normalizeSplits(splits)
      expect(result.map(s => s.userId)).toEqual(['a', 'b', 'c'])
    })

    it('throws for empty array', () => {
      expect(() => normalizeSplits([])).toThrow('Se requiere al menos un beneficiario')
    })

    it('throws for sum != 100', () => {
      expect(() => normalizeSplits([{ userId: 'a', percent: 30 }])).toThrow('El reparto debe sumar 100%')
      expect(() => normalizeSplits([{ userId: 'a', percent: 30 }, { userId: 'b', percent: 30 }])).toThrow('El reparto debe sumar 100%')
    })

    it('handles floating point precision', () => {
      const splits = [{ userId: 'a', percent: 33.33 }, { userId: 'b', percent: 33.33 }, { userId: 'c', percent: 33.34 }]
      const result = normalizeSplits(splits)
      expect(result[0].percent).toBe(33.33)
      expect(result[1].percent).toBe(33.33)
      expect(result[2].percent).toBe(33.34)
    })
  })

  // ============================================================
  // equalSplits
  // ============================================================
  describe('equalSplits', () => {
    it('returns empty array for no users', () => {
      expect(equalSplits([])).toEqual([])
    })

    it('splits equally for 2 users', () => {
      const result = equalSplits(mockUsers.slice(0, 2))
      expect(result).toHaveLength(2)
      expect(result[0].percent).toBe(50)
      expect(result[1].percent).toBe(50)
      expect(result[0].userId).toBe('user1')
      expect(result[1].userId).toBe('user2')
    })

    it('handles odd division by giving remainder to last user', () => {
      const result = equalSplits(mockUsers) // 3 users -> 33.33, 33.33, 33.34
      expect(result).toHaveLength(3)
      expect(result[0].percent).toBe(33.33)
      expect(result[1].percent).toBe(33.33)
      expect(result[2].percent).toBe(33.34)
    })

    it('sums to exactly 100', () => {
      const result = equalSplits(mockUsers)
      const total = result.reduce((sum, s) => sum + s.percent, 0)
      expect(total).toBe(100)
    })
  })

  // ============================================================
  // findUser
  // ============================================================
  describe('findUser', () => {
    it('finds by email (case-insensitive)', () => {
      const user = findUser(mockUsers, 'MIGUEL@TEST.COM')
      expect(user?.id).toBe('user1')
    })

    it('finds by displayName (case-insensitive)', () => {
      const user = findUser(mockUsers, 'sara')
      expect(user?.id).toBe('user2')
    })

    it('finds by displayName with accents', () => {
      const usersWithAccents: SplitUser[] = [
        { id: 'u1', email: 'a@b.com', displayName: 'Joaquín' },
      ]
      const user = findUser(usersWithAccents, 'joaquin')
      expect(user?.id).toBe('u1')
    })

    it('returns undefined for not found', () => {
      const user = findUser(mockUsers, 'nonexistent')
      expect(user).toBeUndefined()
    })

    it('handles empty input', () => {
      const user = findUser(mockUsers, '')
      expect(user).toBeUndefined()
    })
  })

  // ============================================================
  // parseBeneficiarySplits
  // ============================================================
  describe('parseBeneficiarySplits', () => {
    it('parses comma-separated format', () => {
      const result = parseBeneficiarySplits('miguel@test.com=60,sara@test.com=40', mockUsers)
      expect(result.splits).toEqual([
        { userId: 'user1', percent: 60 },
        { userId: 'user2', percent: 40 },
      ])
      expect(result.warnings).toHaveLength(0)
    })

    it('parses pipe-separated format', () => {
      const result = parseBeneficiarySplits('miguel@test.com=60|sara@test.com=40', mockUsers)
      expect(result.splits).toEqual([
        { userId: 'user1', percent: 60 },
        { userId: 'user2', percent: 40 },
      ])
    })

    it('finds user by displayName', () => {
      const result = parseBeneficiarySplits('Miguel=50,Sara=50', mockUsers)
      expect(result.splits).toEqual([
        { userId: 'user1', percent: 50 },
        { userId: 'user2', percent: 50 },
      ])
    })

    it('handles decimal percentages with comma (using pipe delimiter)', () => {
      const result = parseBeneficiarySplits('miguel@test.com=33,33|sara@test.com=66,67', mockUsers)
      expect(result.splits?.[0].percent).toBe(33.33)
      expect(result.splits?.[1].percent).toBe(66.67)
    })

    it('returns null splits for empty string', () => {
      const result = parseBeneficiarySplits('', mockUsers)
      expect(result.splits).toBeNull()
      expect(result.warnings).toHaveLength(0)
    })

    it('returns null splits for whitespace only', () => {
      const result = parseBeneficiarySplits('   ', mockUsers)
      expect(result.splits).toBeNull()
    })

    it('warns and returns null for unknown user', () => {
      const result = parseBeneficiarySplits('unknown@test.com=50,miguel@test.com=50', mockUsers)
      expect(result.splits).toBeNull()
      expect(result.warnings).toContain('No se ha podido leer el reparto; se usará el reparto por defecto.')
    })

    it('warns and returns null for invalid percent', () => {
      const result = parseBeneficiarySplits('miguel@test.com=abc,sara@test.com=50', mockUsers)
      expect(result.splits).toBeNull()
      expect(result.warnings).toContain('No se ha podido leer el reparto; se usará el reparto por defecto.')
    })

    it('warns and returns null when sum != 100', () => {
      const result = parseBeneficiarySplits('miguel@test.com=30,sara@test.com=30', mockUsers)
      expect(result.splits).toBeNull()
      expect(result.warnings).toContain('El reparto del CSV no suma 100%; se usará el reparto por defecto.')
    })

    it('ignores empty parts', () => {
      const result = parseBeneficiarySplits('miguel@test.com=50,,sara@test.com=50', mockUsers)
      expect(result.splits).toEqual([
        { userId: 'user1', percent: 50 },
        { userId: 'user2', percent: 50 },
      ])
    })

    it('trims whitespace around parts', () => {
      const result = parseBeneficiarySplits(' miguel@test.com = 50 , sara@test.com = 50 ', mockUsers)
      expect(result.splits).toEqual([
        { userId: 'user1', percent: 50 },
        { userId: 'user2', percent: 50 },
      ])
    })
  })

  // ============================================================
  // defaultSplits
  // ============================================================
  describe('defaultSplits', () => {
    it('returns 100% to actor for PRIVATE visibility', () => {
      const result = defaultSplits({
        visibility: Visibility.PRIVATE,
        users: mockUsers,
        actorUserId: 'user1',
        sharedSplit,
      })
      expect(result).toEqual([{ userId: 'user1', percent: 100 }])
    })

    it('returns 100% to actor when only one user for SHARED', () => {
      const result = defaultSplits({
        visibility: Visibility.SHARED,
        users: [mockUsers[0]],
        actorUserId: 'user1',
        sharedSplit,
      })
      expect(result).toEqual([{ userId: 'user1', percent: 100 }])
    })

    it('uses sharedSplit config when Miguel and Sara found', () => {
      const result = defaultSplits({
        visibility: Visibility.SHARED,
        users: mockUsers,
        actorUserId: 'user1',
        sharedSplit,
      })
      expect(result).toEqual([
        { userId: 'user1', percent: 60 }, // miguelPercent
        { userId: 'user2', percent: 40 }, // saraPercent
      ])
    })

    it('finds Miguel by displayName', () => {
      const users = [{ id: 'u1', email: 'a@b.com', displayName: 'Miguelito' }]
      const result = defaultSplits({
        visibility: Visibility.SHARED,
        users,
        actorUserId: 'u1',
        sharedSplit: { miguelPercent: 70, saraPercent: 30 },
      })
      expect(result).toEqual([{ userId: 'u1', percent: 100 }]) // Only Miguel, no Sara -> equalSplits
    })

    it('finds Sara by email', () => {
      const users = [
        { id: 'u1', email: 'miguel@test.com', displayName: 'User1' },
        { id: 'u2', email: 'sara@test.com', displayName: 'User2' },
      ]
      const result = defaultSplits({
        visibility: Visibility.SHARED,
        users,
        actorUserId: 'u1',
        sharedSplit: { miguelPercent: 70, saraPercent: 30 },
      })
      expect(result).toEqual([
        { userId: 'u1', percent: 70 },
        { userId: 'u2', percent: 30 },
      ])
    })

    it('falls back to equalSplits when Miguel/Sara not found', () => {
      const users = [
        { id: 'u1', email: 'a@b.com', displayName: 'Alice' },
        { id: 'u2', email: 'c@d.com', displayName: 'Bob' },
      ]
      const result = defaultSplits({
        visibility: Visibility.SHARED,
        users,
        actorUserId: 'u1',
        sharedSplit,
      })
      expect(result).toHaveLength(2)
      expect(result[0].percent).toBe(50)
      expect(result[1].percent).toBe(50)
    })
  })

  // ============================================================
  // calculateSplitAmounts
  // ============================================================
  describe('calculateSplitAmounts', () => {
    it('calculates amounts correctly', () => {
      const splits = [{ userId: 'user1', percent: 60 }, { userId: 'user2', percent: 40 }]
      const result = calculateSplitAmounts(1000, splits)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ userId: 'user1', percent: 60, amount: 600 })
      expect(result[1]).toEqual({ userId: 'user2', percent: 40, amount: 400 })
    })

    it('uses Banker rounding via toMoney', () => {
      const splits = [{ userId: 'user1', percent: 33.33 }, { userId: 'user2', percent: 33.33 }, { userId: 'user3', percent: 33.34 }]
      const result = calculateSplitAmounts(100, splits)

      const total = result.reduce((sum, r) => sum + r.amount, 0)
      expect(total).toBe(100)
    })

    it('handles zero amount', () => {
      const splits = [{ userId: 'user1', percent: 50 }, { userId: 'user2', percent: 50 }]
      const result = calculateSplitAmounts(0, splits)
      expect(result[0].amount).toBe(0)
      expect(result[1].amount).toBe(0)
    })
  })

  // ============================================================
  // validateSplitUsers
  // ============================================================
  describe('validateSplitUsers', () => {
    it('returns valid=true when all users exist', () => {
      const result = validateSplitUsers(
        [{ userId: 'user1' }, { userId: 'user2' }],
        mockUsers
      )
      expect(result.valid).toBe(true)
      expect(result.missingUserIds).toEqual([])
    })

    it('returns valid=false and missing IDs when user not found', () => {
      const result = validateSplitUsers(
        [{ userId: 'user1' }, { userId: 'nonexistent' }],
        mockUsers
      )
      expect(result.valid).toBe(false)
      expect(result.missingUserIds).toEqual(['nonexistent'])
    })

    it('returns all missing IDs', () => {
      const result = validateSplitUsers(
        [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }],
        mockUsers
      )
      expect(result.valid).toBe(false)
      expect(result.missingUserIds).toEqual(['a', 'b', 'c'])
    })

    it('handles empty splits', () => {
      const result = validateSplitUsers([], mockUsers)
      expect(result.valid).toBe(true)
      expect(result.missingUserIds).toEqual([])
    })

    it('handles empty users list', () => {
      const result = validateSplitUsers([{ userId: 'user1' }], [])
      expect(result.valid).toBe(false)
      expect(result.missingUserIds).toEqual(['user1'])
    })
  })

  // ============================================================
  // getSplitRequirement
  // ============================================================
  describe('getSplitRequirement', () => {
    it('returns "dual" for SAVING', () => {
      expect(getSplitRequirement(TransactionType.SAVING)).toBe('dual')
    })

    it('returns "dual" for TRANSFER', () => {
      expect(getSplitRequirement(TransactionType.TRANSFER)).toBe('dual')
    })

    it('returns "single" for EXPENSE', () => {
      expect(getSplitRequirement(TransactionType.EXPENSE)).toBe('single')
    })

    it('returns "single" for INCOME', () => {
      expect(getSplitRequirement(TransactionType.INCOME)).toBe('single')
    })

    it('returns "single" for ADJUSTMENT', () => {
      expect(getSplitRequirement(TransactionType.ADJUSTMENT)).toBe('single')
    })
  })

  // ============================================================
  // makeSourceHash
  // ============================================================
  describe('makeSourceHash', () => {
    const baseInput = {
      externalId: 'ext-123',
      draft: {
        type: TransactionType.EXPENSE,
        date: '2024-01-15',
        amount: 45.5,
        description: 'Supermercado',
        categoryId: 'cat1',
        sourceAccountId: 'acc1',
        destinationAccountId: null,
        merchantName: 'Mercadona',
      },
      categoryLabel: 'Alimentación',
      sourceAccountLabel: 'Cuenta Compartida',
      destinationAccountLabel: '',
    }

    it('generates deterministic SHA-256 hash from externalId', () => {
      const hash1 = makeSourceHash(baseInput)
      const hash2 = makeSourceHash(baseInput)
      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64)
    })

    it('uses draft fields when externalId is empty', () => {
      const inputNoExt = { ...baseInput, externalId: '' }
      const hash = makeSourceHash(inputNoExt)
      expect(hash).toHaveLength(64)
    })

    it('normalizes text in hash basis', () => {
      const input1 = { ...baseInput, externalId: '' }
      const input2 = {
        ...baseInput,
        externalId: '',
        draft: { ...baseInput.draft, description: 'SUPERMERCADO' },
        categoryLabel: 'alimentación',
        sourceAccountLabel: 'cuenta compartida',
      }
      const hash1 = makeSourceHash(input1)
      const hash2 = makeSourceHash(input2)
      expect(hash1).toBe(hash2)
    })

    it('includes merchant in hash', () => {
      const input1 = { ...baseInput, externalId: '', draft: { ...baseInput.draft, merchantName: 'Mercadona' } }
      const input2 = { ...baseInput, externalId: '', draft: { ...baseInput.draft, merchantName: 'Carrefour' } }
      expect(makeSourceHash(input1)).not.toBe(makeSourceHash(input2))
    })

    it('includes destination for transfers', () => {
      const input1 = { ...baseInput, externalId: '', draft: { ...baseInput.draft, destinationAccountId: 'acc2' }, destinationAccountLabel: 'Efectivo' }
      const input2 = { ...baseInput, externalId: '', draft: { ...baseInput.draft, destinationAccountId: 'acc3' }, destinationAccountLabel: 'Ahorros' }
      expect(makeSourceHash(input1)).not.toBe(makeSourceHash(input2))
    })
  })
})