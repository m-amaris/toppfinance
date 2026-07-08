/**
 * Category utilities and default categories.
 * Provides category mappings, default categories, and category-related helpers.
 * The canonical DEFAULT_CATEGORIES array lives in schemas.ts.
 */

import { TransactionType } from './enums.js';
import { DEFAULT_CATEGORIES as SCHEMA_CATEGORIES } from './schemas.js';
import type { CategoryGroup } from './types.js';

/**
 * Category metadata for a specific type.
 */
export interface CategoryDefinition {
  type: TransactionType;
  slug: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * Maps API category to UI category group.
 */
export function mapApiCategory(category: {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  type: TransactionType;
}): CategoryGroup {
  return {
    id: category.slug,
    apiId: category.id,
    label: localizeCategoryName(category.name),
    icon: category.icon,
    color: category.color,
    type: category.type,
  };
}

/**
 * Localizes category names for Spanish display.
 */
export function localizeCategoryName(name: string): string {
  const replacements: Record<string, string> = {
    'Alimentacion': 'Alimentación',
    'Nomina': 'Nómina',
    'Educacion': 'Educación',
    'Otros ingresos': 'Otros',
    'Transferencia interna': 'Transferencia interna',
  };
  return replacements[name] || name;
}

/**
 * Gets category definitions by type.
 */
export function getCategoriesByType(type: TransactionType): CategoryDefinition[] {
  return SCHEMA_CATEGORIES.filter(cat => cat.type === type) as unknown as CategoryDefinition[];
}

/**
 * Gets all expense category slugs.
 */
export function getExpenseCategorySlugs(): string[] {
  return SCHEMA_CATEGORIES
    .filter(cat => cat.type === TransactionType.EXPENSE)
    .map(cat => cat.slug);
}

/**
 * Gets all income category slugs.
 */
export function getIncomeCategorySlugs(): string[] {
  return SCHEMA_CATEGORIES
    .filter(cat => cat.type === TransactionType.INCOME)
    .map(cat => cat.slug);
}

/**
 * Gets default category slug for a transaction type.
 * Used as fallback when category is not found.
 */
export function getDefaultCategorySlug(type: TransactionType): string {
  const fallbacks: Record<TransactionType, string> = {
    [TransactionType.EXPENSE]: 'otros',
    [TransactionType.INCOME]: 'otros_ingreso',
    [TransactionType.SAVING]: 'ahorro',
    [TransactionType.TRANSFER]: 'transferencia_interna',
    [TransactionType.ADJUSTMENT]: 'ajuste_manual',
  };
  return fallbacks[type];
}

/**
 * Gets category color by slug.
 */
export function getCategoryColor(slug: string): string {
  const category = SCHEMA_CATEGORIES.find(cat => cat.slug === slug);
  return category?.color ?? '#7a7974';
}

/**
 * Gets category icon by slug.
 */
export function getCategoryIcon(slug: string): string {
  const category = SCHEMA_CATEGORIES.find(cat => cat.slug === slug);
  return category?.icon ?? 'MoreHorizontal';
}

/**
 * Validates that a category slug exists for a given type.
 */
export function isValidCategoryForType(slug: string, type: TransactionType): boolean {
  return SCHEMA_CATEGORIES.some(cat => cat.slug === slug && cat.type === type);
}

/**
 * Builds category groups for UI (expense, income, saving, transfer, adjustment).
 */
export function buildCategoryGroups(categories: CategoryGroup[]) {
  return {
    gasto: categories.filter(c => c.type === TransactionType.EXPENSE),
    ingreso: categories.filter(c => c.type === TransactionType.INCOME),
    ahorro: categories.filter(c => c.type === TransactionType.SAVING),
    transferencia: categories.filter(c => c.type === TransactionType.TRANSFER),
    ajuste: categories.filter(c => c.type === TransactionType.ADJUSTMENT),
  };
}

// --- NEW: Helpers that index.ts re-exports under these names ---

/**
 * Groups DEFAULT_CATEGORIES by type.
 */
export const CATEGORIES_BY_TYPE: Record<TransactionType, Array<{ slug: string; name: string; icon: string; color: string }>> = {
  [TransactionType.EXPENSE]: [],
  [TransactionType.INCOME]: [],
  [TransactionType.SAVING]: [],
  [TransactionType.TRANSFER]: [],
  [TransactionType.ADJUSTMENT]: [],
};

// Populate
for (const cat of SCHEMA_CATEGORIES) {
  CATEGORIES_BY_TYPE[cat.type as unknown as TransactionType].push({
    slug: cat.slug,
    name: cat.name,
    icon: cat.icon,
    color: cat.color,
  });
}

/**
 * Returns the default category slug for a transaction type (alias).
 */
export const DEFAULT_CATEGORY_SLUG_BY_TYPE = getDefaultCategorySlug;

/**
 * Checks if a category slug is valid (exists in DEFAULT_CATEGORIES).
 */
export function isValidCategorySlug(slug: string): boolean {
  return SCHEMA_CATEGORIES.some(cat => cat.slug === slug);
}

/**
 * Gets the default icon for a transaction type.
 */
export function getDefaultIconForType(type: TransactionType): string {
  const slug = getDefaultCategorySlug(type);
  return getCategoryIcon(slug);
}

/**
 * Gets the default color for a transaction type.
 */
export function getDefaultColorForType(type: TransactionType): string {
  const slug = getDefaultCategorySlug(type);
  return getCategoryColor(slug);
}

/**
 * Gets the transaction type of a category by its slug.
 */
export function getCategoryTypeBySlug(slug: string): TransactionType | undefined {
  const found = SCHEMA_CATEGORIES.find(cat => cat.slug === slug);
  return found ? found.type as TransactionType : undefined;
}

/**
 * Checks if a category slug belongs to an income category.
 */
export function isIncomeCategory(slug: string): boolean {
  return CATEGORIES_BY_TYPE[TransactionType.INCOME].some(c => c.slug === slug);
}

/**
 * Checks if a category slug belongs to an expense category.
 */
export function isExpenseCategory(slug: string): boolean {
  return CATEGORIES_BY_TYPE[TransactionType.EXPENSE].some(c => c.slug === slug);
}

/**
 * Sorts categories by a predefined slug order.
 */
export function sortCategoriesForType<T extends { slug: string }>(
  categories: T[],
  order: readonly string[]
): T[] {
  const orderMap = new Map(order.map((slug, index) => [slug, index]));
  return [...categories].sort((a, b) => {
    const aIndex = orderMap.get(a.slug) ?? Number.MAX_SAFE_INTEGER;
    const bIndex = orderMap.get(b.slug) ?? Number.MAX_SAFE_INTEGER;
    return aIndex - bIndex;
  });
}

/**
 * Expense category order for UI display.
 */
export const EXPENSE_CATEGORY_ORDER = [
  'vivienda', 'servicios', 'alimentacion', 'transporte',
  'salud', 'deporte', 'ocio', 'compras',
  'educacion', 'ropa', 'viajes', 'regalos', 'otros',
] as const;

/**
 * Income category order for UI display.
 */
export const INCOME_CATEGORY_ORDER = [
  'nomina', 'freelance', 'inversiones', 'otros_ingreso',
] as const;