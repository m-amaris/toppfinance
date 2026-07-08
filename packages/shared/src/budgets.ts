/**
 * Budget utilities.
 * Business logic for monthly budgets (USER and SHARED scopes).
 * Schemas live in schemas.ts, derived types in types.ts.
 */

import { TransactionType, BudgetScope } from './enums.js';
import type { BudgetResponse } from './types.js';
import {
  budgetCategorySchema,
  createBudgetSchema,
  updateBudgetSchema,
  budgetSchema,
} from './schemas.js';

// Re-export schemas for convenience (source of truth is schemas.ts)
export { budgetCategorySchema, createBudgetSchema, updateBudgetSchema, budgetSchema };

// Alias for backwards compatibility: schemas.ts exports budgetSchema (same shape)
export { budgetSchema as budgetResponseSchema } from './schemas.js';

// Convenience type aliases re-exported from types.ts (canonical source)
import type {
  BudgetCategoryInput,
  CreateBudgetInput as CreateBudgetInputType,
  BudgetResponse as BudgetResponseType,
  CategoryResponse,
} from './types.js';
export type { BudgetCategoryInput, CreateBudgetInputType as CreateBudgetInput, BudgetResponseType as BudgetResponse };

// CategorySummary for budget responses
export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}

/**
 * Budget scope type literal.
 */
export type BudgetScopeType = 'USER' | 'SHARED';

/**
 * Budget with calculated spending (derived at query time, not from schema).
 */
export interface BudgetWithSpending extends BudgetResponse {
  categories: Array<{
    categoryId: string;
    limitAmount: number;
    category: {
      id: string;
      slug: string;
      name: string;
      icon: string;
      color: string;
      type: TransactionType;
      archived: boolean;
      householdId: string;
      createdAt: string;
      updatedAt: string;
    };
    spent: number;
    remaining: number;
    percentUsed: number;
  }>;
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
}

/**
 * Budget summary for dashboard.
 */
export interface BudgetSummary {
  month: string;
  scope: BudgetScopeType;
  ownerUserId: string | null;
  totalBudget: number;
  totalSpent: number;
  totalRemaining: number;
  categoriesOverBudget: number;
  categoriesNearLimit: number;
}

/**
 * Budget alert levels.
 */
export enum BudgetAlertLevel {
  OK = 'OK',
  WARNING = 'WARNING',   // > 80%
  CRITICAL = 'CRITICAL', // > 100%
}

/**
 * Validates budget months don't overlap for same scope/user.
 */
export function validateBudgetUniqueness(
  existingBudgets: Array<{ month: string; scope: BudgetScopeType; ownerUserId: string | null }>,
  newBudget: { month: string; scope: BudgetScopeType; ownerUserId: string | null }
): { valid: boolean; error?: string } {
  const conflict = existingBudgets.find(b =>
    b.month === newBudget.month &&
    b.scope === newBudget.scope &&
    b.ownerUserId === newBudget.ownerUserId
  );

  if (conflict) {
    const scopeLabel = newBudget.scope === 'USER' ? 'personal' : 'compartido';
    const userLabel = newBudget.ownerUserId ? 'de usuario' : '';
    return {
      valid: false,
      error: `Ya existe un presupuesto ${scopeLabel} ${userLabel} para ${formatMonthEs(newBudget.month)}`,
    };
  }

  return { valid: true };
}

/**
 * Calculates budget spending from transactions.
 */
export function calculateBudgetSpending(
  budget: BudgetResponse,
  transactions: Array<{
    categoryId: string;
    amount: number;
    type: TransactionType;
    date: string;
  }>
): BudgetWithSpending {
  const filteredTransactions = transactions.filter(tx => {
    const txMonth = tx.date.slice(0, 7);
    return txMonth === budget.month;
  });

  const categoriesWithSpending = budget.categories.map(bc => {
    const spent = filteredTransactions
      .filter(tx => tx.categoryId === bc.categoryId && tx.type === TransactionType.EXPENSE)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    const remaining = bc.limitAmount - spent;
    const percentUsed = bc.limitAmount > 0 ? (spent / bc.limitAmount) * 100 : 0;

    return {
      ...bc,
      spent: Number(spent.toFixed(2)),
      remaining: Number(remaining.toFixed(2)),
      percentUsed: Number(percentUsed.toFixed(2)),
    };
  });

  const totalBudget = categoriesWithSpending.reduce((sum, c) => sum + c.limitAmount, 0);
  const totalSpent = categoriesWithSpending.reduce((sum, c) => sum + c.spent, 0);
  const totalRemaining = totalBudget - totalSpent;

  return {
    ...budget,
    categories: categoriesWithSpending,
    totalBudget: Number(totalBudget.toFixed(2)),
    totalSpent: Number(totalSpent.toFixed(2)),
    totalRemaining: Number(totalRemaining.toFixed(2)),
  };
}

/**
 * Gets alert level for a budget category.
 */
export function getBudgetAlertLevel(percentUsed: number): BudgetAlertLevel {
  if (percentUsed >= 100) return BudgetAlertLevel.CRITICAL;
  if (percentUsed >= 80) return BudgetAlertLevel.WARNING;
  return BudgetAlertLevel.OK;
}

/**
 * Creates a budget summary from budget with spending.
 */
export function createBudgetSummary(budget: BudgetWithSpending): BudgetSummary {
  return {
    month: budget.month,
    scope: budget.scope,
    ownerUserId: budget.ownerUserId,
    totalBudget: budget.totalBudget,
    totalSpent: budget.totalSpent,
    totalRemaining: budget.totalRemaining,
    categoriesOverBudget: budget.categories.filter(c => c.percentUsed >= 100).length,
    categoriesNearLimit: budget.categories.filter(c => c.percentUsed >= 80 && c.percentUsed < 100).length,
  };
}

/**
 * Generates default budget categories for a scope.
 */
export function getDefaultBudgetCategories(
  scope: BudgetScopeType,
  allCategories: Array<{ id: string; slug: string; name: string; type: TransactionType }>
): Array<{ categoryId: string; limitAmount: number }> {
  const expenseCategories = allCategories.filter(c => c.type === TransactionType.EXPENSE);

  const defaultLimits: Record<string, number> = {
    vivienda: 900,
    servicios: 120,
    alimentacion: 250,
    transporte: 150,
    salud: 100,
    deporte: 90,
    ocio: 120,
    compras: 130,
    educacion: 50,
    ropa: 60,
    viajes: 150,
    regalos: 50,
    otros: 40,
  };

  return expenseCategories
    .filter(c => c.slug in defaultLimits)
    .map(c => ({
      categoryId: c.id,
      limitAmount: defaultLimits[c.slug] ?? 100,
    }));
}

/**
 * Formats month for Spanish display.
 */
function formatMonthEs(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('es-ES', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}