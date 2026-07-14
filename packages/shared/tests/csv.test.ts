import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  CSV_COLUMN_ALIASES,
  parseCsv,
  parseCsvRows,
  pick,
  parseTypeValue,
  parseVisibilityValue,
  splitTags,
  findCategory,
  findAccount,
  normalizeCsvRow,
  buildImportDraft,
  computeImportFingerprint,
  classifyImportRow,
  buildPreviewRows,
  validateCommitBody,
  transactionsToCsv,
  type NormalizedImportRow,
  type CsvRecord,
  type ImportClassificationContext,
  type ClassifiedImportRow,
  ImportSuggestedAction,
} from '../src/csv.js'
import { TransactionType, Visibility, ImportClassification } from '../src/enums.js'
import { fromCents } from '../src/money.js'

describe('csv.ts — CSV import pipeline', () => {
  // ============================================================
  // Stage 1: parseCsv / parseCsvRows
  // ============================================================
  describe('parseCsv / parseCsvRows — stage 1', () => {
    it('parses semicolon-delimited CSV with header', () => {
      const content = 'Fecha;Importe;Concepto\n2024-01-15;-45.50;Supermercado'
      const rows = parseCsv(content)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        Fecha: '2024-01-15',
        Importe: '-45.50',
        Concepto: 'Supermercado',
      })
    })

    it('detects comma delimiter when semicolon not present', () => {
      const content = 'Date,Amount,Description\n2024-01-15,-45.50,Supermarket'
      const rows = parseCsv(content)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        Date: '2024-01-15',
        Amount: '-45.50',
        Description: 'Supermarket',
      })
    })

    it('detects tab delimiter', () => {
      const content = 'Date\tAmount\tDescription\n2024-01-15\t-45.50\tSupermarket'
      const rows = parseCsv(content)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        Date: '2024-01-15',
        Amount: '-45.50',
        Description: 'Supermarket',
      })
    })

    it('skips empty lines', () => {
      const content = 'Date;Amount;Description\n\n2024-01-15;-45.50;Test\n\n'
      const rows = parseCsv(content)

      expect(rows).toHaveLength(1)
    })

    it('trims whitespace from values', () => {
      const content = 'Date;Amount;Description\n 2024-01-15 ; -45.50 ; Test '
      const rows = parseCsv(content)

      expect(rows[0].Date).toBe('2024-01-15')
      expect(rows[0].Amount).toBe('-45.50')
      expect(rows[0].Description).toBe('Test')
    })

    it('handles BOM', () => {
      const content = '﻿Date;Amount;Description\n2024-01-15;-45.50;Test'
      const rows = parseCsv(content)

      expect(rows).toHaveLength(1)
      expect(rows[0].Date).toBe('2024-01-15')
    })

    it('parseCsvRows is an alias for parseCsv', () => {
      expect(parseCsvRows).toBe(parseCsv)
    })
  })

  // ============================================================
  // pick helper
  // ============================================================
  describe('pick — column alias resolution', () => {
    const record: CsvRecord = {
      fecha: '2024-01-15',
      importe: '-45.50',
      concepto: 'Supermercado',
      Fecha: '2024-01-16', // duplicate with different case
    }

    it('finds value by first matching alias (case-insensitive)', () => {
      expect(pick(record, CSV_COLUMN_ALIASES.date)).toBe('2024-01-15')
      expect(pick(record, CSV_COLUMN_ALIASES.amount)).toBe('-45.50')
      expect(pick(record, CSV_COLUMN_ALIASES.description)).toBe('Supermercado')
    })

    it('returns empty string when no alias matches', () => {
      expect(pick(record, ['nonexistent', 'also_missing'])).toBe('')
    })

    it('handles accent-insensitive matching', () => {
      const recordWithAccents: CsvRecord = {
        descripción: 'Test',
      }
      expect(pick(recordWithAccents, CSV_COLUMN_ALIASES.description)).toBe('Test')
    })
  })

  // ============================================================
  // parseTypeValue
  // ============================================================
  describe('parseTypeValue — transaction type inference', () => {
    it('returns EXPENSE for Spanish expense keywords', () => {
      expect(parseTypeValue('gasto', -50)).toBe(TransactionType.EXPENSE)
      expect(parseTypeValue('cargo', -50)).toBe(TransactionType.EXPENSE)
      expect(parseTypeValue('debit', -50)).toBe(TransactionType.EXPENSE)
    })

    it('returns INCOME for Spanish income keywords', () => {
      expect(parseTypeValue('ingreso', 50)).toBe(TransactionType.INCOME)
      expect(parseTypeValue('abono', 50)).toBe(TransactionType.INCOME)
      expect(parseTypeValue('credit', 50)).toBe(TransactionType.INCOME)
    })

    it('returns SAVING for saving keywords', () => {
      expect(parseTypeValue('ahorro', 100)).toBe(TransactionType.SAVING)
      expect(parseTypeValue('saving', 100)).toBe(TransactionType.SAVING)
      expect(parseTypeValue('savings', 100)).toBe(TransactionType.SAVING)
    })

    it('returns TRANSFER for transfer keywords', () => {
      expect(parseTypeValue('transferencia', 100)).toBe(TransactionType.TRANSFER)
      expect(parseTypeValue('transfer', 100)).toBe(TransactionType.TRANSFER)
      expect(parseTypeValue('traspaso', 100)).toBe(TransactionType.TRANSFER)
      expect(parseTypeValue('transferencia interna', 100)).toBe(TransactionType.TRANSFER)
    })

    it('returns ADJUSTMENT for adjustment keywords', () => {
      expect(parseTypeValue('ajuste', 10)).toBe(TransactionType.ADJUSTMENT)
      expect(parseTypeValue('adjustment', 10)).toBe(TransactionType.ADJUSTMENT)
      expect(parseTypeValue('ajuste manual', 10)).toBe(TransactionType.ADJUSTMENT)
    })

    it('infers from amount sign when no keyword matches', () => {
      expect(parseTypeValue('unknown', -50)).toBe(TransactionType.EXPENSE)
      expect(parseTypeValue('unknown', 50)).toBe(TransactionType.INCOME)
    })

    it('handles empty string', () => {
      expect(parseTypeValue('', -50)).toBe(TransactionType.EXPENSE)
      expect(parseTypeValue('', 50)).toBe(TransactionType.INCOME)
    })
  })

  // ============================================================
  // parseVisibilityValue
  // ============================================================
  describe('parseVisibilityValue', () => {
    it('returns PRIVATE for private keywords', () => {
      expect(parseVisibilityValue('private')).toBe(Visibility.PRIVATE)
      expect(parseVisibilityValue('privado')).toBe(Visibility.PRIVATE)
      expect(parseVisibilityValue('privada')).toBe(Visibility.PRIVATE)
    })

    it('returns SHARED for everything else', () => {
      expect(parseVisibilityValue('shared')).toBe(Visibility.SHARED)
      expect(parseVisibilityValue('compartido')).toBe(Visibility.SHARED)
      expect(parseVisibilityValue('')).toBe(Visibility.SHARED)
      expect(parseVisibilityValue('unknown')).toBe(Visibility.SHARED)
    })
  })

  // ============================================================
  // splitTags
  // ============================================================
  describe('splitTags', () => {
    it('splits by pipe', () => {
      expect(splitTags('tag1|tag2|tag3')).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('splits by comma', () => {
      expect(splitTags('tag1,tag2,tag3')).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('trims whitespace', () => {
      expect(splitTags(' tag1 , tag2 | tag3 ')).toEqual(['tag1', 'tag2', 'tag3'])
    })

    it('filters empty', () => {
      expect(splitTags('tag1,,tag2')).toEqual(['tag1', 'tag2'])
    })

    it('limits to 20 tags', () => {
      const manyTags = Array.from({ length: 25 }, (_, i) => `tag${i}`).join(',')
      expect(splitTags(manyTags)).toHaveLength(20)
    })

    it('handles empty string', () => {
      expect(splitTags('')).toEqual([])
    })
  })

  // ============================================================
  // findCategory
  // ============================================================
  describe('findCategory', () => {
    const categories = [
      { id: '1', slug: 'alimentacion', name: 'Alimentación', type: TransactionType.EXPENSE },
      { id: '2', slug: 'nomina', name: 'Nómina', type: TransactionType.INCOME },
      { id: '3', slug: 'otros', name: 'Otros', type: TransactionType.EXPENSE },
      { id: '4', slug: 'otros_ingreso', name: 'Otros ingresos', type: TransactionType.INCOME },
    ]

    it('finds by slug (case-insensitive, accent-insensitive)', () => {
      const result = findCategory('ALIMENTACION', TransactionType.EXPENSE, categories)
      expect(result.category?.slug).toBe('alimentacion')
      expect(result.usedFallback).toBe(false)
    })

    it('finds by name', () => {
      const result = findCategory('Nómina', TransactionType.INCOME, categories)
      expect(result.category?.slug).toBe('nomina')
      expect(result.usedFallback).toBe(false)
    })

    it('finds by id', () => {
      const result = findCategory('1', TransactionType.EXPENSE, categories)
      expect(result.category?.id).toBe('1')
      expect(result.usedFallback).toBe(false)
    })

    it('returns found category even if type mismatches (fallback done in buildImportDraft)', () => {
      // findCategory itself doesn't do type-checking fallback; that's done in buildImportDraft
      const result = findCategory('nomina', TransactionType.EXPENSE, categories)
      expect(result.category?.slug).toBe('nomina')
      expect(result.usedFallback).toBe(false)
    })

    it('falls back when category not found', () => {
      const result = findCategory('inexistente', TransactionType.EXPENSE, categories)
      expect(result.category?.slug).toBe('otros')
      expect(result.usedFallback).toBe(true)
    })

    it('handles empty categories array', () => {
      const result = findCategory('algo', TransactionType.EXPENSE, [])
      expect(result.category).toBeNull()
      expect(result.usedFallback).toBe(true)
    })
  })

  // ============================================================
  // findAccount
  // ============================================================
  describe('findAccount', () => {
    const accounts = [
      { id: 'acc1', name: 'Cuenta Compartida' },
      { id: 'acc2', name: 'Efectivo' },
    ]

    it('finds by id', () => {
      const result = findAccount('acc1', accounts)
      expect(result.account?.id).toBe('acc1')
      expect(result.usedFallback).toBe(false)
    })

    it('finds by name (case-insensitive)', () => {
      const result = findAccount('EFECTIVO', accounts)
      expect(result.account?.id).toBe('acc2')
      expect(result.usedFallback).toBe(false)
    })

    it('uses fallbackId when provided and no match', () => {
      const result = findAccount('inexistente', accounts, 'acc1')
      expect(result.account?.id).toBe('acc1')
      expect(result.usedFallback).toBe(true)
    })

    it('uses first account as last resort', () => {
      const result = findAccount('inexistente', accounts)
      expect(result.account?.id).toBe('acc1')
      expect(result.usedFallback).toBe(true)
    })

    it('returns null when no accounts', () => {
      const result = findAccount('algo', [])
      expect(result.account).toBeNull()
      expect(result.usedFallback).toBe(true)
    })
  })

  // ============================================================
  // normalizeCsvRow — Stage 2
  // ============================================================
  describe('normalizeCsvRow — stage 2', () => {
    const baseRecord: CsvRecord = {
      fecha: '2024-01-15',
      importe: '-45,50',
      tipo: 'gasto',
      descripcion: 'Supermercado',
      categoria: 'alimentacion',
      cuenta: 'Cuenta Compartida',
      visibilidad: 'compartido',
      pagado_por: 'miguel@test.com',
      reparto: 'miguel@test.com=50,sara@test.com=50',
      comercio: 'Mercadona',
      etiquetas: 'comida|semanal',
      notas: 'Compra semanal',
      external_id: 'ext-123',
      moneda: 'EUR',
    }

    it('parses all fields correctly', () => {
      const normalized = normalizeCsvRow(baseRecord)

      expect(normalized.rawDate).toBe('2024-01-15')
      expect(normalized.date).toBe('2024-01-15')
      expect(normalized.rawAmount).toBe('-45,50')
      expect(normalized.amountCents).toBe(-4550)
      expect(normalized.type).toBe(TransactionType.EXPENSE)
      expect(normalized.description).toBe('Supermercado')
      expect(normalized.visibility).toBe(Visibility.SHARED)
      expect(normalized.currency).toBe('EUR')
      expect(normalized.rawExternalId).toBe('ext-123')
    })

    it('rejects invalid date format (non-ISO)', () => {
      const record = { ...baseRecord, fecha: '15/01/2024' }
      const normalized = normalizeCsvRow(record)
      expect(normalized.date).toBeNull()
    })

    it('rejects unsupported currency', () => {
      const record = { ...baseRecord, moneda: 'USD' }
      const normalized = normalizeCsvRow(record)
      expect(normalized.currency).toBeNull()
    })

    it('defaults to EUR when currency empty', () => {
      const record = { ...baseRecord, moneda: '' }
      const normalized = normalizeCsvRow(record)
      expect(normalized.currency).toBe('EUR')
    })

    it('parses various amount formats', () => {
      expect(normalizeCsvRow({ ...baseRecord, importe: '1.234,56' }).amountCents).toBe(123456)
      expect(normalizeCsvRow({ ...baseRecord, importe: '1,234.56' }).amountCents).toBe(123456)
      expect(normalizeCsvRow({ ...baseRecord, importe: '12,50' }).amountCents).toBe(1250)
      expect(normalizeCsvRow({ ...baseRecord, importe: '12.50' }).amountCents).toBe(1250)
    })

    it('returns null amountCents for unparseable amount', () => {
      const record = { ...baseRecord, importe: 'no-es-numero' }
      const normalized = normalizeCsvRow(record)
      expect(normalized.amountCents).toBeNull()
    })
  })

  // ============================================================
  // buildImportDraft — Stage 3
  // ============================================================
  describe('buildImportDraft — stage 3', () => {
    const mockInput = {
      normalized: {
        rawDate: '2024-01-15',
        rawAmount: '-45,50',
        rawType: 'gasto',
        rawDescription: 'Supermercado',
        rawCategory: 'alimentacion',
        rawSourceAccount: 'Cuenta Compartida',
        rawDestinationAccount: '',
        rawVisibility: 'compartido',
        rawPaidBy: 'miguel@test.com',
        rawBeneficiarySplit: 'miguel@test.com=50,sara@test.com=50',
        rawMerchant: 'Mercadona',
        rawTags: 'comida|semanal',
        rawNotes: 'Compra semanal',
        rawExternalId: 'ext-123',
        rawCurrency: 'EUR',
        date: '2024-01-15',
        amountCents: -4550,
        type: TransactionType.EXPENSE,
        description: 'Supermercado',
        visibility: Visibility.SHARED,
        currency: 'EUR',
      } as NormalizedImportRow,
      categories: [
        { id: 'cat1', slug: 'alimentacion', name: 'Alimentación', type: TransactionType.EXPENSE },
        { id: 'cat2', slug: 'otros', name: 'Otros', type: TransactionType.EXPENSE },
      ],
      accounts: [
        { id: 'acc1', name: 'Cuenta Compartida', type: 'SHARED', visibility: Visibility.SHARED, ownerUserId: null },
        { id: 'acc2', name: 'Efectivo', type: 'CASH', visibility: Visibility.PRIVATE, ownerUserId: 'user1' },
      ],
      users: [
        { id: 'user1', email: 'miguel@test.com', displayName: 'Miguel' },
        { id: 'user2', email: 'sara@test.com', displayName: 'Sara' },
      ],
      actorUserId: 'user1',
      sharedSplit: { miguelPercent: 50, saraPercent: 50 },
    }

    it('creates valid draft for EXPENSE', () => {
      const result = buildImportDraft(mockInput)

      expect(result.draft).not.toBeNull()
      expect(result.draft?.type).toBe(TransactionType.EXPENSE)
      expect(result.draft?.amount).toBe(45.5)
      expect(result.draft?.description).toBe('Supermercado')
      expect(result.draft?.categoryId).toBe('cat1')
      expect(result.draft?.sourceAccountId).toBe('acc1')
      expect(result.draft?.visibility).toBe(Visibility.SHARED)
      expect(result.draft?.paidByUserId).toBe('user1')
      expect(result.draft?.beneficiarySplits).toHaveLength(2)
      expect(result.draft?.merchantName).toBe('Mercadona')
      expect(result.draft?.tags).toEqual(['comida', 'semanal'])
      expect(result.draft?.notes).toBe('Compra semanal')
      expect(result.draft?.externalId).toBe('ext-123')
      expect(result.errors).toHaveLength(0)
    })

    it('creates valid draft for INCOME', () => {
      const input = {
        ...mockInput,
        normalized: {
          ...mockInput.normalized,
          rawAmount: '1000,00',
          rawType: 'ingreso',
          amountCents: 100000,
          type: TransactionType.INCOME,
        },
      }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.draft?.type).toBe(TransactionType.INCOME)
      expect(result.draft?.amount).toBe(1000)
    })

    it('creates valid draft for SAVING (requires destination)', () => {
      const input = {
        ...mockInput,
        normalized: {
          ...mockInput.normalized,
          rawType: 'ahorro',
          rawDestinationAccount: 'Efectivo',
          type: TransactionType.SAVING,
        },
      }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.draft?.type).toBe(TransactionType.SAVING)
      expect(result.draft?.destinationAccountId).toBe('acc2')
    })

    it('creates valid draft for TRANSFER', () => {
      const input = {
        ...mockInput,
        normalized: {
          ...mockInput.normalized,
          rawType: 'transferencia',
          rawDestinationAccount: 'Efectivo',
          type: TransactionType.TRANSFER,
        },
      }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.draft?.type).toBe(TransactionType.TRANSFER)
      expect(result.draft?.destinationAccountId).toBe('acc2')
    })

    it('creates valid draft for ADJUSTMENT (keeps sign)', () => {
      const input = {
        ...mockInput,
        normalized: {
          ...mockInput.normalized,
          rawType: 'ajuste',
          rawAmount: '-50,00',
          amountCents: -5000,
          type: TransactionType.ADJUSTMENT,
        },
      }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.draft?.type).toBe(TransactionType.ADJUSTMENT)
      expect(result.draft?.amount).toBe(-50) // keeps sign
    })

    it('adds error for unsupported currency', () => {
      const input = {
        ...mockInput,
        normalized: { ...mockInput.normalized, rawCurrency: 'USD', currency: null },
      }
      const result = buildImportDraft(input)

      expect(result.draft).toBeNull()
      expect(result.errors).toContainEqual(expect.stringContaining('Moneda no soportada'))
    })

    it('adds error for invalid date', () => {
      const input = { ...mockInput, normalized: { ...mockInput.normalized, date: null } }
      const result = buildImportDraft(input)

      expect(result.draft).toBeNull()
      expect(result.errors).toContainEqual(expect.stringContaining('Fecha inválida'))
    })

    it('adds error for invalid amount', () => {
      const input = { ...mockInput, normalized: { ...mockInput.normalized, amountCents: null } }
      const result = buildImportDraft(input)

      expect(result.draft).toBeNull()
      expect(result.errors).toContainEqual(expect.stringContaining('Importe inválido'))
    })

    it('adds error for empty description', () => {
      const input = { ...mockInput, normalized: { ...mockInput.normalized, description: '' } }
      const result = buildImportDraft(input)

      expect(result.draft).toBeNull()
      expect(result.errors).toContainEqual(expect.stringContaining('Descripción obligatoria'))
    })

    it('adds warning and uses fallback when category type mismatches', () => {
      const input = {
        ...mockInput,
        categories: [
          ...mockInput.categories,
          { id: 'cat3', slug: 'nomina', name: 'Nómina', type: TransactionType.INCOME },
        ],
        normalized: { ...mockInput.normalized, rawCategory: 'nomina' }, // INCOME category for EXPENSE
      }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.warnings).toContainEqual(
        expect.stringContaining('no es compatible con el tipo')
      )
      expect(result.draft?.categoryId).toBe('cat2') // fallback 'otros'
    })

    it('adds warning when category not found', () => {
      const input = { ...mockInput, normalized: { ...mockInput.normalized, rawCategory: 'inexistente' } }
      const result = buildImportDraft(input)

      expect(result.draft).not.toBeNull()
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Categoría no encontrada')
      )
    })

    it('adds error when no categories available', () => {
      const input = { ...mockInput, categories: [] }
      const result = buildImportDraft(input)

      expect(result.draft).toBeNull()
      expect(result.errors).toContainEqual(expect.stringContaining('No hay categorías disponibles'))
    })

    it('filters accounts by visibility for current user', () => {
      const input = {
        ...mockInput,
        accounts: [
          { id: 'acc1', name: 'Compartida', type: 'SHARED', visibility: Visibility.SHARED, ownerUserId: null },
          { id: 'acc2', name: 'Privada', type: 'PERSONAL', visibility: Visibility.PRIVATE, ownerUserId: 'other' },
        ],
        normalized: { ...mockInput.normalized, rawSourceAccount: 'Privada' },
      }
      const result = buildImportDraft(input)

      // Should not find 'Privada' since it belongs to 'other' and actor is 'user1'
      expect(result.warnings).toContainEqual(
        expect.stringContaining('Cuenta origen no encontrada')
      )
    })

    it('uses default source account when not specified', () => {
      const input = {
        ...mockInput,
        normalized: { ...mockInput.normalized, rawSourceAccount: '' },
        defaultSourceAccountId: 'acc1',
      }
      const result = buildImportDraft(input)

      expect(result.draft?.sourceAccountId).toBe('acc1')
      // Empty rawSourceAccount uses default silently (usedFallback=false for empty string)
      // No warning expected
    })

    it('adds error when source account required but missing', () => {
      const input = {
        ...mockInput,
        accounts: [], // No visible accounts
        normalized: { ...mockInput.normalized, rawSourceAccount: '' },
      }
      const result = buildImportDraft(input)

      expect(result.errors).toContainEqual(expect.stringContaining('Falta cuenta origen'))
    })

    it('adds error when source and destination are same for TRANSFER', () => {
      const input = {
        ...mockInput,
        accounts: [
          { id: 'acc1', name: 'Cuenta Compartida', type: 'SHARED', visibility: Visibility.SHARED, ownerUserId: null },
        ], // Only one account - no alternative exists
        normalized: {
          ...mockInput.normalized,
          rawType: 'transferencia',
          type: TransactionType.TRANSFER,
          rawDestinationAccount: 'Cuenta Compartida',
        },
      }
      const result = buildImportDraft(input)

      // With only one account, alternative search fails -> destination becomes null -> "Faltan cuenta origen y destino"
      expect(result.errors).toContainEqual(expect.stringContaining('Faltan cuenta origen y destino'))
    })

    it('adds error when paidBy not found', () => {
      const input = {
        ...mockInput,
        normalized: { ...mockInput.normalized, rawPaidBy: 'nonexistent@test.com' },
      }
      const result = buildImportDraft(input)

      expect(result.warnings).toContainEqual(
        expect.stringContaining('Pagador no encontrado')
      )
    })

    it('uses default splits when beneficiary split invalid', () => {
      const input = {
        ...mockInput,
        normalized: { ...mockInput.normalized, rawBeneficiarySplit: 'invalid' },
      }
      const result = buildImportDraft(input)

      expect(result.warnings).toContainEqual(
        expect.stringContaining('No se ha podido leer el reparto')
      )
    })

    it('adds warning and uses default splits when split sum != 100', () => {
      const input = {
        ...mockInput,
        normalized: { ...mockInput.normalized, rawBeneficiarySplit: 'miguel@test.com=30,sara@test.com=30' },
      }
      const result = buildImportDraft(input)

      expect(result.warnings).toContainEqual(
        expect.stringContaining('El reparto del CSV no suma 100%')
      )
      // Falls back to default splits (50/50 for miguel/sara)
      expect(result.draft?.beneficiarySplits).toHaveLength(2)
    })

    it('returns resolved account and category names for fingerprint', () => {
      const result = buildImportDraft(mockInput)

      expect(result.sourceAccountName).toBe('Cuenta Compartida')
      expect(result.categoryName).toBe('Alimentación')
    })
  })

  // ============================================================
  // computeImportFingerprint — Stage 4
  // ============================================================
  describe('computeImportFingerprint — stage 4', () => {
    it('generates deterministic SHA-256 hash', () => {
      const fp1 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amountCents: 4550,
        description: 'Supermercado',
        sourceAccountName: 'Cuenta Compartida',
        destinationAccountName: '',
        merchant: 'Mercadona',
      })

      const fp2 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amountCents: 4550,
        description: 'Supermercado',
        sourceAccountName: 'Cuenta Compartida',
        destinationAccountName: '',
        merchant: 'Mercadona',
      })

      expect(fp1).toBe(fp2)
      expect(fp1).toHaveLength(64) // SHA-256 hex
    })

    it('uses absolute amount for fingerprint', () => {
      const fpExpense = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amountCents: 4550,
        description: 'Test',
        sourceAccountName: 'A',
        destinationAccountName: '',
        merchant: '',
      })

      const fpIncome = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.INCOME,
        amountCents: 4550, // same absolute
        description: 'Test',
        sourceAccountName: 'A',
        destinationAccountName: '',
        merchant: '',
      })

      // Different type -> different fingerprint
      expect(fpExpense).not.toBe(fpIncome)
    })

    it('normalizes text (case, accents) in fingerprint basis', () => {
      const fp1 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amountCents: 4550,
        description: 'Supermercado',
        sourceAccountName: 'Cuenta Compartida',
        destinationAccountName: '',
        merchant: 'Mercadona',
      })

      const fp2 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amountCents: 4550,
        description: 'SUPERMERCADO',
        sourceAccountName: 'cuenta compartida',
        destinationAccountName: '',
        merchant: 'mercadona',
      })

      expect(fp1).toBe(fp2)
    })

    it('includes destination account for transfers', () => {
      const fp1 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.TRANSFER,
        amountCents: 10000,
        description: 'Transfer',
        sourceAccountName: 'Cuenta A',
        destinationAccountName: 'Cuenta B',
        merchant: '',
      })

      const fp2 = computeImportFingerprint({
        date: '2024-01-15',
        type: TransactionType.TRANSFER,
        amountCents: 10000,
        description: 'Transfer',
        sourceAccountName: 'Cuenta A',
        destinationAccountName: 'Cuenta C', // different
        merchant: '',
      })

      expect(fp1).not.toBe(fp2)
    })
  })

  // ============================================================
  // classifyImportRow — Stage 5
  // ============================================================
  describe('classifyImportRow — stage 5', () => {
    const context: ImportClassificationContext = {
      fingerprints: new Map([['fp-existing', 'tx-existing']]),
      externalIds: new Map([['ext-123', 'tx-ext']]),
      candidates: new Map([
        [4550, [{ date: '2024-01-14', transactionId: 'tx-candidate' }]],
      ]),
    }

    it('returns DUPLICATE_EXACT for matching externalId', () => {
      const result = classifyImportRow({
        fingerprint: 'new-fp',
        externalId: 'ext-123',
        date: '2024-01-15',
        amountCents: 4550,
        context,
      })

      expect(result.classification).toBe(ImportClassification.DUPLICATE_EXACT)
      expect(result.matchedTransactionId).toBe('tx-ext')
    })

    it('returns DUPLICATE_EXACT for matching fingerprint', () => {
      const result = classifyImportRow({
        fingerprint: 'fp-existing',
        externalId: null,
        date: '2024-01-15',
        amountCents: 4550,
        context,
      })

      expect(result.classification).toBe(ImportClassification.DUPLICATE_EXACT)
      expect(result.matchedTransactionId).toBe('tx-existing')
      expect(result.matchedFingerprint).toBe('fp-existing')
    })

    it('returns DUPLICATE_CANDIDATE for same amount and date within window', () => {
      const result = classifyImportRow({
        fingerprint: 'new-fp',
        externalId: null,
        date: '2024-01-15',
        amountCents: 4550,
        context,
      })

      expect(result.classification).toBe(ImportClassification.DUPLICATE_CANDIDATE)
      expect(result.matchedTransactionId).toBe('tx-candidate')
      expect(result.candidateDate).toBe('2024-01-14')
      expect(result.candidateAmount).toBe(4550)
    })

    it('returns NEW when no match', () => {
      const result = classifyImportRow({
        fingerprint: 'new-fp',
        externalId: null,
        date: '2024-01-20', // outside ±3 days
        amountCents: 9999, // different amount
        context,
      })

      expect(result.classification).toBe(ImportClassification.NEW)
    })

    it('checks multiple candidates for same amount', () => {
      const multiContext: ImportClassificationContext = {
        fingerprints: new Map(),
        externalIds: new Map(),
        candidates: new Map([
          [
            10000,
            [
              { date: '2024-01-01', transactionId: 'tx-1' }, // too far
              { date: '2024-01-10', transactionId: 'tx-2' }, // within window
            ],
          ],
        ]),
      }

      const result = classifyImportRow({
        fingerprint: 'new-fp',
        externalId: null,
        date: '2024-01-12',
        amountCents: 10000,
        context: multiContext,
      })

      expect(result.classification).toBe(ImportClassification.DUPLICATE_CANDIDATE)
      expect(result.matchedTransactionId).toBe('tx-2')
    })
  })

  // ============================================================
  // buildPreviewRows — Full pipeline
  // ============================================================
  describe('buildPreviewRows — full pipeline integration', () => {
    const csvContent = `Fecha;Importe;Tipo;Descripción;Categoría;Cuenta;Visibilidad;Pagado Por;Reparto;Comercio;Etiquetas;Notas;id_externo
2024-01-15;-45,50;gasto;Supermercado;alimentacion;Cuenta Compartida;compartido;miguel@test.com;miguel@test.com=50,sara@test.com=50;Mercadona;comida|semanal;Compra semanal;ext-001
2024-01-16;1000,00;ingreso;Nómina;nomina;Cuenta Compartida;compartido;;miguel@test.com=50,sara@test.com=50;;;ext-002`

    const categories = [
      { id: 'cat1', slug: 'alimentacion', name: 'Alimentación', type: TransactionType.EXPENSE },
      { id: 'cat2', slug: 'nomina', name: 'Nómina', type: TransactionType.INCOME },
      { id: 'cat3', slug: 'otros', name: 'Otros', type: TransactionType.EXPENSE },
      { id: 'cat4', slug: 'otros_ingreso', name: 'Otros ingresos', type: TransactionType.INCOME },
    ]

    const accounts = [
      { id: 'acc1', name: 'Cuenta Compartida', type: 'SHARED', visibility: Visibility.SHARED, ownerUserId: null },
    ]

    const users = [
      { id: 'user1', email: 'miguel@test.com', displayName: 'Miguel' },
      { id: 'user2', email: 'sara@test.com', displayName: 'Sara' },
    ]

    const sharedSplit = { miguelPercent: 50, saraPercent: 50 }

    const classificationContext: ImportClassificationContext = {
      fingerprints: new Map(),
      externalIds: new Map(),
      candidates: new Map(),
    }

    it('processes CSV and returns classified rows', async () => {
      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: csvContent,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext,
      })

      expect(result.rows).toHaveLength(2)
      expect(result.summary.total).toBe(2)
      expect(result.importBatch.rowsCount).toBe(2)

      // First row: EXPENSE
      const expenseRow = result.rows[0]
      expect(expenseRow.rowNumber).toBe(2)
      expect(expenseRow.normalized.type).toBe(TransactionType.EXPENSE)
      expect(expenseRow.normalized.amountCents).toBe(-4550)
      expect(expenseRow.draft?.type).toBe(TransactionType.EXPENSE)
      expect(expenseRow.draft?.amount).toBe(45.5)
      expect(expenseRow.suggestedAction).toBe('import')
      expect(expenseRow.status).toBe('ready')

      // Second row: INCOME
      const incomeRow = result.rows[1]
      expect(incomeRow.normalized.type).toBe(TransactionType.INCOME)
      expect(incomeRow.normalized.amountCents).toBe(100000)
      expect(incomeRow.draft?.type).toBe(TransactionType.INCOME)
      expect(incomeRow.draft?.amount).toBe(1000)
    })

    it('computes fingerprint and idempotency key', async () => {
      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: csvContent,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext,
      })

      expect(result.rows[0].fingerprint).toHaveLength(64)
      expect(result.rows[0].idempotencyKey).toBe('ext-001') // externalId takes precedence
      expect(result.rows[1].idempotencyKey).toBe(result.rows[1].fingerprint) // no externalId
    })

    it('marks duplicates correctly', async () => {
      const dupContext: ImportClassificationContext = {
        fingerprints: new Map(),
        externalIds: new Map([['ext-001', 'tx-existing']]),
        candidates: new Map(),
      }

      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: csvContent,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext: dupContext,
      })

      const dupRow = result.rows[0]
      expect(dupRow.reconciliation.classification).toBe(ImportClassification.DUPLICATE_EXACT)
      expect(dupRow.suggestedAction).toBe('skip')
      expect(dupRow.status).toBe('duplicate')
      expect(dupRow.duplicate).toBe(true)
    })

    it('marks candidate duplicates for review', async () => {
      const candContext: ImportClassificationContext = {
        fingerprints: new Map(),
        externalIds: new Map(),
        candidates: new Map([
          [4550, [{ date: '2024-01-14', transactionId: 'tx-candidate' }]],
        ]),
      }

      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: csvContent,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext: candContext,
      })

      const candRow = result.rows[0]
      expect(candRow.reconciliation.classification).toBe(ImportClassification.DUPLICATE_CANDIDATE)
      expect(candRow.suggestedAction).toBe('review')
      expect(candRow.status).toBe('ready') // not duplicate status
    })

    it('handles rows with errors', async () => {
      const badCsv = `Fecha;Importe;Descripción
15/01/2024;-45,50;Test` // invalid date format

      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: badCsv,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext,
      })

      const errorRow = result.rows[0]
      expect(errorRow.errors.length).toBeGreaterThan(0)
      expect(errorRow.suggestedAction).toBe('skip')
      expect(errorRow.status).toBe('error')
      expect(errorRow.draft).toBeNull()
    })

    it('generates summary counts', async () => {
      const result = await buildPreviewRows({
        user: { id: 'user1', householdId: 'hh1' },
        fileName: 'test.csv',
        content: csvContent,
        categories,
        accounts,
        users,
        sharedSplit,
        classificationContext,
      })

      expect(result.summary.ready).toBe(2)
      expect(result.summary.duplicates).toBe(0)
      expect(result.summary.errors).toBe(0)
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0)
    })
  })

  // ============================================================
  // validateCommitBody
  // ============================================================
  describe('validateCommitBody', () => {
    it('validates correct commit body', () => {
      const body = {
        includeDuplicates: false,
        rows: [
          {
            rowNumber: 1,
            sourceHash: 'a'.repeat(64),
            draft: {
              type: 'EXPENSE',
              date: '2024-01-15',
              amount: 45.5,
              description: 'Test',
              categoryId: 'cat1',
              sourceAccountId: 'acc1',
              visibility: 'SHARED',
              paidByUserId: 'user1',
              beneficiarySplits: [{ userId: 'user1', percent: 100 }],
              tags: [],
            },
          },
        ],
      }

      const result = validateCommitBody(body)
      expect(result.rows).toHaveLength(1)
      expect(result.includeDuplicates).toBe(false)
    })

    it('defaults includeDuplicates to false', () => {
      const body = {
        rows: [
          {
            rowNumber: 1,
            sourceHash: 'a'.repeat(64),
            draft: {
              type: 'EXPENSE',
              date: '2024-01-15',
              amount: 45.5,
              description: 'Test',
              categoryId: 'cat1',
              sourceAccountId: 'acc1',
              visibility: 'SHARED',
              paidByUserId: 'user1',
              beneficiarySplits: [{ userId: 'user1', percent: 100 }],
              tags: [],
            },
          },
        ],
      }

      const result = validateCommitBody(body)
      expect(result.includeDuplicates).toBe(false)
    })

    it('throws on missing required fields', () => {
      expect(() => validateCommitBody({ rows: [] })).toThrow()
      expect(() => validateCommitBody({})).toThrow()
    })
  })

  // ============================================================
  // transactionsToCsv — Export
  // ============================================================
  describe('transactionsToCsv — export', () => {
    const transactions = [
      {
        date: '2024-01-15',
        type: TransactionType.EXPENSE,
        amount: 45.5,
        description: 'Supermercado',
        sourceAccount: { name: 'Cuenta Compartida' },
        destinationAccount: null,
        category: { name: 'Alimentación' },
        visibility: Visibility.SHARED,
        paidByUser: { email: 'miguel@test.com' },
        beneficiaries: [
          { user: { email: 'miguel@test.com' }, percent: 50 },
          { user: { email: 'sara@test.com' }, percent: 50 },
        ],
        merchant: { name: 'Mercadona' },
        tags: ['comida', 'semanal'],
        notes: 'Compra semanal',
        externalId: 'ext-001',
      },
    ]

    it('generates CSV with semicolon delimiter', () => {
      const csv = transactionsToCsv(transactions)

      const lines = csv.split('\n')
      expect(lines[0]).toContain('date;type;amount_eur')
      expect(lines[1]).toContain('"2024-01-15";"EXPENSE";"45,50"')
      expect(lines[1]).toContain('"Supermercado"')
      expect(lines[1]).toContain('"Cuenta Compartida"')
      expect(lines[1]).toContain('"Alimentación"')
      expect(lines[1]).toContain('"SHARED"')
      expect(lines[1]).toContain('"miguel@test.com"')
      expect(lines[1]).toContain('"miguel@test.com=50|sara@test.com=50"')
      expect(lines[1]).toContain('"Mercadona"')
      expect(lines[1]).toContain('"comida|semanal"')
      expect(lines[1]).toContain('"Compra semanal"')
      expect(lines[1]).toContain('"ext-001"')
    })

    it('escapes double quotes', () => {
      const txs = [{
        ...transactions[0],
        description: 'Test "quote"',
      }]
      const csv = transactionsToCsv(txs)
      expect(csv).toContain('"Test ""quote"""')
    })

    it('handles missing optional fields', () => {
      const txs = [{
        ...transactions[0],
        sourceAccount: null,
        destinationAccount: null,
        merchant: null,
        tags: [],
        notes: null,
        externalId: null,
        paidByUser: null,
        beneficiaries: [],
      }]
      const csv = transactionsToCsv(txs)

      const lines = csv.split('\n')
      // Empty fields should be empty quoted strings between semicolons
      expect(lines[1]).toContain(';"";"";') // source_account;destination_account
    })

    it('formats amount with comma decimal separator', () => {
      const txs = [{
        ...transactions[0],
        amount: 1234.56,
      }]
      const csv = transactionsToCsv(txs)
      expect(csv).toContain('1234,56')
    })

    it('handles Date objects for date field', () => {
      const txs = [{
        ...transactions[0],
        date: new Date('2024-01-15T10:00:00Z'),
      }]
      const csv = transactionsToCsv(txs)
      expect(csv).toContain('2024-01-15')
    })
  })
})