/**
 * Currency utilities.
 * Defines supported currencies, validation, and normalization.
 * Currently only EUR is supported.
 */

/**
 * Supported currency codes.
 */
export type CurrencyCode = 'EUR';

/**
 * Default currency for the application.
 */
export const DEFAULT_CURRENCY: CurrencyCode = 'EUR';

/**
 * Set of supported currency codes for runtime validation.
 */
export const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set<CurrencyCode>(['EUR']);

/**
 * Checks if a currency code is supported by the system.
 */
export function isCurrencySupported(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.has(code);
}

/**
 * Normalizes a currency string to uppercase and validates it.
 * Returns the canonical CurrencyCode if valid, null otherwise.
 */
export function normalizeCurrency(code: string): CurrencyCode | null {
  const upper = code.toUpperCase().trim();
  return isCurrencySupported(upper) ? upper : null;
}

/**
 * Asserts that a currency is compatible with the system.
 * Throws if the currency is not supported.
 */
export function assertCurrencySupported(code: string): asserts code is CurrencyCode {
  if (!isCurrencySupported(code)) {
    throw new Error(`Moneda no soportada: "${code}". Solo se acepta EUR.`);
  }
}

/**
 * Validates that a currency matches the default (EUR).
 * Returns true if the currency is EUR or null/undefined (defaults to EUR).
 */
export function isDefaultCurrency(code: string | null | undefined): boolean {
  if (!code) return true;
  return normalizeCurrency(code) === DEFAULT_CURRENCY;
}

/**
 * Returns the default currency string for storage/display.
 */
export function getDefaultCurrency(): CurrencyCode {
  return DEFAULT_CURRENCY;
}

/**
 * Currency metadata for display.
 */
export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  decimals: number;
  locale: string;
}

/**
 * Currency display information map.
 */
export const CURRENCY_INFO: Record<CurrencyCode, CurrencyInfo> = {
  EUR: { code: 'EUR', symbol: '€', decimals: 2, locale: 'es-ES' },
};

/**
 * Gets display info for a currency code.
 * Returns EUR info as default if code is not found.
 */
export function getCurrencyInfo(code: string): CurrencyInfo {
  const upper = code.toUpperCase().trim() as CurrencyCode;
  return CURRENCY_INFO[upper] ?? CURRENCY_INFO[DEFAULT_CURRENCY];
}