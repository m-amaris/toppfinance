/**
 * All Zod schemas consolidated in one place.
 * These define the contract between API and frontend, and validate all inputs.
 */

import { z } from 'zod';
import {
  TransactionType,
  Visibility,
  AccountType,
  BudgetScope,
  UserRole,
  ImportStatus,
  LogLevel,
  LogCategory,
  BackupStatus,
  DataCollection,
  BackupFrequency,
} from './enums.js';

/**
 * ===========================================
 * Base type schemas (Prisma enum mirrors)
 * ===========================================
 */
export const userRoleSchema = z.nativeEnum(UserRole);
export const accountTypeSchema = z.nativeEnum(AccountType);
export const visibilitySchema = z.nativeEnum(Visibility);
export const transactionTypeSchema = z.nativeEnum(TransactionType);
export const budgetScopeSchema = z.nativeEnum(BudgetScope);
export const importStatusSchema = z.nativeEnum(ImportStatus);
export const logLevelSchema = z.nativeEnum(LogLevel);
export const logCategorySchema = z.nativeEnum(LogCategory);
export const backupStatusSchema = z.nativeEnum(BackupStatus);
export const dataCollectionSchema = z.nativeEnum(DataCollection);
export const backupFrequencySchema = z.nativeEnum(BackupFrequency);

/**
 * ===========================================
 * Money & date utilities (schema level)
 * ===========================================
 */
export const moneySchema = z.number().finite().multipleOf(0.01);
export const percentSchema = z.number().min(0).max(100).multipleOf(0.01);
export const positiveIntSchema = z.number().int().positive();
export const nonNegativeIntSchema = z.number().int().nonnegative();

export const isoDateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const isoDateTimeStringSchema = z.string().datetime();

/**
 * ===========================================
 * Split / beneficiary schemas
 * ===========================================
 */
export const splitPartSchema = z.object({
  userId: z.string().min(1),
  percent: percentSchema,
});

export const beneficiarySplitSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().optional(),
  percent: percentSchema,
  amount: z.number().nullable().optional(),
});

/**
 * ===========================================
 * Transaction schemas
 * ===========================================
 */
export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  date: isoDateStringSchema,
  amount: moneySchema,
  description: z.string().trim().min(1).max(240),
  categoryId: z.string().min(1),
  sourceAccountId: z.string().min(1).optional().nullable(),
  destinationAccountId: z.string().min(1).optional().nullable(),
  visibility: visibilitySchema,
  paidByUserId: z.string().min(1).optional().nullable(),
  beneficiarySplits: z.array(splitPartSchema).min(1),
  merchantName: z.string().trim().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
  // Import idempotency: bank/external transaction id carried by the CSV draft.
  // Optional for manual transactions; required semantics handled by the import pipeline.
  externalId: z.string().trim().min(1).max(200).optional().nullable(),
});

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  beneficiarySplits: z.array(splitPartSchema).min(1).optional(),
});

export const transactionFiltersSchema = z.object({
  from: isoDateStringSchema.optional(),
  to: isoDateStringSchema.optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  visibility: visibilitySchema.optional(),
});

/**
 * ===========================================
 * Account schemas
 * ===========================================
 */
export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: accountTypeSchema,
  visibility: visibilitySchema,
  openingBalance: moneySchema.default(0),
  currency: z.string().length(3).default('EUR'),
  ownerUserId: z.string().optional().nullable(),
});

export const updateAccountSchema = createAccountSchema.partial();

export const accountWithBalanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: accountTypeSchema,
  visibility: visibilitySchema,
  ownerUserId: z.string().nullable(),
  ownerName: z.string().nullable(),
  openingBalance: moneySchema,
  balance: moneySchema,
  currency: z.string(),
  archived: z.boolean(),
});

/**
 * ===========================================
 * Category schemas
 * ===========================================
 */
export const createCategorySchema = z.object({
  type: transactionTypeSchema,
  slug: z.string().trim().min(1).max(60).toLowerCase(),
  name: z.string().trim().min(1).max(80),
  icon: z.string().trim().min(1).max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const updateCategorySchema = createCategorySchema.partial().extend({
  archived: z.boolean().optional(),
});

export const categorySchema = z.object({
  id: z.string(),
  householdId: z.string(),
  type: transactionTypeSchema,
  slug: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  archived: z.boolean(),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});

/**
 * ===========================================
 * Budget schemas
 * ===========================================
 */
export const budgetCategorySchema = z.object({
  categoryId: z.string().min(1),
  limitAmount: moneySchema.min(0),
});

export const createBudgetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  scope: budgetScopeSchema,
  ownerUserId: z.string().min(1).optional().nullable(),
  categories: z.array(budgetCategorySchema).min(1),
});

export const updateBudgetSchema = createBudgetSchema.partial();

export const budgetSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  month: z.string(),
  scope: budgetScopeSchema,
  ownerUserId: z.string().nullable(),
  categories: z.array(budgetCategorySchema.extend({ category: categorySchema })),
  createdAt: isoDateTimeStringSchema,
  updatedAt: isoDateTimeStringSchema,
});

/**
 * ===========================================
 * Merchant schemas
 * ===========================================
 */
export const merchantSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  normalizedName: z.string(),
  createdAt: isoDateTimeStringSchema,
});

/**
 * ===========================================
 * Tag schemas
 * ===========================================
 */
export const tagSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string(),
  createdAt: isoDateTimeStringSchema,
});

/**
 * ===========================================
 * Settings schemas
 * ===========================================
 */
export const sharedSplitSchema = z.object({
  miguelPercent: percentSchema,
  saraPercent: percentSchema,
}).refine(data => Math.abs(data.miguelPercent + data.saraPercent - 100) <= 0.01, {
  message: 'El reparto global debe sumar 100%',
  path: ['saraPercent'],
});

export const aiSettingsSchema = z.object({
  defaultModel: z.string().trim().min(1),
  fallbackModels: z.array(z.string().trim().min(1)).default([]),
  enforceZdr: z.boolean().default(true),
  dataCollection: dataCollectionSchema.default(DataCollection.DENY),
});

export const backupPolicySchema = z.object({
  frequency: backupFrequencySchema.default(BackupFrequency.WEEKLY),
  retentionWeeks: z.number().int().min(1).max(260).default(30),
  backupDir: z.string().trim().min(1).default('./backups'),
});

/**
 * ===========================================
 * Import schemas
 * ===========================================
 */
export const csvPreviewBodySchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  content: z.string().min(1),
  defaultSourceAccountId: z.string().optional().nullable(),
  defaultDestinationAccountId: z.string().optional().nullable(),
});

export const csvCommitBodySchema = z.object({
  includeDuplicates: z.boolean().default(false),
  rows: z.array(z.object({
    rowNumber: positiveIntSchema,
    sourceHash: z.string().min(16),
    draft: createTransactionSchema,
  })).min(1),
});

export const importBatchSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  importedById: z.string(),
  fileName: z.string(),
  status: importStatusSchema,
  warningsCount: nonNegativeIntSchema,
  rowsCount: nonNegativeIntSchema,
  createdAt: isoDateTimeStringSchema,
  committedAt: isoDateTimeStringSchema.nullable(),
});

/**
 * ===========================================
 * Auth schemas
 * ===========================================
 */
export const loginBodySchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  email: z.string().email(),
  displayName: z.string(),
  role: userRoleSchema,
});

export const householdSchema = z.object({
  id: z.string(),
  name: z.string(),
});

/**
 * ===========================================
 * Log schemas
 * ===========================================
 */
export const appLogInputSchema = z.object({
  householdId: z.string().optional().nullable(),
  level: logLevelSchema,
  category: logCategorySchema,
  message: z.string().min(1).max(2000),
  metadata: z.record(z.unknown()).optional(),
});

export const auditLogInputSchema = z.object({
  householdId: z.string(),
  actorUserId: z.string().optional().nullable(),
  entity: z.string().min(1).max(100),
  entityId: z.string().optional().nullable(),
  action: z.string().min(1).max(100),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * ===========================================
 * AI schemas
 * ===========================================
 */
export const openRouterMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1),
});

export const callOpenRouterInputSchema = z.object({
  settings: aiSettingsSchema.partial().optional(),
  messages: z.array(openRouterMessageSchema).min(1),
  responseSchema: z.record(z.unknown()).optional(),
});

/**
 * ===========================================
 * Backup schemas
 * ===========================================
 */
export const backupRunSchema = z.object({
  id: z.string(),
  householdId: z.string().nullable(),
  status: backupStatusSchema,
  filePath: z.string().nullable(),
  sizeBytes: z.bigint().nullable(),
  checksum: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: isoDateTimeStringSchema,
  finishedAt: isoDateTimeStringSchema.nullable(),
});

/**
 * ===========================================
 * Export schemas
 * ===========================================
 */
export const exportCsvRowSchema = z.tuple([
  isoDateStringSchema,           // date
  transactionTypeSchema,         // type
  moneySchema,                   // amount_eur
  z.string(),                    // description
  z.string(),                    // source_account
  z.string(),                    // destination_account
  z.string(),                    // category
  visibilitySchema,              // visibility
  z.string().email(),            // paid_by_email
  z.string(),                    // beneficiary_split
  z.string(),                    // merchant
  z.string(),                    // tags
  z.string(),                    // notes
]);

/**
 * ===========================================
 * Response envelope schemas
 * ===========================================
 */
export const apiErrorSchema = z.object({
  error: z.string(),
  details: z.array(z.object({
    path: z.array(z.union([z.string(), z.number()])),
    message: z.string(),
  })).optional(),
});

export const apiSuccessSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  });

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: nonNegativeIntSchema,
    page: positiveIntSchema,
    pageSize: positiveIntSchema,
    totalPages: nonNegativeIntSchema,
  });

/**
 * ===========================================
 * Generic route schemas (params, bodies)
 * ===========================================
 */

export const entityIdParamsSchema = z.object({
  id: z.string().min(1),
});

export const aiInsightsBodySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const adminChangePasswordBodySchema = z.object({
  password: z.string().min(12),
});

/**
 * ===========================================
 * Default values / constants
 * ===========================================
 */
export const DEFAULT_CATEGORIES = [
  { type: 'EXPENSE' as const, slug: 'vivienda', name: 'Vivienda', icon: 'Home', color: '#01696f' },
  { type: 'EXPENSE' as const, slug: 'servicios', name: 'Servicios', icon: 'Bolt', color: '#0f766e' },
  { type: 'EXPENSE' as const, slug: 'alimentacion', name: 'Alimentación', icon: 'ShoppingCart', color: '#437a22' },
  { type: 'EXPENSE' as const, slug: 'transporte', name: 'Transporte', icon: 'Car', color: '#006494' },
  { type: 'EXPENSE' as const, slug: 'salud', name: 'Salud', icon: 'Heart', color: '#964219' },
  { type: 'EXPENSE' as const, slug: 'deporte', name: 'Deporte', icon: 'Dumbbell', color: '#1d4ed8' },
  { type: 'EXPENSE' as const, slug: 'ocio', name: 'Ocio', icon: 'Gamepad2', color: '#d19900' },
  { type: 'EXPENSE' as const, slug: 'compras', name: 'Compras', icon: 'Package', color: '#7a39bb' },
  { type: 'EXPENSE' as const, slug: 'educacion', name: 'Educación', icon: 'GraduationCap', color: '#a13544' },
  { type: 'EXPENSE' as const, slug: 'ropa', name: 'Ropa', icon: 'Shirt', color: '#da7101' },
  { type: 'EXPENSE' as const, slug: 'viajes', name: 'Viajes', icon: 'Plane', color: '#0891b2' },
  { type: 'EXPENSE' as const, slug: 'regalos', name: 'Regalos', icon: 'Gift', color: '#be185d' },
  { type: 'EXPENSE' as const, slug: 'otros', name: 'Otros', icon: 'MoreHorizontal', color: '#7a7974' },
  { type: 'INCOME' as const, slug: 'nomina', name: 'Nómina', icon: 'Briefcase', color: '#01696f' },
  { type: 'INCOME' as const, slug: 'freelance', name: 'Freelance', icon: 'Code2', color: '#437a22' },
  { type: 'INCOME' as const, slug: 'inversiones', name: 'Inversiones', icon: 'TrendingUp', color: '#006494' },
  { type: 'INCOME' as const, slug: 'otros_ingreso', name: 'Otros ingresos', icon: 'Plus', color: '#7a7974' },
  { type: 'SAVING' as const, slug: 'ahorro', name: 'Ahorro', icon: 'PiggyBank', color: '#01696f' },
  { type: 'TRANSFER' as const, slug: 'transferencia_interna', name: 'Transferencia interna', icon: 'ArrowLeftRight', color: '#0f766e' },
  { type: 'ADJUSTMENT' as const, slug: 'ajuste_manual', name: 'Ajuste manual', icon: 'Scale', color: '#7a7974' },
] as const;

export const DEFAULT_SHARED_SPLIT = {
  miguelPercent: 50,
  saraPercent: 50,
} as const;

// DEFAULT_CURRENCY is defined in currency.ts (single source of truth).
export const DEFAULT_LOCALE = 'es-ES' as const;