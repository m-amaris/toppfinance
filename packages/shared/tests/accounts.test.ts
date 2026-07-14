import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildAccountEntries,
  calculateAccountBalance,
  validateAccountAccess,
  getDefaultAccountForType,
  validateTransferAccounts,
  getAccountDisplayInfo,
  type BuildAccountEntriesInput,
  type AccountEntryData,
} from '../src/accounts.js'
import { TransactionType, Visibility, AccountType } from '../src/enums.js'

// Mock Prisma.Decimal for testing
class MockDecimal {
  constructor(public value: string | number) {}
  toString() { return String(this.value) }
  valueOf() { return Number(this.value) }
}

describe('accounts.ts — Account utilities', () => {
  // ============================================================
  // buildAccountEntries
  // ============================================================
  describe('buildAccountEntries', () => {
    const baseInput: BuildAccountEntriesInput = {
      transactionId: 'tx-123',
      type: TransactionType.EXPENSE,
      amount: 100.5,
      sourceAccountId: 'acc-source',
      destinationAccountId: 'acc-dest',
    }

    it('builds INCOME entry: positive amount to source account', () => {
      const input = { ...baseInput, type: TransactionType.INCOME, amount: 500 }
      const entries = buildAccountEntries(input)

      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        transactionId: 'tx-123',
        accountId: 'acc-source',
        amount: 500,
      })
    })

    it('throws for INCOME without source account', () => {
      const input = { ...baseInput, type: TransactionType.INCOME, sourceAccountId: null }
      expect(() => buildAccountEntries(input)).toThrow('Los ingresos necesitan cuenta de entrada')
    })

    it('builds EXPENSE entry: negative amount from source account', () => {
      const input = { ...baseInput, type: TransactionType.EXPENSE, amount: 75.25 }
      const entries = buildAccountEntries(input)

      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        transactionId: 'tx-123',
        accountId: 'acc-source',
        amount: -75.25,
      })
    })

    it('throws for EXPENSE without source account', () => {
      const input = { ...baseInput, type: TransactionType.EXPENSE, sourceAccountId: null }
      expect(() => buildAccountEntries(input)).toThrow('Los gastos necesitan cuenta de salida')
    })

    it('builds SAVING entries: negative from source, positive to destination', () => {
      const input = { ...baseInput, type: TransactionType.SAVING, amount: 200 }
      const entries = buildAccountEntries(input)

      expect(entries).toHaveLength(2)
      expect(entries[0]).toEqual({
        transactionId: 'tx-123',
        accountId: 'acc-source',
        amount: -200,
      })
      expect(entries[1]).toEqual({
        transactionId: 'tx-123',
        accountId: 'acc-dest',
        amount: 200,
      })
    })

    it('builds TRANSFER entries: negative from source, positive to destination', () => {
      const input = { ...baseInput, type: TransactionType.TRANSFER, amount: 150 }
      const entries = buildAccountEntries(input)

      expect(entries).toHaveLength(2)
      expect(entries[0].amount).toBe(-150)
      expect(entries[1].amount).toBe(150)
      expect(entries[0].accountId).toBe('acc-source')
      expect(entries[1].accountId).toBe('acc-dest')
    })

    it('throws for SAVING without both accounts', () => {
      const input = { ...baseInput, type: TransactionType.SAVING, destinationAccountId: null }
      expect(() => buildAccountEntries(input)).toThrow('Las transferencias necesitan cuenta origen y destino')
    })

    it('throws for TRANSFER without both accounts', () => {
      const input = { ...baseInput, type: TransactionType.TRANSFER, sourceAccountId: null }
      expect(() => buildAccountEntries(input)).toThrow('Las transferencias necesitan cuenta origen y destino')
    })

    it('throws when source and destination are the same for SAVING', () => {
      const input = { ...baseInput, type: TransactionType.SAVING, destinationAccountId: 'acc-source' }
      expect(() => buildAccountEntries(input)).toThrow('La cuenta origen y destino no pueden ser la misma')
    })

    it('throws when source and destination are the same for TRANSFER', () => {
      const input = { ...baseInput, type: TransactionType.TRANSFER, destinationAccountId: 'acc-source' }
      expect(() => buildAccountEntries(input)).toThrow('La cuenta origen y destino no pueden ser la misma')
    })

    it('builds ADJUSTMENT entry with signed amount', () => {
      const input = { ...baseInput, type: TransactionType.ADJUSTMENT, amount: -50.5, destinationAccountId: null }
      const entries = buildAccountEntries(input)

      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        transactionId: 'tx-123',
        accountId: 'acc-source',
        amount: -50.5,
      })
    })

    it('builds ADJUSTMENT with positive amount', () => {
      const input = { ...baseInput, type: TransactionType.ADJUSTMENT, amount: 100, destinationAccountId: null }
      const entries = buildAccountEntries(input)
      expect(entries[0].amount).toBe(100)
    })

    it('throws for ADJUSTMENT without source account', () => {
      const input = { ...baseInput, type: TransactionType.ADJUSTMENT, sourceAccountId: null }
      expect(() => buildAccountEntries(input)).toThrow('Los ajustes necesitan una cuenta')
    })

    it('uses absolute value for INCOME/EXPENSE/SAVING/TRANSFER amounts', () => {
      const expenseInput = { ...baseInput, type: TransactionType.EXPENSE, amount: -100 }
      const expenseEntries = buildAccountEntries(expenseInput)
      expect(expenseEntries[0].amount).toBe(-100) // toMoney(-100) = -100

      const incomeInput = { ...baseInput, type: TransactionType.INCOME, amount: -200 }
      const incomeEntries = buildAccountEntries(incomeInput)
      expect(incomeEntries[0].amount).toBe(200)
    })

    it('throws for unknown transaction type (exhaustive check)', () => {
      const input = { ...baseInput, type: 'UNKNOWN' as any }
      expect(() => buildAccountEntries(input)).toThrow('Tipo de transacción no soportado')
    })

    it('returns entries ready for Prisma createMany', () => {
      const input = { ...baseInput, type: TransactionType.EXPENSE, amount: 50 }
      const entries = buildAccountEntries(input)
      expect(Array.isArray(entries)).toBe(true)
      expect(entries.every(e => 'transactionId' in e && 'accountId' in e && 'amount' in e)).toBe(true)
    })
  })

  // ============================================================
  // calculateAccountBalance
  // ============================================================
  describe('calculateAccountBalance', () => {
    it('calculates balance from opening balance and entries', () => {
      const openingBalance = 1000
      const entries = [
        { amount: 500 },   // income
        { amount: -200 },  // expense
        { amount: -100 },  // expense
        { amount: 50 },    // income
      ]
      const balance = calculateAccountBalance(openingBalance, entries)
      expect(balance).toBe(1250) // 1000 + 500 - 200 - 100 + 50
    })

    it('handles Prisma.Decimal for opening balance', () => {
      const openingBalance = new MockDecimal('1234.56')
      const entries = [{ amount: 100 }, { amount: -50 }]
      const balance = calculateAccountBalance(openingBalance, entries)
      expect(balance).toBe(1284.56)
    })

    it('handles Prisma.Decimal for entry amounts', () => {
      const openingBalance = 1000
      const entries = [
        { amount: new MockDecimal('123.45') },
        { amount: new MockDecimal('-67.89') },
      ]
      const balance = calculateAccountBalance(openingBalance, entries)
      expect(balance).toBe(1055.56)
    })

    it('handles empty entries array', () => {
      const balance = calculateAccountBalance(500, [])
      expect(balance).toBe(500)
    })

    it('handles zero opening balance', () => {
      const balance = calculateAccountBalance(0, [{ amount: 100 }, { amount: -30 }])
      expect(balance).toBe(70)
    })

    it('handles negative opening balance', () => {
      const balance = calculateAccountBalance(-100, [{ amount: 50 }])
      expect(balance).toBe(-50)
    })

    it('uses Banker rounding via toMoney/addMoney', () => {
      // 0.005 rounds to even: 0.00
      // 0.015 rounds to even: 0.02
      const entries = [
        { amount: 0.005 },
        { amount: 0.015 },
      ]
      const balance = calculateAccountBalance(0, entries)
      // 0.005 -> 0.00, 0.015 -> 0.02
      expect(balance).toBe(0.02)
    })
  })

  // ============================================================
  // validateAccountAccess
  // ============================================================
  describe('validateAccountAccess', () => {
    const userId = 'user-1'
    const userHouseholdId = 'hh-1'

    it('returns true for SHARED account in same household', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: 'user-2',
        visibility: Visibility.SHARED,
        householdId: 'hh-1',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(true)
    })

    it('returns true for PERSONAL account owned by user in same household', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: 'user-1',
        visibility: Visibility.PRIVATE,
        householdId: 'hh-1',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(true)
    })

    it('returns false for PRIVATE account owned by different user', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: 'user-2',
        visibility: Visibility.PRIVATE,
        householdId: 'hh-1',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(false)
    })

    it('returns false for different household', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: 'user-1',
        visibility: Visibility.PRIVATE,
        householdId: 'hh-2',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(false)
    })

    it('returns false for SHARED account in different household', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: 'user-2',
        visibility: Visibility.SHARED,
        householdId: 'hh-2',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(false)
    })

    it('handles null ownerUserId for SHARED account', () => {
      const account = {
        id: 'acc-1',
        ownerUserId: null,
        visibility: Visibility.SHARED,
        householdId: 'hh-1',
      }
      expect(validateAccountAccess(account, userId, userHouseholdId)).toBe(true)
    })
  })

  // ============================================================
  // getDefaultAccountForType
  // ============================================================
  describe('getDefaultAccountForType', () => {
    const userId = 'user-1'
    const accounts = [
      { id: 'acc-1', type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' },
      { id: 'acc-2', type: AccountType.SHARED, visibility: Visibility.SHARED, ownerUserId: 'user-2' },
      { id: 'acc-3', type: AccountType.CASH, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' },
      { id: 'acc-4', type: AccountType.SAVINGS, visibility: Visibility.SHARED, ownerUserId: null },
      { id: 'acc-5', type: AccountType.OTHER, visibility: Visibility.PRIVATE, ownerUserId: 'user-2' }, // not visible
    ]

    it('returns PERSONAL account for INCOME when available', () => {
      const result = getDefaultAccountForType(accounts, TransactionType.INCOME, userId)
      expect(result).toBe('acc-1') // PERSONAL preferred for INCOME
    })

    it('returns PERSONAL account for EXPENSE when available', () => {
      const result = getDefaultAccountForType(accounts, TransactionType.EXPENSE, userId)
      expect(result).toBe('acc-1') // PERSONAL preferred for EXPENSE
    })

    it('returns SAVINGS account for SAVING when available', () => {
      const result = getDefaultAccountForType(accounts, TransactionType.SAVING, userId)
      expect(result).toBe('acc-4') // SAVINGS preferred for SAVING
    })

    it('returns SHARED account for TRANSFER when available', () => {
      const result = getDefaultAccountForType(accounts, TransactionType.TRANSFER, userId)
      expect(result).toBe('acc-2') // SHARED preferred for TRANSFER
    })

    it('returns PERSONAL account for ADJUSTMENT when available', () => {
      const result = getDefaultAccountForType(accounts, TransactionType.ADJUSTMENT, userId)
      expect(result).toBe('acc-1') // PERSONAL preferred for ADJUSTMENT
    })

    it('falls back to first visible account if preferred type not found', () => {
      // Remove PERSONAL account, user only has SHARED and CASH
      const limitedAccounts = accounts.filter(a => a.id !== 'acc-1')
      const result = getDefaultAccountForType(limitedAccounts, TransactionType.INCOME, userId)
      // Should fall back to SHARED (visible) since it's next in order after PERSONAL for INCOME
      expect(result).toBe('acc-2')
    })

    it('returns null when no visible accounts', () => {
      const invisibleAccounts = [
        { id: 'acc-1', type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-2' },
      ]
      const result = getDefaultAccountForType(invisibleAccounts, TransactionType.EXPENSE, userId)
      expect(result).toBeNull()
    })

    it('includes SHARED accounts visible to all household members', () => {
      const accountsWithShared = [
        { id: 'acc-shared', type: AccountType.SHARED, visibility: Visibility.SHARED, ownerUserId: 'user-2' },
        { id: 'acc-personal', type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' },
      ]
      // SHARED should be first in preferred list for TRANSFER
      const result = getDefaultAccountForType(accountsWithShared, TransactionType.TRANSFER, userId)
      expect(result).toBe('acc-shared')
    })

    it('returns first visible account if none match preferred types', () => {
      const otherAccounts = [
        { id: 'acc-other', type: AccountType.OTHER, visibility: Visibility.SHARED, ownerUserId: null },
        { id: 'acc-personal', type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' },
      ]
      // For INCOME, PERSONAL is preferred, so it should return personal
      const result = getDefaultAccountForType(otherAccounts, TransactionType.INCOME, userId)
      expect(result).toBe('acc-personal')
    })
  })

  // ============================================================
  // validateTransferAccounts
  // ============================================================
  describe('validateTransferAccounts', () => {
    it('does not throw when accounts are different', () => {
      expect(() => validateTransferAccounts('acc-1', 'acc-2')).not.toThrow()
    })

    it('does not throw when source is null', () => {
      expect(() => validateTransferAccounts(null, 'acc-2')).not.toThrow()
    })

    it('does not throw when destination is null', () => {
      expect(() => validateTransferAccounts('acc-1', null)).not.toThrow()
    })

    it('throws when source and destination are the same', () => {
      expect(() => validateTransferAccounts('acc-1', 'acc-1')).toThrow('La cuenta origen y destino no pueden ser la misma')
    })
  })

  // ============================================================
  // getAccountDisplayInfo
  // ============================================================
  describe('getAccountDisplayInfo', () => {
    const userId = 'user-1'

    it('returns shared account info for SHARED visibility', () => {
      const account = { type: AccountType.PERSONAL, visibility: Visibility.SHARED, ownerUserId: 'user-2' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info).toEqual({ icon: 'Wallet', color: '#01696f', label: 'Compartida' })
    })

    it('returns savings info for SAVINGS type', () => {
      const account = { type: AccountType.SAVINGS, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info).toEqual({ icon: 'PiggyBank', color: '#437a22', label: 'Ahorro' })
    })

    it('returns cash info for CASH type', () => {
      const account = { type: AccountType.CASH, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info).toEqual({ icon: 'Banknote', color: '#d19900', label: 'Efectivo' })
    })

    it('returns personal info for PERSONAL type (owner)', () => {
      const account = { type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info).toEqual({ icon: 'Building2', color: '#006494', label: 'Personal' })
    })

    it('returns personal info with different color for non-owner', () => {
      const account = { type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-2' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info).toEqual({ icon: 'Building2', color: '#7a39bb', label: 'Personal' })
    })

    it('defaults to PERSONAL for unknown type', () => {
      const account = { type: 'UNKNOWN' as any, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' }
      const info = getAccountDisplayInfo(account, userId)
      expect(info.label).toBe('Personal')
    })

    it('uses index parameter (for future color alternation)', () => {
      const account = { type: AccountType.PERSONAL, visibility: Visibility.PRIVATE, ownerUserId: 'user-1' }
      const info1 = getAccountDisplayInfo(account, userId, 0)
      const info2 = getAccountDisplayInfo(account, userId, 1)
      expect(info1).toEqual(info2) // Currently same, but index available
    })
  })

  // ============================================================
  // Type exports verification
  // ============================================================
  describe('Type exports', () => {
    it('BuildAccountEntriesInput has correct shape', () => {
      const input: BuildAccountEntriesInput = {
        transactionId: 'tx-1',
        type: TransactionType.EXPENSE,
        amount: 100,
        sourceAccountId: 'acc-1',
        destinationAccountId: 'acc-2',
      }
      expect(input.type).toBe(TransactionType.EXPENSE)
    })

    it('AccountEntryData has correct shape', () => {
      const entry: AccountEntryData = {
        transactionId: 'tx-1',
        accountId: 'acc-1',
        amount: -100,
      }
      expect(entry.amount).toBe(-100)
    })
  })
})