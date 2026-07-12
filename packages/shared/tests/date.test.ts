import { describe, it, expect } from 'vitest'
import {
  parseAccountingDate,
  parseDateValue,
  isValidIsoDate,
  isValidIsoMonth,
  daysBetween,
  isWithinReconciliationWindow,
  compareDateOnly,
  normalizeDateOnly,
  toIsoDateString,
  monthKeyFromDate,
  addMonths,
  startOfMonth,
  endOfMonth,
  rangeMonths,
  previousMonth,
  nextMonth,
  daysInMonth,
} from '../src/date.js'

/**
 * Accounting dates are the strict-entry side of CSV import: only canonical
 * YYYY-MM-DD is accepted there. parseDateValue remains lenient for legacy UI
 * inputs. @see docs/financial-domain.md
 */
describe('parseAccountingDate — strict YYYY-MM-DD (CSV canonical entry)', () => {
  it('accepts a well-formed ISO date', () => {
    expect(parseAccountingDate('2024-03-05')).toBe('2024-03-05')
    expect(parseAccountingDate('2024-02-29')).toBe('2024-02-29') // leap year
  })

  it('trims surrounding whitespace but keeps strict format inside', () => {
    expect(parseAccountingDate('  2024-03-05  ')).toBe('2024-03-05')
  })

  it('rejects ambiguous European/US formats (accounting context)', () => {
    expect(parseAccountingDate('05/03/2024')).toBeNull() // DD/MM/YYYY
    expect(parseAccountingDate('03/05/2024')).toBeNull() // MM/DD/YYYY
    expect(parseAccountingDate('05-03-2024')).toBeNull()
    expect(parseAccountingDate('05.03.2024')).toBeNull()
  })

  it('rejects datetimes, offsets, and single-digit components', () => {
    expect(parseAccountingDate('2024-03-05T12:00:00')).toBeNull()
    expect(parseAccountingDate('2024-03-05Z')).toBeNull()
    expect(parseAccountingDate('2024-3-5')).toBeNull() // not zero-padded
  })

  it('rejects impossible calendar dates', () => {
    expect(parseAccountingDate('2024-02-30')).toBeNull() // Feb has no 30
    expect(parseAccountingDate('2023-02-29')).toBeNull() // 2023 not leap
    expect(parseAccountingDate('2024-13-01')).toBeNull() // month 13
    expect(parseAccountingDate('2024-00-10')).toBeNull() // month 0
    expect(parseAccountingDate('2024-04-31')).toBeNull() // April has 30
  })

  it('rejects empty / non-strings-ish', () => {
    expect(parseAccountingDate('')).toBeNull()
    expect(parseAccountingDate('   ')).toBeNull()
    expect(parseAccountingDate('not-a-date')).toBeNull()
  })
})

describe('parseDateValue — lenient parsing for legacy UI inputs', () => {
  it('passes through ISO unchanged', () => {
    expect(parseDateValue('2024-03-05')).toBe('2024-03-05')
  })

  it('parses European dotted/slash/dash formats to ISO', () => {
    expect(parseDateValue('05/03/2024')).toBe('2024-03-05')
    expect(parseDateValue('5.3.2024')).toBe('2024-03-05')
    expect(parseDateValue('05-03-2024')).toBe('2024-03-05')
  })

  it('returns null for empty / gibberish', () => {
    expect(parseDateValue('')).toBeNull()
    expect(parseDateValue('   ')).toBeNull()
  })
})

describe('isValidIsoDate — real calendar date check via round-trip', () => {
  it('accepts valid dates including leap day', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
    expect(isValidIsoDate('2024-03-05')).toBe(true)
  })

  it('rejects impossible dates that the regex alone would pass', () => {
    expect(isValidIsoDate('2024-02-30')).toBe(false)
    expect(isValidIsoDate('2023-02-29')).toBe(false)
    expect(isValidIsoDate('2024-13-01')).toBe(false)
  })

  it('rejects malformed shapes', () => {
    expect(isValidIsoDate('2024-3-5')).toBe(false)
    expect(isValidIsoDate('2024-03-05T12:00:00')).toBe(false)
    expect(isValidIsoDate('not-a-date')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })
})

describe('isValidIsoMonth', () => {
  it('accepts valid months in the supported century', () => {
    expect(isValidIsoMonth('2024-01')).toBe(true)
    expect(isValidIsoMonth('2024-12')).toBe(true)
  })
  it('rejects out-of-range months / years / shapes', () => {
    expect(isValidIsoMonth('2024-00')).toBe(false)
    expect(isValidIsoMonth('2024-13')).toBe(false)
    expect(isValidIsoMonth('1899-12')).toBe(false)
    expect(isValidIsoMonth('2024-1')).toBe(false) // not padded
  })
})

describe('daysBetween — calendar days, symmetric, non-negative', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2024-03-05', '2024-03-05')).toBe(0)
  })
  it('counts whole days and is order-independent', () => {
    expect(daysBetween('2024-01-01', '2024-01-04')).toBe(3)
    expect(daysBetween('2024-01-04', '2024-01-01')).toBe(3)
  })
  it('crosses month boundaries correctly, accounting for leap day', () => {
    expect(daysBetween('2024-01-31', '2024-02-01')).toBe(1)
    expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2) // 2024 is leap
    expect(daysBetween('2023-02-28', '2023-03-01')).toBe(1) // 2023 is not
  })
})

describe('isWithinReconciliationWindow — ±3 days inclusive (default)', () => {
  it('matches within and on the boundary, both directions', () => {
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-01')).toBe(true)
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-03')).toBe(true)
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-04')).toBe(true) // exactly 3
    expect(isWithinReconciliationWindow('2024-01-04', '2024-01-01')).toBe(true) // symmetric
  })
  it('rejects beyond the default window', () => {
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-05')).toBe(false) // 4 days
  })
  it('honours a custom windowDays argument', () => {
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-10', 9)).toBe(true)
    expect(isWithinReconciliationWindow('2024-01-01', '2024-01-10', 7)).toBe(false)
  })
})

describe('compareDateOnly', () => {
  it('orders ISO strings lexicographically == chronologically', () => {
    expect(compareDateOnly('2024-01-01', '2024-01-02')).toBe(-1)
    expect(compareDateOnly('2024-01-02', '2024-01-01')).toBe(1)
    expect(compareDateOnly('2024-01-01', '2024-01-01')).toBe(0)
  })
})

describe('normalizeDateOnly / toIsoDateString — UTC components only', () => {
  it('normalizeDateOnly builds YYYY-MM-DD from UTC fields', () => {
    const d = new Date(Date.UTC(2024, 2, 5, 23, 30, 0)) // Mar 5 23:30Z
    expect(normalizeDateOnly(d)).toBe('2024-03-05')
  })
  it('toIsoDateString slices the ISO string', () => {
    const d = new Date('2024-03-05T12:00:00.000Z')
    expect(toIsoDateString(d)).toBe('2024-03-05')
  })
})

describe('month utilities', () => {
  it('monthKeyFromDate slices the first 7 chars', () => {
    expect(monthKeyFromDate('2024-03-15')).toBe('2024-03')
    expect(monthKeyFromDate('2024-01-01')).toBe('2024-01')
  })

  it('startOfMonth / endOfMonth bound a month', () => {
    expect(startOfMonth('2024-03-15')).toBe('2024-03-01')
    expect(endOfMonth('2024-03-15')).toBe('2024-03-31')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29') // leap
    expect(endOfMonth('2023-02-10')).toBe('2023-02-28')
  })

  it('addMonths shifts cleanly for non-clamping dates', () => {
    expect(addMonths('2024-01-15', 2)).toBe('2024-03-15') // forward
    expect(addMonths('2024-03-15', -2)).toBe('2024-01-15') // back 2 -> January
    // Day-clamp at month end is JS Date semantics, not a domain rule — avoid asserting it.
  })

  it('rangeMonths lists months inclusively', () => {
    expect(rangeMonths('2024-01-15', '2024-03-15')).toEqual(['2024-01', '2024-02', '2024-03'])
    expect(rangeMonths('2024-01-10', '2024-01-20')).toEqual(['2024-01'])
  })

  it('previousMonth / nextMonth wrap year boundaries', () => {
    expect(previousMonth('2024-01')).toBe('2023-12')
    expect(previousMonth('2024-03')).toBe('2024-02')
    expect(nextMonth('2024-12')).toBe('2025-01')
    expect(nextMonth('2024-01')).toBe('2024-02')
  })

  it('daysInMonth honours leap years', () => {
    expect(daysInMonth('2024-02')).toBe(29)
    expect(daysInMonth('2023-02')).toBe(28)
    expect(daysInMonth('2024-01')).toBe(31)
  })
})
