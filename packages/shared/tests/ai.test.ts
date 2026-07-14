import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  defaultAiSettings,
  validateAiSettings,
  buildModelsArray,
  buildInsightsSystemPrompt,
  buildInsightsUserPrompt,
  anonymizeTransactions,
  type OpenRouterMessage,
  type CallOpenRouterInput,
  type AiSettings,
} from '../src/ai.js'
import { TransactionType, DataCollection } from '../src/enums.js'

describe('ai.ts — AI utilities', () => {
  // ============================================================
  // defaultAiSettings
  // ============================================================
  describe('defaultAiSettings', () => {
    it('returns defaults when no config provided', () => {
      const settings = defaultAiSettings()
      expect(settings.defaultModel).toBe('openai/gpt-5-mini')
      expect(settings.fallbackModels).toEqual([])
      expect(settings.enforceZdr).toBe(true)
      expect(settings.dataCollection).toBe(DataCollection.DENY)
    })

    it('uses provided default model', () => {
      const settings = defaultAiSettings({ OPENROUTER_DEFAULT_MODEL: 'custom/model' })
      expect(settings.defaultModel).toBe('custom/model')
    })

    it('uses provided fallback models', () => {
      const settings = defaultAiSettings({ OPENROUTER_FALLBACK_MODELS: ['model1', 'model2'] })
      expect(settings.fallbackModels).toEqual(['model1', 'model2'])
    })

    it('uses provided ZDR setting', () => {
      const settings = defaultAiSettings({ OPENROUTER_ZDR: false })
      expect(settings.enforceZdr).toBe(false)
    })
  })

  // ============================================================
  // buildModelsArray
  // ============================================================
  describe('buildModelsArray', () => {
    it('returns array with default model and fallbacks', () => {
      const settings: AiSettings = {
        defaultModel: 'primary',
        fallbackModels: ['fallback1', 'fallback2'],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(buildModelsArray(settings)).toEqual(['primary', 'fallback1', 'fallback2'])
    })

    it('handles empty fallback models', () => {
      const settings: AiSettings = {
        defaultModel: 'primary',
        fallbackModels: [],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(buildModelsArray(settings)).toEqual(['primary'])
    })

    it('filters out falsy values', () => {
      const settings: AiSettings = {
        defaultModel: 'primary',
        fallbackModels: ['fallback1', '', null as any, 'fallback2'],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(buildModelsArray(settings)).toEqual(['primary', 'fallback1', 'fallback2'])
    })
  })

  // ============================================================
  // validateAiSettings
  // ============================================================
  describe('validateAiSettings', () => {
    it('merges input with defaults and validates', () => {
      const defaults: AiSettings = {
        defaultModel: 'default/model',
        fallbackModels: ['fallback'],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      const input = { defaultModel: 'custom/model' }
      const result = validateAiSettings(input, defaults)
      expect(result.defaultModel).toBe('custom/model')
      expect(result.fallbackModels).toEqual(['fallback'])
      expect(result.enforceZdr).toBe(true)
    })

    it('validates dataCollection enum', () => {
      const defaults: AiSettings = {
        defaultModel: 'model',
        fallbackModels: [],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      const result = validateAiSettings({ dataCollection: DataCollection.ALLOW }, defaults)
      expect(result.dataCollection).toBe(DataCollection.ALLOW)
    })

    it('throws on invalid dataCollection enum', () => {
      const defaults: AiSettings = {
        defaultModel: 'model',
        fallbackModels: [],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(() => validateAiSettings({ dataCollection: 'invalid' as any }, defaults)).toThrow()
    })

    it('requires defaultModel to be non-empty', () => {
      const defaults: AiSettings = {
        defaultModel: 'model',
        fallbackModels: [],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(() => validateAiSettings({ defaultModel: '' }, defaults)).toThrow()
    })

    it('throws on empty string in fallbackModels', () => {
      const defaults: AiSettings = {
        defaultModel: 'model',
        fallbackModels: [],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      }
      expect(() => validateAiSettings({ fallbackModels: ['valid', ''] }, defaults)).toThrow()
    })

    it('uses defaults for missing optional fields', () => {
      const defaults: AiSettings = {
        defaultModel: 'default/model',
        fallbackModels: ['fallback1'],
        enforceZdr: false,
        dataCollection: DataCollection.ALLOW,
      }
      // Provide empty input - should use all defaults
      const result = validateAiSettings({}, defaults)
      expect(result.defaultModel).toBe('default/model')
      expect(result.fallbackModels).toEqual(['fallback1'])
      expect(result.enforceZdr).toBe(false)
      expect(result.dataCollection).toBe(DataCollection.ALLOW)
    })
  })

  // ============================================================
  // buildInsightsSystemPrompt
  // ============================================================
  describe('buildInsightsSystemPrompt', () => {
    it('returns Spanish system prompt', () => {
      const prompt = buildInsightsSystemPrompt()
      expect(prompt).toContain('analista financiero')
      expect(prompt).toContain('español')
      expect(prompt).toContain('patrones de gasto')
      expect(prompt).toContain('oportunidades de ahorro')
      expect(prompt).toContain('alertas de presupuesto')
      expect(prompt).toContain('anomalías')
    })

    it('is a constant string', () => {
      expect(buildInsightsSystemPrompt()).toBe(buildInsightsSystemPrompt())
    })
  })

  // ============================================================
  // buildInsightsUserPrompt
  // ============================================================
  describe('buildInsightsUserPrompt', () => {
    it('returns JSON string of anonymized data', () => {
      const data = {
        locale: 'es-ES',
        currency: 'EUR',
        transactions: [],
        budgets: [],
        goals: [],
      }
      const prompt = buildInsightsUserPrompt(data)
      const parsed = JSON.parse(prompt)
      expect(parsed.locale).toBe('es-ES')
      expect(parsed.currency).toBe('EUR')
      expect(parsed.transactions).toEqual([])
      expect(parsed.budgets).toEqual([])
      expect(parsed.goals).toEqual([])
    })

    it('includes budgets when provided', () => {
      const data = {
        locale: 'es-ES',
        currency: 'EUR',
        transactions: [],
        budgets: [{ category: 'Alimentación', limit: 300, spent: 150 }],
        goals: [],
      }
      const prompt = buildInsightsUserPrompt(data)
      const parsed = JSON.parse(prompt)
      expect(parsed.budgets).toHaveLength(1)
      expect(parsed.budgets[0].category).toBe('Alimentación')
    })

    it('includes goals when provided', () => {
      const data = {
        locale: 'es-ES',
        currency: 'EUR',
        transactions: [],
        budgets: [],
        goals: [{ name: 'Ahorro vacaciones', target: 1000, current: 200 }],
      }
      const prompt = buildInsightsUserPrompt(data)
      const parsed = JSON.parse(prompt)
      expect(parsed.goals).toHaveLength(1)
      expect(parsed.goals[0].name).toBe('Ahorro vacaciones')
    })
  })

  // ============================================================
  // anonymizeTransactions
  // ============================================================
  describe('anonymizeTransactions', () => {
    const mockTransactions = [
      {
        id: 'tx1',
        date: '2024-01-15',
        amount: -50.25,
        type: TransactionType.EXPENSE,
        description: 'Compra en Supermercado X',
        category: { name: 'Alimentación' },
        merchant: { name: 'Supermercado X' },
      },
      {
        id: 'tx2',
        date: new Date('2024-01-20'),
        amount: 2000,
        type: TransactionType.INCOME,
        description: 'Nómina enero - usuario@email.com',
        category: { name: 'Nómina' },
        merchant: null,
      },
      {
        id: 'tx3',
        date: '2024-02-10',
        amount: -123.45,
        type: TransactionType.EXPENSE,
        description: 'Pago tarjeta 1234567890',
        category: null,
        merchant: { name: 'Banco Y' },
      },
    ]

    it('anonymizes transactions correctly', () => {
      const result = anonymizeTransactions(mockTransactions)

      expect(result).toHaveLength(3)

      // First transaction
      expect(result[0].id).toBe('tx_1')
      expect(result[0].month).toBe('2024-01')
      expect(result[0].amount).toBe(-50.25) // preserves sign
      expect(result[0].type).toBe(TransactionType.EXPENSE)
      expect(result[0].category).toBe('Alimentación')
      expect(result[0].merchantAlias).toBe('merchant_1')
      expect(result[0].descriptionHint).toBe('Compra en Supermercado X')

      // Second transaction (income)
      expect(result[1].id).toBe('tx_2')
      expect(result[1].month).toBe('2024-01')
      expect(result[1].amount).toBe(2000)
      expect(result[1].type).toBe(TransactionType.INCOME)
      expect(result[1].category).toBe('Nómina')
      expect(result[1].merchantAlias).toBeNull()
      expect(result[1].descriptionHint).toContain('[email]') // email redacted

      // Third transaction
      expect(result[2].id).toBe('tx_3')
      expect(result[2].month).toBe('2024-02')
      expect(result[2].amount).toBe(-123.45)
      expect(result[2].type).toBe(TransactionType.EXPENSE)
      expect(result[2].category).toBeNull()
      expect(result[2].merchantAlias).toBe('merchant_3')
      expect(result[2].descriptionHint).toContain('[number]') // number redacted
    })

    it('handles empty array', () => {
      expect(anonymizeTransactions([])).toEqual([])
    })

    it('redacts email addresses in description', () => {
      const tx = [{
        id: 'tx1',
        date: '2024-01-15',
        amount: -10,
        type: TransactionType.EXPENSE,
        description: 'Contact: test@example.com and admin@domain.org',
        category: null,
        merchant: null,
      }]
      const result = anonymizeTransactions(tx)
      expect(result[0].descriptionHint).toContain('[email]')
      expect(result[0].descriptionHint).not.toContain('test@example.com')
      expect(result[0].descriptionHint).not.toContain('admin@domain.org')
    })

    it('redacts long numbers in description', () => {
      const tx = [{
        id: 'tx1',
        date: '2024-01-15',
        amount: -10,
        type: TransactionType.EXPENSE,
        description: 'Ref: 1234567890 and 9876543210',
        category: null,
        merchant: null,
      }]
      const result = anonymizeTransactions(tx)
      expect(result[0].descriptionHint).toContain('[number]')
    })

    it('truncates description to 80 characters', () => {
      const longDesc = 'a'.repeat(100)
      const tx = [{
        id: 'tx1',
        date: '2024-01-15',
        amount: -10,
        type: TransactionType.EXPENSE,
        description: longDesc,
        category: null,
        merchant: null,
      }]
      const result = anonymizeTransactions(tx)
      expect(result[0].descriptionHint.length).toBe(80)
    })

    it('handles Date objects and string dates', () => {
      const tx1 = { id: 'tx1', date: new Date('2024-03-15'), amount: -10, type: TransactionType.EXPENSE, description: 'Test', category: null, merchant: null }
      const tx2 = { id: 'tx2', date: '2024-04-20', amount: -10, type: TransactionType.EXPENSE, description: 'Test', category: null, merchant: null }

      const r1 = anonymizeTransactions([tx1])
      const r2 = anonymizeTransactions([tx2])

      expect(r1[0].month).toBe('2024-03')
      expect(r2[0].month).toBe('2024-04')
    })

    it('uses sequential IDs starting from 1', () => {
      const txs = Array(5).fill(null).map((_, i) => ({
        id: `orig-${i}`,
        date: '2024-01-01',
        amount: -10,
        type: TransactionType.EXPENSE,
        description: 'Test',
        category: null,
        merchant: null,
      }))
      const result = anonymizeTransactions(txs)
      expect(result.map(r => r.id)).toEqual(['tx_1', 'tx_2', 'tx_3', 'tx_4', 'tx_5'])
    })

    it('handles missing category and merchant gracefully', () => {
      const tx = [{
        id: 'tx1',
        date: '2024-01-15',
        amount: -10,
        type: TransactionType.EXPENSE,
        description: 'Test',
        category: null,
        merchant: null,
      }]
      const result = anonymizeTransactions(tx)
      expect(result[0].category).toBeNull()
      expect(result[0].merchantAlias).toBeNull()
    })
  })

  // ============================================================
  // Type exports verification
  // ============================================================
  describe('Type exports', () => {
    it('OpenRouterMessage has correct shape', () => {
      const msg: OpenRouterMessage = { role: 'user', content: 'Hello' }
      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Hello')
    })

    it('CallOpenRouterInput has correct shape', () => {
      const input: CallOpenRouterInput = {
        messages: [{ role: 'user', content: 'Hello' }],
        settings: { defaultModel: 'model', fallbackModels: [], enforceZdr: true, dataCollection: DataCollection.DENY },
        responseSchema: { type: 'object' },
      }
      expect(input.messages).toHaveLength(1)
      expect(input.settings?.defaultModel).toBe('model')
    })

    it('AiSettings has correct shape', () => {
      const settings: AiSettings = {
        defaultModel: 'model',
        fallbackModels: ['fallback'],
        enforceZdr: true,
        dataCollection: DataCollection.ALLOW,
      }
      expect(settings.defaultModel).toBe('model')
      expect(settings.fallbackModels).toEqual(['fallback'])
      expect(settings.enforceZdr).toBe(true)
      expect(settings.dataCollection).toBe(DataCollection.ALLOW)
    })
  })
})