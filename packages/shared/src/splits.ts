/**
 * Split utilities.
 * Handles beneficiary splits, proportional sharing, and validation.
 * Derived types (SplitPart, BeneficiarySplit) live in types.ts.
 */

import { TransactionType, Visibility } from './enums.js';
import { toMoney } from './money.js';

/**
 * Represents a user for split calculations.
 * Not directly derivable from a Zod schema (broader than request shapes).
 */
export interface SplitUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Default shared split configuration.
 */
export interface SharedSplitConfig {
  miguelPercent: number;
  saraPercent: number;
}

/**
 * Validates that split parts sum to 100% (with small tolerance for floating point).
 */
export function assertSplitTotal(splits: Array<{ percent: number }>): void {
  const total = splits.reduce((sum, split) => sum + split.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error('El reparto debe sumar 100%');
  }
}

/**
 * Validates and normalizes split parts.
 * Returns normalized splits that sum to exactly 100%.
 */
export function normalizeSplits(splits: Array<{ userId: string; percent: number }>): Array<{ userId: string; percent: number }> {
  if (splits.length === 0) {
    throw new Error('Se requiere al menos un beneficiario');
  }

  const total = splits.reduce((sum, s) => sum + s.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw new Error('El reparto debe sumar 100%');
  }

  const factor = 100 / total;
  return splits.map(s => ({
    userId: s.userId,
    percent: toMoney(s.percent * factor),
  }));
}

/**
 * Creates equal splits among users.
 */
export function equalSplits(users: SplitUser[]): Array<{ userId: string; percent: number }> {
  if (users.length === 0) return [];

  const base = Number((100 / users.length).toFixed(2));
  return users.map((user, index) => ({
    userId: user.id,
    percent: index === users.length - 1
      ? Number((100 - base * (users.length - 1)).toFixed(2))
      : base,
  }));
}

/**
 * Finds a user by email or display name (case-insensitive, accent-insensitive).
 */
export function findUser(users: SplitUser[], raw: string): SplitUser | undefined {
  const normalized = normalizeText(raw);
  return users.find(user =>
    normalizeText(user.email) === normalized ||
    normalizeText(user.displayName) === normalized
  );
}

/**
 * Parses beneficiary splits from a CSV string format.
 * Format: "user1=50,user2=50" or "user1=50|user2=50"
 * Returns splits and warnings.
 */
export function parseBeneficiarySplits(
  raw: string,
  users: SplitUser[]
): { splits: Array<{ userId: string; percent: number }> | null; warnings: string[] } {
  const warnings: string[] = [];

  if (!raw.trim()) {
    return { splits: null, warnings };
  }

  const delimiter = raw.includes('|') ? '|' : ',';
  const parts = raw.split(delimiter).map(p => p.trim()).filter(Boolean);

  const parsedSplits = parts.map(part => {
    const [userValue, percentValue] = part.split('=').map(p => p.trim());
    const user = findUser(users, userValue ?? '');
    const percent = Number(String(percentValue ?? '').replace(',', '.'));
    if (!user || !Number.isFinite(percent)) return null;
    return { userId: user.id, percent };
  });

  if (parsedSplits.some(s => s === null)) {
    warnings.push('No se ha podido leer el reparto; se usará el reparto por defecto.');
    return { splits: null, warnings };
  }

  const validSplits = parsedSplits as Array<{ userId: string; percent: number }>;
  const total = validSplits.reduce((sum, s) => sum + s.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    warnings.push('El reparto del CSV no suma 100%; se usará el reparto por defecto.');
    return { splits: null, warnings };
  }

  return { splits: validSplits, warnings };
}

/**
 * Returns default splits based on visibility and users.
 * - PRIVATE: 100% to the actor
 * - SHARED: uses shared split config (miguel/sara) or equal splits
 */
export function defaultSplits(input: {
  visibility: Visibility;
  users: SplitUser[];
  actorUserId: string;
  sharedSplit: SharedSplitConfig;
}): Array<{ userId: string; percent: number }> {
  if (input.visibility !== Visibility.SHARED || input.users.length < 2) {
    return [{ userId: input.actorUserId, percent: 100 }];
  }

  const miguel = input.users.find(user =>
    normalizeText(user.displayName).includes('miguel') ||
    normalizeText(user.email).includes('miguel')
  );
  const sara = input.users.find(user =>
    normalizeText(user.displayName).includes('sara') ||
    normalizeText(user.email).includes('sara')
  );

  if (miguel && sara) {
    return [
      { userId: miguel.id, percent: input.sharedSplit.miguelPercent },
      { userId: sara.id, percent: input.sharedSplit.saraPercent },
    ];
  }

  return equalSplits(input.users);
}

/**
 * Calculates the monetary amount for each split part.
 */
export function calculateSplitAmounts(
  totalAmount: number,
  splits: Array<{ userId: string; percent: number }>
): Array<{ userId: string; percent: number; amount: number }> {
  return splits.map(split => ({
    ...split,
    amount: toMoney(totalAmount * (split.percent / 100)),
  }));
}

/**
 * Validates that all split user IDs exist in the user list.
 */
export function validateSplitUsers(
  splits: Array<{ userId: string }>,
  users: SplitUser[]
): { valid: boolean; missingUserIds: string[] } {
  const userIds = new Set(users.map(u => u.id));
  const missingUserIds = splits
    .map(s => s.userId)
    .filter(id => !userIds.has(id));
  return {
    valid: missingUserIds.length === 0,
    missingUserIds,
  };
}

/**
 * Normalizes text for comparison (lowercase, no accents).
 */
export function normalizeText(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Type for transaction type-specific split requirements.
 */
export type TransactionSplitRequirement = 'single' | 'dual' | 'optional';

/**
 * Gets the split requirement for a transaction type.
 */
export function getSplitRequirement(type: TransactionType): TransactionSplitRequirement {
  switch (type) {
    case TransactionType.SAVING:
    case TransactionType.TRANSFER:
      return 'dual';
    case TransactionType.EXPENSE:
    case TransactionType.INCOME:
    case TransactionType.ADJUSTMENT:
    default:
      return 'single';
  }
}

/**
 * Creates a source hash for duplicate detection.
 * Used in CSV imports to detect duplicates.
 */
export function makeSourceHash(input: {
  externalId: string;
  draft: {
    type: TransactionType;
    date: string;
    amount: number;
    description: string;
    categoryId: string;
    sourceAccountId: string | null;
    destinationAccountId: string | null;
    merchantName: string | null;
  };
  categoryLabel: string;
  sourceAccountLabel: string;
  destinationAccountLabel: string;
}): string {
  const { createHash } = require('node:crypto');

  const basis = input.externalId || JSON.stringify({
    type: input.draft.type,
    date: input.draft.date,
    amount: input.draft.amount,
    description: normalizeText(input.draft.description),
    category: normalizeText(input.categoryLabel),
    source: normalizeText(input.sourceAccountLabel),
    destination: normalizeText(input.destinationAccountLabel),
    merchant: normalizeText(input.draft.merchantName ?? ''),
  });

  return createHash('sha256').update(basis).digest('hex');
}