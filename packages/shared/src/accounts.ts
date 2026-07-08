/**
 * Account utilities.
 * Handles account entry building, balance calculations, and account-related logic.
 */

import type { Prisma } from '@prisma/client';
import { TransactionType, Visibility, AccountType } from './enums.js';
import { toMoney, addMoney } from './money.js';

/**
 * Input for building account entries from a transaction.
 */
export interface BuildAccountEntriesInput {
  transactionId: string;
  type: TransactionType;
  amount: number;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
}

/**
 * Output account entry for Prisma.
 */
export interface AccountEntryData {
  transactionId: string;
  accountId: string;
  amount: number;
}

/**
 * Builds account entries for a transaction based on its type.
 * Returns an array of entries ready for Prisma createMany.
 *
 * Rules:
 * - INCOME: +amount to source account
 * - EXPENSE: -amount from source account
 * - SAVING: -amount from source, +amount to destination
 * - TRANSFER: -amount from source, +amount to destination
 * - ADJUSTMENT: +amount (can be negative) to source account
 */
export function buildAccountEntries(input: BuildAccountEntriesInput): AccountEntryData[] {
  const amountAbs = Math.abs(toMoney(input.amount));
  const entries: AccountEntryData[] = [];

  switch (input.type) {
    case TransactionType.INCOME: {
      if (!input.sourceAccountId) {
        throw new Error('Los ingresos necesitan cuenta de entrada');
      }
      entries.push({
        transactionId: input.transactionId,
        accountId: input.sourceAccountId,
        amount: amountAbs,
      });
      break;
    }

    case TransactionType.EXPENSE: {
      if (!input.sourceAccountId) {
        throw new Error('Los gastos necesitan cuenta de salida');
      }
      entries.push({
        transactionId: input.transactionId,
        accountId: input.sourceAccountId,
        amount: -amountAbs,
      });
      break;
    }

    case TransactionType.SAVING:
    case TransactionType.TRANSFER: {
      if (!input.sourceAccountId || !input.destinationAccountId) {
        throw new Error('Las transferencias necesitan cuenta origen y destino');
      }
      if (input.sourceAccountId === input.destinationAccountId) {
        throw new Error('La cuenta origen y destino no pueden ser la misma');
      }
      entries.push(
        { transactionId: input.transactionId, accountId: input.sourceAccountId, amount: -amountAbs },
        { transactionId: input.transactionId, accountId: input.destinationAccountId, amount: amountAbs }
      );
      break;
    }

    case TransactionType.ADJUSTMENT: {
      if (!input.sourceAccountId) {
        throw new Error('Los ajustes necesitan una cuenta');
      }
      // ADJUSTMENT amount can be positive or negative
      entries.push({
        transactionId: input.transactionId,
        accountId: input.sourceAccountId,
        amount: toMoney(input.amount),
      });
      break;
    }

    default: {
      const _exhaustive: never = input.type;
      throw new Error(`Tipo de transacción no soportado: ${_exhaustive}`);
    }
  }

  return entries;
}

/**
 * Calculates the current balance of an account from its opening balance and entries.
 */
export function calculateAccountBalance(
  openingBalance: number | Prisma.Decimal,
  entries: Array<{ amount: number | Prisma.Decimal }>
): number {
  const opening = Number(openingBalance);
  const entriesTotal = entries.reduce(
    (sum, entry) => addMoney(sum, Number(entry.amount)),
    0
  );
  return toMoney(opening + entriesTotal);
}

/**
 * Validates that a user has access to an account.
 */
export function validateAccountAccess(
  account: { id: string; ownerUserId: string | null; visibility: Visibility; householdId: string },
  userId: string,
  userHouseholdId: string
): boolean {
  if (account.householdId !== userHouseholdId) return false;
  if (account.visibility === Visibility.SHARED) return true;
  return account.ownerUserId === userId;
}

/**
 * Gets the default account for a transaction type.
 * Used when user doesn't specify an account.
 */
export function getDefaultAccountForType(
  accounts: Array<{ id: string; type: AccountType; visibility: Visibility; ownerUserId: string | null }>,
  type: TransactionType,
  userId: string
): string | null {
  const visibleAccounts = accounts.filter(acc =>
    acc.visibility === Visibility.SHARED || acc.ownerUserId === userId
  );

  if (visibleAccounts.length === 0) return null;

  // Prefer account types based on transaction type
  const preferredTypes: Record<TransactionType, AccountType[]> = {
    [TransactionType.INCOME]: [AccountType.PERSONAL, AccountType.SHARED, AccountType.CASH, AccountType.OTHER],
    [TransactionType.EXPENSE]: [AccountType.PERSONAL, AccountType.SHARED, AccountType.CASH, AccountType.OTHER],
    [TransactionType.SAVING]: [AccountType.SAVINGS, AccountType.SHARED, AccountType.PERSONAL],
    [TransactionType.TRANSFER]: [AccountType.SHARED, AccountType.SAVINGS, AccountType.PERSONAL],
    [TransactionType.ADJUSTMENT]: [AccountType.PERSONAL, AccountType.SHARED, AccountType.SAVINGS, AccountType.CASH, AccountType.OTHER],
  };

  for (const preferredType of preferredTypes[type]) {
    const match = visibleAccounts.find(acc => acc.type === preferredType);
    if (match) return match.id;
  }

  // Fallback to first visible account
  return visibleAccounts[0]?.id ?? null;
}

/**
 * Validates that source and destination accounts are different for transfers.
 */
export function validateTransferAccounts(
  sourceAccountId: string | null,
  destinationAccountId: string | null
): void {
  if (sourceAccountId && destinationAccountId && sourceAccountId === destinationAccountId) {
    throw new Error('La cuenta origen y destino no pueden ser la misma');
  }
}

/**
 * Account type display info for UI.
 */
export interface AccountDisplayInfo {
  icon: string;
  color: string;
  label: string;
}

export function getAccountDisplayInfo(
  account: { type: AccountType; visibility: Visibility; ownerUserId: string | null },
  userId: string,
  index: number = 0
): AccountDisplayInfo {
  // Shared accounts
  if (account.visibility === Visibility.SHARED) {
    return { icon: 'Wallet', color: '#01696f', label: 'Compartida' };
  }

  // By account type
  switch (account.type) {
    case AccountType.SAVINGS:
      return { icon: 'PiggyBank', color: '#437a22', label: 'Ahorro' };
    case AccountType.CASH:
      return { icon: 'Banknote', color: '#d19900', label: 'Efectivo' };
    case AccountType.PERSONAL:
    default: {
      // Alternate colors for personal accounts
      const isOwner = account.ownerUserId === userId;
      return {
        icon: 'Building2',
        color: isOwner ? '#006494' : '#7a39bb',
        label: 'Personal',
      };
    }
  }
}

// Type guards for these enums live in enums.ts (isTransactionType, isAccountType, etc.)
// Do not redefine them here.