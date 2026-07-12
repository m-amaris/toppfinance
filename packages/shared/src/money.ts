/**
 * Money utilities.
 * All monetary values are handled as numbers with 2 decimal places precision.
 * Uses integer-cents internally where precision is critical.
 *
 * Rounding policy: Banker's rounding (round half to even).
 * See docs/financial-domain.md for the full policy.
 */

const DECIMAL_PLACES = 2;
const MULTIPLIER = Math.pow(10, DECIMAL_PLACES);

/**
 * Applies Banker's rounding (round half to even) to a scaled value.
 * @param scaled - The value already multiplied by MULTIPLIER
 * @returns The Banker-rounded value in the original scale
 */
export function bankersRound(scaled: number): number {
  const rounded = Math.round(scaled);
  // Exact .5 tie: Math.round floors negative halves toward zero (gives the
  // ceiling) and positive halves toward +∞ (also the ceiling). The even
  // neighbor of a half is therefore the floor = `rounded - 1`, regardless of
  // sign. Moving by `Math.sign(rounded)` instead would step negative ties
  // the wrong way (toward zero), producing the odd neighbor.
  const isHalf = Math.abs(scaled - rounded) === 0.5;
  if (isHalf && rounded % 2 !== 0) {
    return (rounded - 1) / MULTIPLIER;
  }
  return Number((rounded / MULTIPLIER).toFixed(DECIMAL_PLACES));
}

/**
 * Rounds a number to 2 decimal places using Banker's rounding.
 */
export function toMoney(value: number | string): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return bankersRound(num * MULTIPLIER);
}

/**
 * Converts a money amount to integer cents (for precise arithmetic).
 * Uses Banker's rounding.
 */
export function toCents(value: number | string): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  // Banker's rounding to integer cents. See bankersRound(): for an exact .5
  // tie Math.round yields the ceiling neighbor, so the even neighbor is the
  // floor = `rounded - 1` for both signs (Math.sign would break negatives).
  const scaled = num * MULTIPLIER;
  const rounded = Math.round(scaled);
  const isHalf = Math.abs(scaled - rounded) === 0.5;
  if (isHalf && rounded % 2 !== 0) {
    return rounded - 1;
  }
  return rounded;
}

/**
 * Converts integer cents back to money (decimal).
 */
export function fromCents(cents: number): number {
  return Number((cents / MULTIPLIER).toFixed(DECIMAL_PLACES));
}

/**
 * Adds two money amounts precisely.
 */
export function addMoney(a: number | string, b: number | string): number {
  return fromCents(toCents(a) + toCents(b));
}

/**
 * Subtracts money amounts precisely.
 */
export function subtractMoney(a: number | string, b: number | string): number {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiplies money by a factor (e.g., percentage).
 */
export function multiplyMoney(value: number | string, factor: number): number {
  return fromCents(Math.round(toCents(value) * factor));
}

/**
 * Divides money by a divisor.
 */
export function divideMoney(value: number | string, divisor: number): number {
  if (divisor === 0) throw new Error('Division by zero');
  return fromCents(Math.round(toCents(value) / divisor));
}

/**
 * Calculates a percentage of a money amount.
 */
export function percentOf(value: number | string, percent: number): number {
  return multiplyMoney(value, percent / 100);
}

/**
 * Formats a money amount for display (Spanish locale, EUR).
 */
export function formatMoney(
  value: number | string,
  options: Intl.NumberFormatOptions = {}
): string {
  const num = toMoney(value);
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...options,
  }).format(num);
}

/**
 * Formats a money amount without currency symbol.
 */
export function formatMoneyPlain(
  value: number | string,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}
): string {
  const num = toMoney(value);
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(num);
}

/**
 * Parses a money string (handles various formats like "1.234,56", "1,234.56", "1234.56").
 * Returns null if parsing fails.
 */
export function parseMoney(value: string): number | null {
  if (!value || typeof value !== 'string') return null;

  const cleaned = value
    .replace(/[€\s]/g, '')
    .trim()
    .replace(/ /g, ''); // non-breaking space

  if (!cleaned) return null;

  // Handle European format (1.234,56) vs US format (1,234.56)
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // Both present - determine which is decimal separator
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, '').replace(',', '.')  // European
      : cleaned.replace(/,/g, '');                    // US
  } else if (lastComma > -1) {
    // Only comma - could be decimal or thousands
    // Heuristic: if comma followed by exactly 2 or 3 digits at end, treat as decimal
    const afterComma = cleaned.slice(lastComma + 1);
    if (afterComma.length === 2 || afterComma.length === 3) {
      normalized = cleaned.replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, ''); // thousands separator
    }
  } else {
    normalized = cleaned;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? toMoney(parsed) : null;
}

/**
 * Validates that a value is a valid money amount (finite, 2 decimal places max).
 */
export function isValidMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value === toMoney(value);
}

/**
 * Sums an array of money amounts precisely.
 */
export function sumMoney(values: Array<number | string>): number {
  return values.reduce((sum: number, val) => addMoney(sum, val), 0);
}

/**
 * Calculates the absolute value of a money amount.
 */
export function absMoney(value: number | string): number {
  return toMoney(Math.abs(toMoney(value)));
}

/**
 * Clamps a money value between min and max.
 */
export function clampMoney(value: number | string, min: number, max: number): number {
  const num = toMoney(value);
  return toMoney(Math.max(min, Math.min(max, num)));
}

/**
 * Compares two money amounts.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareMoney(a: number | string, b: number | string): number {
  const diff = subtractMoney(a, b);
  if (diff < 0) return -1;
  if (diff > 0) return 1;
  return 0;
}

/**
 * Normalizes a money input to a canonical number with 2 decimal places.
 * Unlike toMoney, this returns 0 for NaN/Infinity and always rounds via Banker's.
 */
export function normalizeMoneyInput(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return bankersRound(num * MULTIPLIER);
}

/**
 * Parses a CSV money field (handles EU and US formats) and returns integer cents.
 * This is the canonical entry point for CSV import amounts.
 * Returns null if parsing fails or the value is not a valid money amount.
 */
export function parseCsvMoney(value: string): number | null {
  const parsed = parseMoney(value);
  if (parsed == null) return null;
  return toCents(parsed);
}

/**
 * Checks if two monetary values represent the same amount (exact cent comparison).
 * Uses integer cents internally for precision.
 */
export function sameMoney(a: number | string, b: number | string): boolean {
  return toCents(a) === toCents(b);
}

/**
 * Allocates a monetary amount across parts by percentage, controlling remainder.
 * Uses the "largest remainder" method to ensure the sum of allocated amounts
 * exactly equals the original total (no rounding gaps).
 *
 * Returns an array of allocated amounts in cents matching the order of percents.
 */
export function allocateByPercent(
  total: number | string,
  percents: number[]
): number[] {
  const totalCents = toCents(total);
  if (percents.length === 0) return [];
  if (percents.length === 1) return [totalCents];

  const totalPercent = percents.reduce((s, p) => s + p, 0);
  if (Math.abs(totalPercent - 100) > 0.01) {
    throw new Error('Los porcentajes deben sumar 100%');
  }

  // Calculate raw allocation
  const raw = percents.map(p => (totalCents * p) / 100);
  // Take integer part
  const base = raw.map(r => Math.floor(r));
  const remainder = raw.map((r, i) => r - base[i]);
  let allocated = base.reduce((s, v) => s + v, 0);
  let remaining = totalCents - allocated;

  // Distribute remainder to highest fractional parts
  const indices = remainder
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r - a.r);

  for (const { i } of indices) {
    if (remaining <= 0) break;
    base[i] += 1;
    remaining -= 1;
  }

  return base;
}

/**
 * Adds a new enum import/export for money-related helpers.
 * Converts cents to a display string with currency symbol.
 */
export function centsToDisplay(cents: number, currency: string = 'EUR'): string {
  const amount = fromCents(cents);
  return formatMoney(amount, { currency });
}