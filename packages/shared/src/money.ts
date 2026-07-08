/**
 * Money utilities.
 * All monetary values are handled as numbers with 2 decimal places precision.
 * Uses integer-cents internally where precision is critical.
 */

const DECIMAL_PLACES = 2;
const MULTIPLIER = Math.pow(10, DECIMAL_PLACES);

/**
 * Rounds a number to 2 decimal places (cents).
 * Uses toFixed to avoid floating point issues.
 */
export function toMoney(value: number | string): number {
  const num = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(DECIMAL_PLACES));
}

/**
 * Converts a money amount to integer cents (for precise arithmetic).
 */
export function toCents(value: number | string): number {
  return Math.round(toMoney(value) * MULTIPLIER);
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