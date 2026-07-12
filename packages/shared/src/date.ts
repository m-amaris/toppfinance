/**
 * Date utilities.
 * All dates are handled as ISO strings (YYYY-MM-DD) or Date objects in UTC.
 * Avoids timezone issues by using noon UTC for date-only values.
 *
 * Accounting date policy: YYYY-MM-DD strict, no hours/offsets.
 * See docs/financial-domain.md for the full policy.
 */

const RECONCILIATION_WINDOW_DAYS = 3;

/**
 * Creates a Date at noon UTC for a given ISO date string (YYYY-MM-DD).
 * This avoids timezone issues when converting to/from local dates.
 */
export function dateOnly(value: string): Date {
  // Use noon UTC to avoid DST issues
  return new Date(`${value}T12:00:00.000Z`);
}

/**
 * Creates a Date at noon UTC from a Date object (preserves the date part only).
 */
export function dateOnlyFromDate(date: Date): Date {
  const iso = date.toISOString().slice(0, 10);
  return dateOnly(iso);
}

/**
 * Returns the current date as ISO string (YYYY-MM-DD) in local timezone.
 */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`;
}

/**
 * Returns the current month as ISO string (YYYY-MM) in local timezone.
 */
export function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${padZero(now.getMonth() + 1)}`;
}

/**
 * Converts a Date to ISO date string (YYYY-MM-DD).
 */
export function toIsoDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Converts a Date to ISO month string (YYYY-MM).
 */
export function toIsoMonthString(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Creates a month key (YYYY-MM) from an ISO date string.
 */
export function monthKeyFromDate(dateString: string): string {
  return dateString.slice(0, 7);
}

/**
 * Parses a date string in various formats to ISO date string (YYYY-MM-DD).
 * Supports: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY/MM/DD
 * Returns null if parsing fails.
 */
export function parseDateValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const match = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const iso = `${year}-${month}-${day}`;
    // Validate the date
    const date = new Date(`${iso}T12:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return iso;
    }
    return null;
  }

  // Try parsing as ISO datetime or other standard formats
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDateString(parsed);
  }

  return null;
}

/**
 * Adds months to an ISO date string.
 */
export function addMonths(isoDate: string, months: number): string {
  const date = dateOnly(isoDate);
  date.setMonth(date.getMonth() + months);
  return toIsoDateString(date);
}

/**
 * Returns the first day of the month for an ISO date string.
 */
export function startOfMonth(isoDate: string): string {
  const date = dateOnly(isoDate);
  date.setDate(1);
  return toIsoDateString(date);
}

/**
 * Returns the last day of the month for an ISO date string.
 */
export function endOfMonth(isoDate: string): string {
  const date = dateOnly(isoDate);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return toIsoDateString(date);
}

/**
 * Returns an array of month keys (YYYY-MM) between two dates inclusive.
 *
 * Pure arithmetic over the year/month numerics — no Date construction — so the
 * result is independent of the runtime timezone. (The previous Date-based
 * implementation read .toISOString() on a local-midnight Date, which shifted
 * the month back by one in timezones behind UTC.)
 */
export function rangeMonths(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);

  let y = sy;
  let m = sm;
  // Walk months forward until strictly past the end month.
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${padZero(m)}`);
    if (m === 12) {
      y += 1;
      m = 1;
    } else {
      m += 1;
    }
  }

  return months;
}

/**
 * Returns the previous month key (YYYY-MM).
 * Pure arithmetic; timezone-independent.
 */
export function previousMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${padZero(month - 1)}`;
}

/**
 * Returns the next month key (YYYY-MM).
 * Pure arithmetic; timezone-independent.
 */
export function nextMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${padZero(month + 1)}`;
}

/**
 * Checks if an ISO date string is valid.
 */
export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Checks if an ISO month string is valid.
 */
export function isValidIsoMonth(value: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2100;
}

/**
 * Formats a date for display in Spanish locale.
 */
export function formatDateEs(dateString: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = dateOnly(dateString);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  }).format(date);
}

/**
 * Formats a month for display in Spanish locale (e.g., "enero 2024").
 * Pinned to UTC so the rendered month never drifts with the runtime timezone.
 */
export function formatMonthEs(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/**
 * Formats a month for short display in Spanish locale (e.g., "Ene 2024").
 * Pinned to UTC so the rendered month never drifts with the runtime timezone.
 */
export function formatMonthShortEs(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('es-ES', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date).replace('.', '');
}

/**
 * Returns the number of days in a month.
 */
export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

/**
 * Pads a number with leading zeros.
 */
function padZero(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns the ISO week number for a date.
 */
export function getWeekNumber(isoDate: string): number {
  const date = dateOnly(isoDate);
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Returns the start of week (Monday) for a date.
 */
export function startOfWeek(isoDate: string): string {
  const date = dateOnly(isoDate);
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  date.setDate(date.getDate() + diff);
  return toIsoDateString(date);
}

/**
 * Returns the end of week (Sunday) for a date.
 */
export function endOfWeek(isoDate: string): string {
  const date = dateOnly(startOfWeek(isoDate));
  date.setDate(date.getDate() + 6);
  return toIsoDateString(date);
}

/**
 * Strictly parses an accounting date string.
 * Only accepts YYYY-MM-DD format. Rejects ambiguous formats (DD/MM/YYYY, etc.).
 * This is the canonical entry point for CSV import dates.
 * Returns null if the value is not a valid YYYY-MM-DD date.
 */
export function parseAccountingDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Strict ISO format only — no ambiguous European formats in accounting context
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  // Validate the date is real (not Feb 30, etc.)
  const [year, month, day] = trimmed.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  return trimmed;
}

/**
 * Returns the ISO date-only string from a Date object without timezone shift.
 * Always returns YYYY-MM-DD.
 */
export function normalizeDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${padZero(date.getUTCMonth() + 1)}-${padZero(date.getUTCDate())}`;
}

/**
 * Compares two ISO date-only strings (YYYY-MM-DD).
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareDateOnly(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Returns the number of calendar days between two ISO date strings.
 * Always returns a non-negative integer.
 */
export function daysBetween(a: string, b: string): number {
  const dateA = new Date(`${a}T12:00:00.000Z`);
  const dateB = new Date(`${b}T12:00:00.000Z`);
  const diffMs = Math.abs(dateA.getTime() - dateB.getTime());
  return Math.round(diffMs / 86400000);
}

/**
 * Checks if a date is within the reconciliation window of another date.
 * The reconciliation window is defined in calendar days (default 3).
 * Both dates must be ISO date-only strings (YYYY-MM-DD).
 */
export function isWithinReconciliationWindow(
  dateA: string,
  dateB: string,
  windowDays: number = RECONCILIATION_WINDOW_DAYS
): boolean {
  return daysBetween(dateA, dateB) <= windowDays;
}