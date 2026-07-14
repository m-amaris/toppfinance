import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createChildLogger,
  sanitizeMetadata,
  LOG_LEVEL_ORDER,
  shouldLog,
  type AppLogEntry,
  type AuditLogEntry,
  type LogFilters,
  type Logger,
} from '../src/logging.js'
import { LogLevel, LogCategory } from '../src/enums.js'

describe('logging.ts — Logging utilities', () => {
  // Helper to create a mock logger
  function createMockLogger(): Logger {
    return {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn((bindings: Record<string, unknown>) => createMockLogger()),
    }
  }

  // ============================================================
  // createChildLogger
  // ============================================================
  describe('createChildLogger', () => {
    it('returns a child logger with bindings', () => {
      const mockLogger = createMockLogger()
      const child = createChildLogger(mockLogger, { requestId: 'req-123', userId: 'user-456' })
      expect(child).toBeDefined()
      expect(child.debug).toBeDefined()
      expect(child.info).toBeDefined()
      expect(child.warn).toBeDefined()
      expect(child.error).toBeDefined()
      expect(child.child).toBeDefined()
    })

    it('passes bindings to logger.child', () => {
      const mockLogger = createMockLogger()
      const bindings = { key: 'value' }
      createChildLogger(mockLogger, bindings)
      expect(mockLogger.child).toHaveBeenCalledWith(bindings)
    })

    it('works with empty bindings', () => {
      const mockLogger = createMockLogger()
      const child = createChildLogger(mockLogger, {})
      expect(child).toBeDefined()
      expect(mockLogger.child).toHaveBeenCalledWith({})
    })

    it('allows chaining child loggers', () => {
      const mockLogger = createMockLogger()
      const child1 = createChildLogger(mockLogger, { level1: 'a' })
      const child2 = createChildLogger(child1, { level2: 'b' })
      expect(child2).toBeDefined()
    })
  })

  // ============================================================
  // sanitizeMetadata
  // ============================================================
  describe('sanitizeMetadata', () => {
    it('returns empty object for empty input', () => {
      expect(sanitizeMetadata({})).toEqual({})
    })

    it('keeps non-sensitive keys unchanged', () => {
      const input = { userId: '123', action: 'login', timestamp: 123456 }
      expect(sanitizeMetadata(input)).toEqual(input)
    })

    it('redacts password field', () => {
      const input = { password: 'secret123', userId: '123' }
      const result = sanitizeMetadata(input)
      expect(result.password).toBe('[REDACTED]')
      expect(result.userId).toBe('123')
    })

    it('redacts token field', () => {
      const input = { token: 'abc123', data: 'test' }
      expect(sanitizeMetadata(input).token).toBe('[REDACTED]')
    })

    it('redacts secret field', () => {
      const input = { secret: 'my-secret', public: 'data' }
      expect(sanitizeMetadata(input).secret).toBe('[REDACTED]')
    })

    it('redacts key field', () => {
      const input = { key: 'api-key', value: 'test' }
      expect(sanitizeMetadata(input).key).toBe('[REDACTED]')
    })

    it('redacts authorization field', () => {
      const input = { authorization: 'Bearer token', other: 'data' }
      expect(sanitizeMetadata(input).authorization).toBe('[REDACTED]')
    })

    it('redacts cookie field', () => {
      const input = { cookie: 'session=abc', ip: '127.0.0.1' }
      expect(sanitizeMetadata(input).cookie).toBe('[REDACTED]')
    })

    it('redacts session field', () => {
      const input = { session: 'session-id', user: 'test' }
      expect(sanitizeMetadata(input).session).toBe('[REDACTED]')
    })

    it('redacts hash field', () => {
      const input = { hash: 'sha256...', algo: 'sha256' }
      expect(sanitizeMetadata(input).hash).toBe('[REDACTED]')
    })

    it('redacts apiKey field', () => {
      const input = { apiKey: 'sk-123', endpoint: '/api' }
      expect(sanitizeMetadata(input).apiKey).toBe('[REDACTED]')
    })

    it('redacts apikey field (case insensitive)', () => {
      const input = { apikey: 'key123', data: 'test' }
      expect(sanitizeMetadata(input).apikey).toBe('[REDACTED]')
    })

    it('handles case-insensitive key matching', () => {
      const input = { PASSWORD: 'secret', Token: 'abc', Secret: 'xyz' }
      const result = sanitizeMetadata(input)
      expect(result.PASSWORD).toBe('[REDACTED]')
      expect(result.Token).toBe('[REDACTED]')
      expect(result.Secret).toBe('[REDACTED]')
    })

    it('recursively sanitizes nested objects', () => {
      const input = {
        user: {
          password: 'secret',
          profile: {
            apiKey: 'key123',
            name: 'John',
          },
        },
        public: 'data',
      }
      const result = sanitizeMetadata(input)
      expect(result.user.password).toBe('[REDACTED]')
      expect(result.user.profile.apiKey).toBe('[REDACTED]')
      expect(result.user.profile.name).toBe('John')
      expect(result.public).toBe('data')
    })

    it('handles arrays in metadata', () => {
      const input = {
        items: [
          { password: 'secret1' },
          { token: 'secret2' },
          { name: 'public' },
        ],
      }
      const result = sanitizeMetadata(input)
      expect(result.items[0].password).toBe('[REDACTED]')
      expect(result.items[1].token).toBe('[REDACTED]')
      expect(result.items[2].name).toBe('public')
    })

    it('handles null values', () => {
      const input = { password: null, token: 'abc' }
      const result = sanitizeMetadata(input)
      expect(result.password).toBe('[REDACTED]')
      expect(result.token).toBe('[REDACTED]')
    })

    it('handles undefined values', () => {
      const input = { password: undefined, token: 'abc' }
      const result = sanitizeMetadata(input)
      expect(result.password).toBe('[REDACTED]')
      expect(result.token).toBe('[REDACTED]')
    })
  })

  // ============================================================
  // LOG_LEVEL_ORDER
  // ============================================================
  describe('LOG_LEVEL_ORDER', () => {
    it('has correct order values', () => {
      expect(LOG_LEVEL_ORDER.DEBUG).toBe(0)
      expect(LOG_LEVEL_ORDER.INFO).toBe(1)
      expect(LOG_LEVEL_ORDER.WARN).toBe(2)
      expect(LOG_LEVEL_ORDER.ERROR).toBe(3)
    })

    it('includes all LogLevel enum values', () => {
      const enumValues = Object.values(LogLevel).filter(v => typeof v === 'string')
      enumValues.forEach(level => {
        expect(LOG_LEVEL_ORDER[level as LogLevel]).toBeDefined()
      })
    })

    it('orders levels by severity', () => {
      expect(LOG_LEVEL_ORDER.DEBUG < LOG_LEVEL_ORDER.INFO).toBe(true)
      expect(LOG_LEVEL_ORDER.INFO < LOG_LEVEL_ORDER.WARN).toBe(true)
      expect(LOG_LEVEL_ORDER.WARN < LOG_LEVEL_ORDER.ERROR).toBe(true)
    })
  })

  // ============================================================
  // shouldLog
  // ============================================================
  describe('shouldLog', () => {
    it('returns true when level >= minLevel', () => {
      expect(shouldLog(LogLevel.INFO, LogLevel.DEBUG)).toBe(true)
      expect(shouldLog(LogLevel.WARN, LogLevel.INFO)).toBe(true)
      expect(shouldLog(LogLevel.ERROR, LogLevel.WARN)).toBe(true)
    })

    it('returns true when level equals minLevel', () => {
      expect(shouldLog(LogLevel.INFO, LogLevel.INFO)).toBe(true)
      expect(shouldLog(LogLevel.ERROR, LogLevel.ERROR)).toBe(true)
    })

    it('returns false when level < minLevel', () => {
      expect(shouldLog(LogLevel.DEBUG, LogLevel.INFO)).toBe(false)
      expect(shouldLog(LogLevel.INFO, LogLevel.WARN)).toBe(false)
      expect(shouldLog(LogLevel.WARN, LogLevel.ERROR)).toBe(false)
    })

    it('handles all level combinations', () => {
      const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
      levels.forEach(level => {
        levels.forEach(minLevel => {
          const expected = LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel]
          expect(shouldLog(level, minLevel)).toBe(expected)
        })
      })
    })
  })

  // ============================================================
  // Type definitions
  // ============================================================
  describe('Type definitions', () => {
    it('AppLogEntry has correct shape', () => {
      const entry: AppLogEntry = {
        id: 'log-1',
        householdId: 'hh1',
        level: LogLevel.INFO,
        category: LogCategory.APPLICATION,
        message: 'Test log',
        metadata: { key: 'value' },
        createdAt: new Date(),
      }
      expect(entry.id).toBe('log-1')
      expect(entry.householdId).toBe('hh1')
      expect(entry.level).toBe(LogLevel.INFO)
      expect(entry.category).toBe(LogCategory.APPLICATION)
      expect(entry.message).toBe('Test log')
      expect(entry.metadata).toEqual({ key: 'value' })
      expect(entry.createdAt).toBeInstanceOf(Date)
    })

    it('AppLogEntry allows null householdId', () => {
      const entry: AppLogEntry = {
        id: 'log-1',
        householdId: null,
        level: LogLevel.DEBUG,
        category: LogCategory.APPLICATION,
        message: 'Test',
        metadata: null,
        createdAt: new Date(),
      }
      expect(entry.householdId).toBeNull()
    })

    it('AuditLogEntry has correct shape', () => {
      const entry: AuditLogEntry = {
        id: 'audit-1',
        householdId: 'hh1',
        actorUserId: 'user1',
        entity: 'Transaction',
        entityId: 'tx-1',
        action: 'CREATE',
        metadata: { amount: 100 },
        createdAt: new Date(),
      }
      expect(entry.id).toBe('audit-1')
      expect(entry.entity).toBe('Transaction')
      expect(entry.action).toBe('CREATE')
    })

    it('AuditLogEntry allows null actorUserId and entityId', () => {
      const entry: AuditLogEntry = {
        id: 'audit-1',
        householdId: 'hh1',
        actorUserId: null,
        entity: 'System',
        entityId: null,
        action: 'STARTUP',
        metadata: null,
        createdAt: new Date(),
      }
      expect(entry.actorUserId).toBeNull()
      expect(entry.entityId).toBeNull()
    })

    it('LogFilters has correct shape', () => {
      const filters: LogFilters = {
        level: LogLevel.ERROR,
        category: LogCategory.AUDIT,
        householdId: 'hh1',
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
        limit: 100,
        offset: 0,
      }
      expect(filters.level).toBe(LogLevel.ERROR)
      expect(filters.category).toBe(LogCategory.AUDIT)
      expect(filters.householdId).toBe('hh1')
      expect(filters.fromDate).toBeInstanceOf(Date)
      expect(filters.toDate).toBeInstanceOf(Date)
      expect(filters.limit).toBe(100)
      expect(filters.offset).toBe(0)
    })

    it('LogFilters allows all optional fields', () => {
      const filters: LogFilters = {}
      expect(filters).toEqual({})
    })

    it('Logger interface has all required methods', () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(() => logger),
      }
      expect(typeof logger.debug).toBe('function')
      expect(typeof logger.info).toBe('function')
      expect(typeof logger.warn).toBe('function')
      expect(typeof logger.error).toBe('function')
      expect(typeof logger.child).toBe('function')
    })

    it('Logger.child returns Logger', () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn((bindings) => ({
          debug: vi.fn(),
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          child: vi.fn(),
        })),
      }
      const child = logger.child({ key: 'value' })
      expect(typeof child.debug).toBe('function')
      expect(typeof child.child).toBe('function')
    })
  })
})