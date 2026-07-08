/**
 * Visibility and access control utilities.
 * Centralizes all privacy rules for the two-user household model.
 */

import type { Prisma } from '@prisma/client';
import { Visibility, TransactionType } from './enums.js';

/**
 * User identifier type
 */
export type UserId = string;

/**
 * Check if a user can see a transaction based on visibility rules.
 * Rules:
 * - SHARED transactions are visible to both users
 * - PRIVATE transactions are visible only to:
 *   - The creator (createdByUserId)
 *   - The payer (paidByUserId)
 *   - Any beneficiary (beneficiaryIds)
 */
export function canSeeTransaction(input: {
  visibility: Visibility;
  createdByUserId: UserId;
  paidByUserId: UserId | null;
  beneficiaryIds: UserId[];
  userId: UserId;
}): boolean {
  return (
    input.visibility === Visibility.SHARED ||
    input.createdByUserId === input.userId ||
    input.paidByUserId === input.userId ||
    input.beneficiaryIds.includes(input.userId)
  );
}

/**
 * Prisma where clause for accounts visible to a user.
 * Accounts are visible if:
 * - They are SHARED
 * - The user is the owner (ownerUserId)
 */
export function accountVisibilityWhere(
  userId: UserId,
  householdId: string
): Prisma.AccountWhereInput {
  return {
    householdId,
    OR: [
      { visibility: Visibility.SHARED },
      { ownerUserId: userId },
    ],
  };
}

/**
 * Prisma where clause for transactions visible to a user.
 * Transactions are visible if:
 * - They are SHARED
 * - The user created them (createdByUserId)
 * - The user paid for them (paidByUserId)
 * - The user is a beneficiary
 */
export function transactionVisibilityWhere(
  userId: UserId,
  householdId: string
): Prisma.TransactionWhereInput {
  return {
    householdId,
    OR: [
      { visibility: Visibility.SHARED },
      { createdByUserId: userId },
      { paidByUserId: userId },
      { beneficiaries: { some: { userId } } },
    ],
  };
}

/**
 * Prisma where clause for categories visible to a user.
 * All categories in the household are visible to both users.
 * (Categories are not user-private)
 */
export function categoryVisibilityWhere(householdId: string): Prisma.CategoryWhereInput {
  return { householdId, archived: false };
}

/**
 * Prisma where clause for budgets visible to a user.
 * - USER scope budgets: visible only to ownerUserId
 * - SHARED scope budgets: visible to both users
 */
export function budgetVisibilityWhere(
  userId: UserId,
  householdId: string
): Prisma.BudgetWhereInput {
  return {
    householdId,
    OR: [
      { scope: 'SHARED' },
      { scope: 'USER', ownerUserId: userId },
    ],
  };
}

/**
 * Check if a user can edit a transaction.
 * Users can only edit their own created transactions.
 */
export function canEditTransaction(
  createdByUserId: UserId,
  userId: UserId
): boolean {
  return createdByUserId === userId;
}

/**
 * Check if a user can delete a transaction.
 * Users can only delete their own created transactions.
 * (Admins can delete any - handled at route level)
 */
export function canDeleteTransaction(
  createdByUserId: UserId,
  userId: UserId
): boolean {
  return createdByUserId === userId;
}

/**
 * Check if a user can edit a category.
 * Both users can edit any category (categories are shared configuration).
 */
export function canEditCategory(): boolean {
  return true;
}

/**
 * Check if a user can edit an account.
 * Users can edit their own accounts and shared accounts.
 */
export function canEditAccount(
  accountOwnerId: UserId | null,
  accountVisibility: Visibility,
  userId: UserId
): boolean {
  return accountVisibility === Visibility.SHARED || accountOwnerId === userId;
}

/**
 * Check if a user can edit a budget.
 * - USER scope: only the owner
 * - SHARED scope: both users
 */
export function canEditBudget(
  scope: 'USER' | 'SHARED',
  ownerUserId: UserId | null,
  userId: UserId
): boolean {
  return scope === 'SHARED' || ownerUserId === userId;
}

/**
 * Check if a user is an admin.
 */
export function isAdmin(role: 'ADMIN' | 'MEMBER'): boolean {
  return role === 'ADMIN';
}

/**
 * Get the appropriate visibility for a new transaction.
 * - If paidByUserId is the current user and no other beneficiaries: PRIVATE
 * - If there are multiple beneficiaries or explicitly shared: SHARED
 */
export function inferVisibility(input: {
  paidByUserId: UserId | null;
  beneficiarySplits: Array<{ userId: UserId; percent: number }>;
  currentUserId: UserId;
}): Visibility {
  // If only the current user is involved, it's private
  const uniqueBeneficiaries = new Set(
    input.beneficiarySplits.map(s => s.userId)
  );

  if (
    uniqueBeneficiaries.size === 1 &&
    uniqueBeneficiaries.has(input.currentUserId) &&
    input.paidByUserId === input.currentUserId
  ) {
    return Visibility.PRIVATE;
  }

  return Visibility.SHARED;
}

/**
 * Validates that a visibility value is allowed for a transaction type.
 * Some transaction types might have restrictions (e.g., transfers between
 * personal accounts of different users must be SHARED).
 */
export function validateVisibilityForTransaction(
  type: TransactionType,
  visibility: Visibility,
  sourceAccountOwnerId: UserId | null,
  destinationAccountOwnerId: UserId | null,
  currentUserId: UserId
): { valid: boolean; error?: string } {
  // TRANSFER between different users' personal accounts must be SHARED
  if (
    type === TransactionType.TRANSFER &&
    sourceAccountOwnerId &&
    destinationAccountOwnerId &&
    sourceAccountOwnerId !== destinationAccountOwnerId &&
    visibility === Visibility.PRIVATE
  ) {
    return {
      valid: false,
      error: 'Las transferencias entre cuentas de diferentes usuarios deben ser compartidas',
    };
  }

  // SAVING to another user's account must be SHARED
  if (
    type === TransactionType.SAVING &&
    destinationAccountOwnerId &&
    destinationAccountOwnerId !== currentUserId &&
    visibility === Visibility.PRIVATE
  ) {
    return {
      valid: false,
      error: 'Los ahorros en cuentas de otro usuario deben ser compartidos',
    };
  }

  return { valid: true };
}

/**
 * Type guard for Visibility enum.
 */
export function isVisibility(value: string): value is Visibility {
  return Object.values(Visibility).includes(value as Visibility);
}