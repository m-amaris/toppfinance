import { describe, it, expect } from 'vitest'
import {
  bankersRound,
  toMoney,
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  sameMoney,
  parseMoney,
  parseCsvMoney,
  allocateByPercent,
  isValidMoney,
} from '../src/money.js'

/**
 * Banker's rounding (round half to even) is the canonical rounding policy for
 * the financial domain. These tests pin the documented behavior, including the
 * tie cases where naive round-half-up would bias the result.
 *
 * Tie values are chosen to be exact in binary (e.g. 0.125, 0.625 — powers-of-8
 * fractions) so the scaled value lands on a true X.5 half rather than a
 * float-drifted neighbour. 0.135 is included because 0.135 * 100 is exactly
 * 13.5 — the real-world half-cent case that exposed the negative-tie bug.
 * @see docs/financial-domain.md
 */
describe('bankersRound / toMoney — round half to even', () => {
  it('rounds exact .5 ties to the nearest EVEN cent, both signs', () => {
    // Positive ties: odd ceiling → step down to even floor
    expect(toMoney(0.125)).toBe(0.12) // 12.5 -> 12 (even)
    expect(toMoney(0.625)).toBe(0.62) // 62.5 -> 62 (even)
    expect(toMoney(0.135)).toBe(0.14) // 13.5 -> 14 (even, even ceiling stays)
    // Negative ties — where naive round-half-up / Math.sign correction breaks.
    // The even neighbour of -12.5 is -12; of -13.5 is -14.
    expect(toMoney(-0.125)).toBe(-0.12) // -12.5 -> -12 (even), NOT -13
    expect(toMoney(-0.135)).toBe(-0.14) // -13.5 -> -14 (even), NOT -13
    expect(toMoney(-0.375)).toBe(-0.38) // -37.5 -> -38 (even), NOT -37
  })

  it('leaves already-even ties and whole-cent values untouched', () => {
    expect(toMoney(0.375)).toBe(0.38) // 37.5 -> 38 (even ceiling, no step)
    expect(toMoney(-0.625)).toBe(-0.62) // -62.5 -> -62 (even floor)
    // Whole-cent values are not ties at the cents scale
    expect(toMoney(2.5)).toBe(2.5)
    expect(toMoney(3.5)).toBe(3.5)
    expect(toMoney(-2.5)).toBe(-2.5)
  })

  it('rounds non-tie values to nearest, both signs', () => {
    expect(toMoney(0.124)).toBe(0.12)
    expect(toMoney(0.126)).toBe(0.13)
    expect(toMoney(-0.124)).toBe(-0.12)
    expect(toMoney(-0.126)).toBe(-0.13)
  })

  it('bankersRound maps an odd-tie scaled value to the even neighbor', () => {
    // bankersRound takes an already-scaled value (arg * 100 is implied done).
    expect(bankersRound(2.5)).toBe(0.02) // scaled 2.5 -> even 2 -> 0.02
    expect(bankersRound(3.5)).toBe(0.04) // scaled 3.5 -> even 4 -> 0.04
    expect(bankersRound(-2.5)).toBe(-0.02)
    expect(bankersRound(-3.5)).toBe(-0.04)
  })
})

describe('toCents / fromCents — integer cents representation', () => {
  it('preserves exact cents without float drift', () => {
    expect(toCents(0.1 + 0.2)).toBe(30) // 0.30000000000000004 -> 30
    expect(toCents(1234.56)).toBe(123456)
    expect(toCents(19.99)).toBe(1999)
    expect(toCents(-19.99)).toBe(-1999)
  })

  it('rounds half ties to even cents (the negative-tie regression guard)', () => {
    expect(toCents(0.125)).toBe(12) // 12.5 -> 12
    expect(toCents(0.135)).toBe(14) // 13.5 -> 14
    expect(toCents(-0.135)).toBe(-14) // -13.5 -> -14 (the bug was -12)
    expect(toCents(-0.125)).toBe(-12)
  })

  it('fromCents is the exact inverse of toCents', () => {
    for (const cents of [0, 1, 99, 100, 1999, 123456, -1999, -123456]) {
      expect(toCents(fromCents(cents))).toBe(cents)
    }
  })

  it('addMoney / subtractMoney stay in exact cents', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(subtractMoney(1.0, 0.3)).toBe(0.7)
    expect(sameMoney(addMoney(0.1, 0.2), 0.3)).toBe(true)
  })
})

describe('sameMoney — cent-exact equality', () => {
  it('treats float-drifted equivalents as equal', () => {
    expect(sameMoney(0.1 + 0.2, 0.3)).toBe(true) // both -> 30 cents
    expect(sameMoney('1.00', 1)).toBe(true)
  })

  it('detects a genuine one-cent difference', () => {
    expect(sameMoney(1.0, 1.01)).toBe(false) // 100 vs 101 cents
    expect(sameMoney(19.99, 20.0)).toBe(false)
  })
})

describe('parseMoney / parseCsvMoney — robust monetary parse', () => {
  it('parses European and US number formats when both separators present', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56) // EU: . thousands, , decimal
    expect(parseMoney('1,234.56')).toBe(1234.56) // US: , thousands, . decimal
    expect(parseMoney('1234.56')).toBe(1234.56)
    expect(parseMoney('12,50')).toBe(12.5) // lone comma + 2 digits -> decimal
  })

  it('treats a lone dot as the decimal separator (documented heuristic)', () => {
    // '1.000' is ambiguous (EU thousands vs decimal); the unique rule resolves
    // a lone '.' to a decimal, so 1.000 == 1.0, not 1000.
    expect(parseMoney(' 1.000 ')).toBe(1)
  })

  it('strips currency symbols and whitespace', () => {
    expect(parseMoney('€ 19,99')).toBe(19.99)
  })

  it('returns null for unparseable input', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseCsvMoney('')).toBeNull()
    expect(parseCsvMoney('nope')).toBeNull()
  })

  it('parseCsvMoney returns integer cents (canonical entry point for imports)', () => {
    expect(parseCsvMoney('1.234,56')).toBe(123456)
    expect(parseCsvMoney('12,50')).toBe(1250)
    expect(parseCsvMoney('-19,99')).toBe(-1999)
  })
})

describe('isValidMoney', () => {
  it('accepts clean 2-decimal values and rejects drift', () => {
    expect(isValidMoney(19.99)).toBe(true)
    expect(isValidMoney(0.3)).toBe(true)
    expect(isValidMoney(0.1 + 0.2)).toBe(false) // float drift != toMoney(self)
    expect(isValidMoney(NaN)).toBe(false)
  })
})

describe('allocateByPercent — largest remainder, exact sum', () => {
  it('allocates exactly the total with no rounding gap', () => {
    const cents = allocateByPercent(100, [33.33, 33.33, 33.34])
    expect(cents.reduce((s, c) => s + c, 0)).toBe(10000)
    expect(cents).toEqual([3333, 3333, 3334])
  })

  it('handles the 50/50 even split exactly', () => {
    const cents = allocateByPercent(50, [50, 50])
    expect(cents.reduce((s, c) => s + c, 0)).toBe(5000)
    expect(cents).toEqual([2500, 2500])
  })

  it('throws when percents do not sum to 100', () => {
    expect(() => allocateByPercent(100, [50, 40])).toThrow()
  })

  it('returns the whole amount for a single part', () => {
    expect(allocateByPercent(99, [100])).toEqual([9900])
  })
})
