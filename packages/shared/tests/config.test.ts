import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  envSchema,
  parseFallbackModels,
  parseCorsOrigins,
  publicConfigSchema,
  adminSettingsSchema,
  DEFAULT_ADMIN_SETTINGS,
  type Config,
  type PublicConfig,
  type AdminSettings,
} from '../src/config.js'
import { DataCollection, BackupFrequency } from '../src/enums.js'

describe('config.ts — Configuration utilities', () => {
  // ============================================================
  // envSchema
  // ============================================================
  describe('envSchema', () => {
    const validEnv = {
      NODE_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      PORT: '3000',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      SESSION_COOKIE_NAME: 'session',
      SESSION_TTL_DAYS: '365',
      COOKIE_SECURE: 'false',
      CORS_ORIGIN: 'http://localhost:5175',
      BACKUP_DIR: './backups',
      BACKUP_RETENTION_WEEKS: '30',
      OPENROUTER_API_KEY: 'sk-test',
      OPENROUTER_DEFAULT_MODEL: 'openai/gpt-5-mini',
      OPENROUTER_FALLBACK_MODELS: 'model1,model2',
      OPENROUTER_ZDR: 'true',
      RATE_LIMIT_MAX: '1000',
      RATE_LIMIT_WINDOW_MS: '60000',
      RATE_LIMIT_ALLOWLIST: '1.2.3.4',
      RATE_LIMIT_BAN_DURATION_MS: '0',
      RATE_LIMIT_CACHE_SIZE: '5000',
    }

    it('parses valid environment', () => {
      const result = envSchema.parse(validEnv)
      expect(result.NODE_ENV).toBe('development')
      expect(result.APP_URL).toBe('http://localhost:3000')
      expect(result.PORT).toBe(3000)
      expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db')
    })

    it('applies defaults for optional fields', () => {
      const minimalEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      }
      const result = envSchema.parse(minimalEnv)
      expect(result.APP_URL).toBe('https://toppfinance')
      expect(result.PORT).toBe(3000)
      expect(result.SESSION_COOKIE_NAME).toBe('toppfinance_session')
      expect(result.SESSION_TTL_DAYS).toBe(365)
      expect(result.COOKIE_SECURE).toBe(true)
      expect(result.CORS_ORIGIN).toBe('http://localhost:5175')
      expect(result.BACKUP_DIR).toBe('./backups')
      expect(result.BACKUP_RETENTION_WEEKS).toBe(30)
      expect(result.OPENROUTER_DEFAULT_MODEL).toBe('openai/gpt-5-mini')
      expect(result.OPENROUTER_ZDR).toBe(true)
    })

    it('transforms COOKIE_SECURE string to boolean', () => {
      expect(envSchema.parse({ ...validEnv, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true)
      expect(envSchema.parse({ ...validEnv, COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false)
    })

    it('coerces numeric fields', () => {
      const result = envSchema.parse({
        ...validEnv,
        PORT: '4000',
        SESSION_TTL_DAYS: '7',
        BACKUP_RETENTION_WEEKS: '12',
        RATE_LIMIT_MAX: '500',
        RATE_LIMIT_WINDOW_MS: '30000',
        RATE_LIMIT_BAN_DURATION_MS: '3600000',
        RATE_LIMIT_CACHE_SIZE: '10000',
      })
      expect(result.PORT).toBe(4000)
      expect(result.SESSION_TTL_DAYS).toBe(7)
      expect(result.BACKUP_RETENTION_WEEKS).toBe(12)
      expect(result.RATE_LIMIT_MAX).toBe(500)
      expect(result.RATE_LIMIT_WINDOW_MS).toBe(30000)
      expect(result.RATE_LIMIT_BAN_DURATION_MS).toBe(3600000)
      expect(result.RATE_LIMIT_CACHE_SIZE).toBe(10000)
    })

    it('validates NODE_ENV enum', () => {
      expect(() => envSchema.parse({ ...validEnv, NODE_ENV: 'invalid' })).toThrow()
      expect(() => envSchema.parse({ ...validEnv, NODE_ENV: 'test' })).not.toThrow()
    })

    it('requires DATABASE_URL', () => {
      expect(() => envSchema.parse({ ...validEnv, DATABASE_URL: '' })).toThrow()
    })

    it('validates PORT is positive integer', () => {
      expect(() => envSchema.parse({ ...validEnv, PORT: '0' })).toThrow()
      expect(() => envSchema.parse({ ...validEnv, PORT: '-1' })).toThrow()
      expect(() => envSchema.parse({ ...validEnv, PORT: 'abc' })).toThrow()
    })

    it('validates SESSION_TTL_DAYS is positive integer', () => {
      expect(() => envSchema.parse({ ...validEnv, SESSION_TTL_DAYS: '0' })).toThrow()
    })

    it('validates BACKUP_RETENTION_WEEKS is positive integer', () => {
      expect(() => envSchema.parse({ ...validEnv, BACKUP_RETENTION_WEEKS: '0' })).toThrow()
    })

    it('makes OPENROUTER_API_KEY optional', () => {
      const { OPENROUTER_API_KEY, ...env } = validEnv
      const result = envSchema.parse(env)
      expect(result.OPENROUTER_API_KEY).toBeUndefined()
    })

    it('validates RATE_LIMIT_BAN_DURATION_MS is non-negative', () => {
      expect(() => envSchema.parse({ ...validEnv, RATE_LIMIT_BAN_DURATION_MS: '-1' })).toThrow()
      expect(() => envSchema.parse({ ...validEnv, RATE_LIMIT_BAN_DURATION_MS: '0' })).not.toThrow()
    })

    it('validates RATE_LIMIT_CACHE_SIZE is positive integer', () => {
      expect(() => envSchema.parse({ ...validEnv, RATE_LIMIT_CACHE_SIZE: '0' })).toThrow()
    })
  })

  // ============================================================
  // parseFallbackModels
  // ============================================================
  describe('parseFallbackModels', () => {
    it('parses comma-separated models', () => {
      expect(parseFallbackModels('model1,model2,model3')).toEqual(['model1', 'model2', 'model3'])
    })

    it('trims whitespace', () => {
      expect(parseFallbackModels(' model1 , model2 , model3 ')).toEqual(['model1', 'model2', 'model3'])
    })

    it('filters empty strings', () => {
      expect(parseFallbackModels('model1,,model2,')).toEqual(['model1', 'model2'])
      expect(parseFallbackModels('')).toEqual([])
      expect(parseFallbackModels('   ')).toEqual([])
    })

    it('handles single model', () => {
      expect(parseFallbackModels('single-model')).toEqual(['single-model'])
    })

    it('handles models with special characters', () => {
      expect(parseFallbackModels('openai/gpt-4,anthropic/claude-3')).toEqual(['openai/gpt-4', 'anthropic/claude-3'])
    })
  })

  // ============================================================
  // parseCorsOrigins
  // ============================================================
  describe('parseCorsOrigins', () => {
    it('parses comma-separated origins', () => {
      expect(parseCorsOrigins('http://localhost:5175,https://app.example.com')).toEqual([
        'http://localhost:5175',
        'https://app.example.com',
      ])
    })

    it('trims whitespace', () => {
      expect(parseCorsOrigins(' http://a.com , https://b.com ')).toEqual(['http://a.com', 'https://b.com'])
    })

    it('filters empty strings', () => {
      expect(parseCorsOrigins('http://a.com,,https://b.com,')).toEqual(['http://a.com', 'https://b.com'])
      expect(parseCorsOrigins('')).toEqual([])
      expect(parseCorsOrigins('   ')).toEqual([])
    })

    it('handles single origin', () => {
      expect(parseCorsOrigins('https://app.example.com')).toEqual(['https://app.example.com'])
    })
  })

  // ============================================================
  // publicConfigSchema
  // ============================================================
  describe('publicConfigSchema', () => {
    it('validates public config shape', () => {
      const config = {
        currency: 'EUR',
        locale: 'es-ES',
        sessionCookieName: 'session',
        appUrl: 'https://app.example.com',
      }
      const result = publicConfigSchema.parse(config)
      expect(result.currency).toBe('EUR')
      expect(result.locale).toBe('es-ES')
      expect(result.sessionCookieName).toBe('session')
      expect(result.appUrl).toBe('https://app.example.com')
    })

    it('requires currency to be 3 characters', () => {
      expect(() => publicConfigSchema.parse({ currency: 'EU', locale: 'es', sessionCookieName: 's', appUrl: 'x' })).toThrow()
      expect(() => publicConfigSchema.parse({ currency: 'EURO', locale: 'es', sessionCookieName: 's', appUrl: 'x' })).toThrow()
    })

    it('applies defaults', () => {
      const result = publicConfigSchema.parse({ sessionCookieName: 's', appUrl: 'x' })
      expect(result.currency).toBe('EUR')
      expect(result.locale).toBe('es-ES')
    })

    it('requires sessionCookieName and appUrl', () => {
      expect(() => publicConfigSchema.parse({ currency: 'EUR', locale: 'es' })).toThrow()
    })
  })

  // ============================================================
  // adminSettingsSchema
  // ============================================================
  describe('adminSettingsSchema', () => {
    const validSettings = {
      sharedSplit: { miguelPercent: 60, saraPercent: 40 },
      aiSettings: {
        defaultModel: 'openai/gpt-5-mini',
        fallbackModels: ['model2'],
        enforceZdr: true,
        dataCollection: DataCollection.DENY,
      },
      backupPolicy: {
        frequency: BackupFrequency.WEEKLY,
        retentionWeeks: 30,
        backupDir: './backups',
      },
    }

    it('validates correct settings', () => {
      const result = adminSettingsSchema.parse(validSettings)
      expect(result.sharedSplit.miguelPercent).toBe(60)
      expect(result.sharedSplit.saraPercent).toBe(40)
    })

    it('validates sharedSplit percentages are 0-100', () => {
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: -1, saraPercent: 101 } })).toThrow()
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: 101, saraPercent: -1 } })).toThrow()
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: 50, saraPercent: 50 } })).not.toThrow()
    })

    it('validates sharedSplit sums to 100% (within 0.01 tolerance)', () => {
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: 60, saraPercent: 30 } })).toThrow()
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: 33.33, saraPercent: 66.67 } })).not.toThrow()
      expect(() => adminSettingsSchema.parse({ ...validSettings, sharedSplit: { miguelPercent: 33.33, saraPercent: 66.66 } })).toThrow()
    })

    it('validates aiSettings fields', () => {
      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        aiSettings: { ...validSettings.aiSettings, defaultModel: '' },
      })).toThrow()

      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        aiSettings: { ...validSettings.aiSettings, fallbackModels: ['', 'valid'] },
      })).toThrow()
    })

    it('validates dataCollection enum', () => {
      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        aiSettings: { ...validSettings.aiSettings, dataCollection: 'invalid' as any },
      })).toThrow()

      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        aiSettings: { ...validSettings.aiSettings, dataCollection: DataCollection.ALLOW },
      })).not.toThrow()
    })

    it('validates backupPolicy frequency enum', () => {
      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, frequency: 'invalid' as any },
      })).toThrow()

      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, frequency: BackupFrequency.DAILY },
      })).not.toThrow()
    })

    it('validates backupPolicy retentionWeeks range', () => {
      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, retentionWeeks: 0 },
      })).toThrow()

      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, retentionWeeks: 261 },
      })).toThrow()

      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, retentionWeeks: 260 },
      })).not.toThrow()
    })

    it('requires backupDir', () => {
      expect(() => adminSettingsSchema.parse({
        ...validSettings,
        backupPolicy: { ...validSettings.backupPolicy, backupDir: '' },
      })).toThrow()
    })
  })

  // ============================================================
  // DEFAULT_ADMIN_SETTINGS
  // ============================================================
  describe('DEFAULT_ADMIN_SETTINGS', () => {
    it('has correct shared split', () => {
      expect(DEFAULT_ADMIN_SETTINGS.sharedSplit).toEqual({ miguelPercent: 50, saraPercent: 50 })
    })

    it('has correct AI settings', () => {
      expect(DEFAULT_ADMIN_SETTINGS.aiSettings.defaultModel).toBe('openai/gpt-5-mini')
      expect(DEFAULT_ADMIN_SETTINGS.aiSettings.fallbackModels).toEqual([])
      expect(DEFAULT_ADMIN_SETTINGS.aiSettings.enforceZdr).toBe(true)
      expect(DEFAULT_ADMIN_SETTINGS.aiSettings.dataCollection).toBe(DataCollection.DENY)
    })

    it('has correct backup policy', () => {
      expect(DEFAULT_ADMIN_SETTINGS.backupPolicy.frequency).toBe(BackupFrequency.WEEKLY)
      expect(DEFAULT_ADMIN_SETTINGS.backupPolicy.retentionWeeks).toBe(30)
      expect(DEFAULT_ADMIN_SETTINGS.backupPolicy.backupDir).toBe('./backups')
    })

    it('is valid according to adminSettingsSchema', () => {
      expect(() => adminSettingsSchema.parse(DEFAULT_ADMIN_SETTINGS)).not.toThrow()
    })
  })

  // ============================================================
  // Type exports verification
  // ============================================================
  describe('Type exports', () => {
    it('Config type works', () => {
      const config: Config = {
        NODE_ENV: 'development',
        APP_URL: 'http://localhost',
        PORT: 3000,
        DATABASE_URL: 'postgresql://x',
        SESSION_COOKIE_NAME: 's',
        SESSION_TTL_DAYS: 365,
        COOKIE_SECURE: false,
        CORS_ORIGIN: 'http://localhost',
        BACKUP_DIR: './backups',
        BACKUP_RETENTION_WEEKS: 30,
        OPENROUTER_API_KEY: undefined,
        OPENROUTER_DEFAULT_MODEL: 'model',
        OPENROUTER_FALLBACK_MODELS: '',
        OPENROUTER_ZDR: true,
        RATE_LIMIT_MAX: 1000,
        RATE_LIMIT_WINDOW_MS: 60000,
        RATE_LIMIT_ALLOWLIST: undefined,
        RATE_LIMIT_BAN_DURATION_MS: 0,
        RATE_LIMIT_CACHE_SIZE: 5000,
      }
      expect(config.PORT).toBe(3000)
    })

    it('PublicConfig type works', () => {
      const config: PublicConfig = {
        currency: 'EUR',
        locale: 'es-ES',
        sessionCookieName: 'session',
        appUrl: 'https://app.example.com',
      }
      expect(config.currency).toBe('EUR')
    })

    it('AdminSettings type works', () => {
      const settings: AdminSettings = {
        sharedSplit: { miguelPercent: 50, saraPercent: 50 },
        aiSettings: {
          defaultModel: 'model',
          fallbackModels: [],
          enforceZdr: true,
          dataCollection: DataCollection.DENY,
        },
        backupPolicy: {
          frequency: BackupFrequency.WEEKLY,
          retentionWeeks: 30,
          backupDir: './backups',
        },
      }
      expect(settings.backupPolicy.frequency).toBe(BackupFrequency.WEEKLY)
    })
  })
})