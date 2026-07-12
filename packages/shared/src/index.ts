/**
 * @toppfinance/shared - Main barrel export
 *
 * This package contains all shared types, schemas, utilities, and contracts
 * used across the ToppFinance monorepo (API and Web).
 *
 * CONVENTION:
 * - Zod schemas: exported ONLY from './schemas.js'
 * - TypeScript types: exported ONLY from './types.js'
 * - Enums & type guards: exported ONLY from './enums.js'
 * - Domain utilities: exported from their respective files
 *   (they should NOT re-export schemas or types that live in schemas.ts/types.ts)
 */

// ─── Enums ──────────────────────────────────────────────────────────────────────
export {
  UserRole,
  AccountType,
  Visibility,
  TransactionType,
  BudgetScope,
  ImportStatus,
  ImportClassification,
  LogLevel,
  LogCategory,
  BackupStatus,
  TransactionCategoryType,
  DataCollection,
  BackupFrequency,
  isTransactionType,
  isVisibility,
  isAccountType,
  isBudgetScope,
  isUserRole,
  isImportStatus,
  isImportClassification,
  isLogLevel,
  isLogCategory,
  isBackupStatus,
  isDataCollection,
  isBackupFrequency,
} from './enums.js';

// ─── Zod schemas (single source of truth) ─────────────────────────────────────
export {
  userRoleSchema,
  accountTypeSchema,
  visibilitySchema,
  transactionTypeSchema,
  budgetScopeSchema,
  importStatusSchema,
  logLevelSchema,
  logCategorySchema,
  backupStatusSchema,
  dataCollectionSchema,
  backupFrequencySchema,
  moneySchema,
  percentSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  isoDateStringSchema,
  isoDateTimeStringSchema,
  splitPartSchema,
  beneficiarySplitSchema,
  createTransactionSchema,
  updateTransactionSchema,
  transactionFiltersSchema,
  createAccountSchema,
  updateAccountSchema,
  accountWithBalanceSchema,
  createCategorySchema,
  updateCategorySchema,
  categorySchema,
  budgetCategorySchema,
  createBudgetSchema,
  updateBudgetSchema,
  budgetSchema,
  merchantSchema,
  tagSchema,
  sharedSplitSchema,
  aiSettingsSchema,
  backupPolicySchema,
  csvPreviewBodySchema,
  csvCommitBodySchema,
  importBatchSchema,
  loginBodySchema,
  sessionUserSchema,
  householdSchema,
  appLogInputSchema,
  auditLogInputSchema,
  openRouterMessageSchema,
  callOpenRouterInputSchema,
  backupRunSchema,
  exportCsvRowSchema,
  apiErrorSchema,
  apiSuccessSchema,
  paginatedResponseSchema,
  entityIdParamsSchema,
  aiInsightsBodySchema,
  adminChangePasswordBodySchema,
  DEFAULT_CATEGORIES,
  DEFAULT_SHARED_SPLIT,
  DEFAULT_LOCALE,
} from './schemas.js';

// ─── TypeScript types (single source of truth) ────────────────────────────────
export type {
  Money,
  Percent,
  PositiveInt,
  NonNegativeInt,
  IsoDateString,
  IsoDateTimeString,
  SplitPart,
  BeneficiarySplit,
  CreateTransactionInput,
  UpdateTransactionInput,
  TransactionFilters,
  TransactionResponse,
  CreateAccountInput,
  UpdateAccountInput,
  AccountWithBalanceResponse,
  CreateCategoryInput,
  UpdateCategoryInput,
  CategoryResponse,
  BudgetCategoryInput,
  CreateBudgetInput,
  UpdateBudgetInput,
  BudgetResponse,
  MerchantResponse,
  TagResponse,
  SharedSplit,
  AiSettings,
  BackupPolicy,
  CsvPreviewBody,
  CsvCommitBody,
  ImportBatchResponse,
  LoginBody,
  SessionUserResponse,
  HouseholdResponse,
  AppLogInput,
  AuditLogInput,
  OpenRouterMessage,
  CallOpenRouterInput,
  AiResponse,
  BackupRunResponse,
  ExportCsvRow,
  ApiError,
  ApiErrorDetails,
  DefaultCategory,
  EntityIdParams,
  AiInsightsBody,
  AdminChangePasswordBody,
  LocalTransactionType,
  CategoryGroup,
  AccountForUI,
  BudgetForUI,
  ConfiguracionUI,
  PatrimonioMensual,
  MonthStats,
  YearStats,
  TransactionForUI,
} from './types.js';

// ─── Money utilities ──────────────────────────────────────────────────────────
export {
  toMoney,
  toCents,
  fromCents,
  addMoney,
  subtractMoney,
  multiplyMoney,
  divideMoney,
  percentOf,
  formatMoney,
  formatMoneyPlain,
  parseMoney,
  isValidMoney,
  sumMoney,
  absMoney,
  clampMoney,
  compareMoney,
  bankersRound,
  normalizeMoneyInput,
  parseCsvMoney,
  sameMoney,
  allocateByPercent,
  centsToDisplay,
} from './money.js';

// ─── Currency utilities ───────────────────────────────────────────────────────
export {
  DEFAULT_CURRENCY,
  SUPPORTED_CURRENCIES,
  isCurrencySupported,
  normalizeCurrency,
  assertCurrencySupported,
  isDefaultCurrency,
  getDefaultCurrency,
  CURRENCY_INFO,
  getCurrencyInfo,
} from './currency.js';
export type { CurrencyCode, CurrencyInfo } from './currency.js';

// ─── Date utilities ───────────────────────────────────────────────────────────
export {
  dateOnly,
  dateOnlyFromDate,
  todayIso,
  currentMonthKey,
  toIsoDateString,
  toIsoMonthString,
  monthKeyFromDate,
  parseDateValue,
  addMonths,
  startOfMonth,
  endOfMonth,
  rangeMonths,
  previousMonth,
  nextMonth,
  isValidIsoDate,
  isValidIsoMonth,
  formatDateEs,
  formatMonthEs,
  formatMonthShortEs,
  daysInMonth,
  getWeekNumber,
  startOfWeek,
  endOfWeek,
} from './date.js';

// ─── Visibility & access control ──────────────────────────────────────────────
export {
  canSeeTransaction,
  accountVisibilityWhere,
  transactionVisibilityWhere,
  categoryVisibilityWhere,
  budgetVisibilityWhere,
  canEditTransaction,
  canDeleteTransaction,
  canEditCategory,
  canEditAccount,
  canEditBudget,
  isAdmin,
  inferVisibility,
  validateVisibilityForTransaction,
} from './visibility.js';

// ─── Account utilities ────────────────────────────────────────────────────────
export {
  buildAccountEntries,
  calculateAccountBalance,
  validateAccountAccess,
  getDefaultAccountForType,
  validateTransferAccounts,
  getAccountDisplayInfo,
} from './accounts.js';

// ─── Split utilities ──────────────────────────────────────────────────────────
export {
  assertSplitTotal,
  normalizeSplits,
  equalSplits,
  findUser,
  parseBeneficiarySplits,
  defaultSplits,
  calculateSplitAmounts,
  validateSplitUsers,
  normalizeText,
  makeSourceHash,
  getSplitRequirement,
} from './splits.js';
export type { SplitUser, SharedSplitConfig, TransactionSplitRequirement } from './splits.js';

// ─── CSV import utilities ─────────────────────────────────────────────────────
export {
  csvCommitParamsSchema,
  CSV_COLUMN_ALIASES,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_LOCAL_KEY,
  LOCAL_KEY_TO_TRANSACTION_TYPE,
  FALLBACK_CATEGORY_BY_TYPE,
  detectDelimiter,
  parseCsv,
  parseCsvRows,
  pick,
  parseTypeValue,
  parseVisibilityValue,
  splitTags,
  findCategory,
  findAccount,
  normalizeCsvRow,
  buildImportDraft,
  computeImportFingerprint,
  classifyImportRow,
  buildPreviewRows,
  validateCommitBody,
  transactionsToCsv,
} from './csv.js';
export type {
  CsvRecord,
  ImportDraft,
  CsvPreviewRow,
  BuildPreviewRowsInput,
  BuildPreviewRowsOutput,
  NormalizedImportRow,
  ReconciliationDecision,
  ClassifiedImportRow,
  ImportClassificationContext,
  ImportSuggestedAction,
  BuildImportDraftInput,
  BuildImportDraftResult,
} from './csv.js';

// ─── AI utilities ─────────────────────────────────────────────────────────────
export {
  defaultAiSettings,
  callOpenRouter,
  anonymizeTransactions,
  buildInsightsSystemPrompt,
  buildInsightsUserPrompt,
  validateAiSettings,
  buildModelsArray,
} from './ai.js';
export type { OpenRouterResponse } from './ai.js';

// ─── Auth helpers ─────────────────────────────────────────────────────────────
export {
  SESSION_CONFIG,
  getUser,
  isAdmin as isAdminAuth,
  belongsToHousehold,
} from './auth.js';
export type { AuthUser, SessionCookieOptions } from './auth.js';

// ─── Config schemas ───────────────────────────────────────────────────────────
export {
  envSchema,
  parseFallbackModels,
  parseCorsOrigins,
  publicConfigSchema,
  adminSettingsSchema,
  DEFAULT_ADMIN_SETTINGS,
} from './config.js';
export type { Config, PublicConfig, AdminSettings } from './config.js';

// ─── Logging helpers ──────────────────────────────────────────────────────────
export {
  createChildLogger,
  sanitizeMetadata,
  LOG_LEVEL_ORDER,
  shouldLog,
} from './logging.js';
export type { AppLogEntry, AuditLogEntry, LogFilters, Logger } from './logging.js';

// ─── Security utilities ───────────────────────────────────────────────────────
export {
  createSessionToken,
  createSecureToken,
  hashToken,
  hashIp,
  hashPassword,
  verifyPassword,
  secureCompare,
  generateApiKey,
  hashApiKey,
  checkPasswordStrength,
  generateCsrfToken,
  validateCsrfToken,
} from './security.js';
export type { PasswordStrength } from './security.js';

// ─── Category utilities ───────────────────────────────────────────────────────
export {
  CATEGORIES_BY_TYPE,
  DEFAULT_CATEGORY_SLUG_BY_TYPE,
  mapApiCategory,
  localizeCategoryName,
  isValidCategorySlug,
  getDefaultIconForType,
  getDefaultColorForType,
  getCategoryTypeBySlug,
  isIncomeCategory,
  isExpenseCategory,
  sortCategoriesForType,
  getDefaultCategorySlug,
  getCategoryColor,
  getCategoryIcon,
  EXPENSE_CATEGORY_ORDER,
  INCOME_CATEGORY_ORDER,
} from './categories.js';
export type { CategoryDefinition } from './categories.js';

// ─── Budget utilities ─────────────────────────────────────────────────────────
export {
  BudgetAlertLevel,
  validateBudgetUniqueness,
  calculateBudgetSpending,
  getBudgetAlertLevel,
  createBudgetSummary,
  getDefaultBudgetCategories,
} from './budgets.js';
export type { BudgetScopeType, BudgetWithSpending, BudgetSummary, CategorySummary } from './budgets.js';

// ─── Re-export commonly used Zod ──────────────────────────────────────────────
export { z } from 'zod';

// ─── Version ──────────────────────────────────────────────────────────────────
export const VERSION = '0.1.0';