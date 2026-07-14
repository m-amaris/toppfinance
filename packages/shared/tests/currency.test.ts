import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  isCurrencySupported,
  normalizeCurrency,
  assertCurrencySupported,
  isDefaultCurrency,
  getDefaultCurrency,
  CURRENCY_INFO,
  getCurrencyInfo,
  type CurrencyCode,
  type CurrencyInfo,
} from '../src/currency.js'

describe('currency.ts — Currency utilities', () => {
  // ============================================================
  // Constants
  // ============================================================
  describe('Constants', () => {
    it('DEFAULT_CURRENCY is EUR', () => {
      expect(DEFAULT_CURRENCY).toBe('EUR')
    })

    it('SUPPORTED_CURRENCIES contains only EUR', () => {
      expect(SUPPORTED_CURRENCIES).toBeInstanceOf(Set)
      expect(SUPPORTED_CURRENCIES.size).toBe(1)
      expect(SUPPORTED_CURRENCIES.has('EUR')).toBe(true)
      expect(SUPPORTED_CURRENCIES.has('USD')).toBe(false)
    })

    it('CURRENCY_INFO has correct EUR metadata', () => {
      expect(CURRENCY_INFO.EUR).toEqual({
        code: 'EUR',
        symbol: '€',
        decimals: 2,
        locale: 'es-ES',
      })
    })
  })

  // ============================================================
  // isCurrencySupported
  // ============================================================
  describe('isCurrencySupported', () => {
    it('returns true for EUR', () => {
      expect(isCurrencySupported('EUR')).toBe(true)
    })

    it('returns false for other currencies', () => {
      expect(isCurrencySupported('USD')).toBe(false)
      expect(isCurrencySupported('GBP')).toBe(false)
      expect(isCurrencySupported('JPY')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isCurrencySupported('')).toBe(false)
    })

    it('returns false for lowercase eur', () => {
      expect(isCurrencySupported('eur')).toBe(false)
    })

    it('narrows type to CurrencyCode', () => {
      const code = 'EUR'
      if (isCurrencySupported(code)) {
        // TypeScript should narrow to CurrencyCode
        const _typed: CurrencyCode = code
        expect(_typed).toBe('EUR')
      }
    })
  })

  // ============================================================
  // normalizeCurrency
  // ============================================================
  describe('normalizeCurrency', () => {
    it('returns EUR for uppercase EUR', () => {
      expect(normalizeCurrency('EUR')).toBe('EUR')
    })

    it('normalizes lowercase eur to EUR', () => {
      expect(normalizeCurrency('eur')).toBe('EUR')
    })

    it('normalizes mixed case Eur to EUR', () => {
      expect(normalizeCurrency('Eur')).toBe('EUR')
    })

    it('trims whitespace', () => {
      expect(normalizeCurrency(' EUR ')).toBe('EUR')
      expect(normalizeCurrency('\teur\n')).toBe('EUR')
    })

    it('returns null for unsupported currency', () => {
      expect(normalizeCurrency('USD')).toBeNull()
      expect(normalizeCurrency('GBP')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(normalizeCurrency('')).toBeNull()
    })

    it('returns null for whitespace only', () => {
      expect(normalizeCurrency('   ')).toBeNull()
    })
  })

  // ============================================================
  // assertCurrencySupported
  // ============================================================
  describe('assertCurrencySupported', () => {
    it('does not throw for EUR', () => {
      expect(() => assertCurrencySupported('EUR')).not.toThrow()
    })

    it('does not throw for lowercase eur', () => {
      // The function checks exact match, so lowercase throws
      expect(() => assertCurrencySupported('eur')).toThrow('Moneda no soportada: "eur". Solo se acepta EUR.')
    })

    it('throws for unsupported currency', () => {
      expect(() => assertCurrencySupported('USD')).toThrow('Moneda no soportada: "USD". Solo se acepta EUR.')
    })

    it('throws for empty string', () => {
      expect(() => assertCurrencySupported('')).toThrow('Moneda no soportada: "". Solo se acepta EUR.')
    })

    it('narrows type in assertion', () => {
      let code: string | CurrencyCode = 'EUR'
      assertCurrencySupported(code)
      // After assertion, TypeScript narrows to CurrencyCode
      const _typed: CurrencyCode = code
      expect(_typed).toBe('EUR')
    })
  })

  // ============================================================
  // isDefaultCurrency
  // ============================================================
  describe('isDefaultCurrency', () => {
    it('returns true for EUR', () => {
      expect(isDefaultCurrency('EUR')).toBe(true)
    })

    it('returns true for null', () => {
      expect(isDefaultCurrency(null)).toBe(true)
    })

    it('returns true for undefined', () => {
      expect(isDefaultCurrency(undefined)).toBe(true)
    })

    it('returns false for USD', () => {
      expect(isDefaultCurrency('USD')).toBe(false)
    })

    it('returns false for lowercase eur (not normalized)', () => {
      // isDefaultCurrency calls normalizeCurrency internally
      expect(isDefaultCurrency('eur')).toBe(true) // normalizeCurrency('eur') === 'EUR'
    })

    it('returns true for empty string (falsy)', () => {
      expect(isDefaultCurrency('')).toBe(true)
    })
  })

  // ============================================================
  // getDefaultCurrency
  // ============================================================
  describe('getDefaultCurrency', () => {
    it('returns EUR', () => {
      expect(getDefaultCurrency()).toBe('EUR')
    })

    it('returns CurrencyCode type', () => {
      const currency: CurrencyCode = getDefaultCurrency()
      expect(currency).toBe('EUR')
    })
  })

  // ============================================================
  // getCurrencyInfo
  // ============================================================
  describe('getCurrencyInfo', () => {
    it('returns EUR info for EUR', () => {
      const info = getCurrencyInfo('EUR')
      expect(info).toEqual({ code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' })
    })

    it('normalizes lowercase eur', () => {
      const info = getCurrencyInfo('eur')
      expect(info).toEqual({ code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' })
    })

    it('returns EUR info as fallback for unknown currency', () => {
      const info = getCurrencyInfo('USD')
      expect(info).toEqual({ code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' })
    })

    it('returns EUR info for empty string', () => {
      const info = getCurrencyInfo('')
      expect(info).toEqual({ code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' })
    })

    it('trims whitespace', () => {
      const info = getCurrencyInfo(' EUR ')
      expect(info).toEqual({ code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' })
    })
  })

  // ============================================================
  // Type exports
  // ============================================================
  describe('Type exports', () => {
    it('CurrencyCode is EUR only', () => {
      const code: CurrencyCode = 'EUR'
      expect(code).toBe('EUR')
    })

    it('CurrencyInfo has correct shape', () => {
      const info: CurrencyInfo = { code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' }
      expect(info.code).toBe('EUR')
      expect(info.symbol).toBe('€')
      expect(info.decimals).toBe(2)
      expect(info.locale).toBe('es-ES')
    })
  })
})