/**
 * All TypeScript types consolidated in one place.
 * These are derived from Zod schemas for type safety across the monorepo.
 */

import { z } from 'zod';
import * as schemas from './schemas.js';
import { TransactionType, Visibility } from './enums.js';

/**
 * ===========================================
 * Enums (re-exported for convenience)
 * ===========================================
 */
export * from './enums.js';

/**
 * ===========================================
 * Base primitive types
 * ===========================================
 */
export type Money = z.infer<typeof schemas.moneySchema>;
export type Percent = z.infer<typeof schemas.percentSchema>;
export type PositiveInt = z.infer<typeof schemas.positiveIntSchema>;
export type NonNegativeInt = z.infer<typeof schemas.nonNegativeIntSchema>;
export type IsoDateString = z.infer<typeof schemas.isoDateStringSchema>;
export type IsoDateTimeString = z.infer<typeof schemas.isoDateTimeStringSchema>;

/**
 * ===========================================
 * Split / beneficiary types
 * ===========================================
 */
export type SplitPart = z.infer<typeof schemas.splitPartSchema>;
export type BeneficiarySplit = z.infer<typeof schemas.beneficiarySplitSchema>;

/**
 * ===========================================
 * Transaction types
 * ===========================================
 */
export type CreateTransactionInput = z.infer<typeof schemas.createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof schemas.updateTransactionSchema>;
export type TransactionFilters = z.infer<typeof schemas.transactionFiltersSchema>;

export type TransactionResponse = z.infer<typeof schemas.createTransactionSchema> & {
  id: string;
  householdId: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
  beneficiaries: BeneficiarySplit[];
  tags: string[];
  category?: CategoryResponse | null;
  merchant?: MerchantResponse | null;
  sourceAccount?: AccountWithBalanceResponse | null;
  destinationAccount?: AccountWithBalanceResponse | null;
  paidByUser?: SessionUserResponse | null;
};

/**
 * ===========================================
 * Account types
 * ===========================================
 */
export type CreateAccountInput = z.infer<typeof schemas.createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof schemas.updateAccountSchema>;
export type AccountWithBalanceResponse = z.infer<typeof schemas.accountWithBalanceSchema>;

/**
 * ===========================================
 * Category types
 * ===========================================
 */
export type CreateCategoryInput = z.infer<typeof schemas.createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof schemas.updateCategorySchema>;
export type CategoryResponse = z.infer<typeof schemas.categorySchema>;

/**
 * ===========================================
 * Budget types
 * ===========================================
 */
export type BudgetCategoryInput = z.infer<typeof schemas.budgetCategorySchema>;
export type CreateBudgetInput = z.infer<typeof schemas.createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof schemas.updateBudgetSchema>;
export type BudgetResponse = z.infer<typeof schemas.budgetSchema>;

/**
 * ===========================================
 * Merchant types
 * ===========================================
 */
export type MerchantResponse = z.infer<typeof schemas.merchantSchema>;

/**
 * ===========================================
 * Tag types
 * ===========================================
 */
export type TagResponse = z.infer<typeof schemas.tagSchema>;

/**
 * ===========================================
 * Settings types
 * ===========================================
 */
export type SharedSplit = z.infer<typeof schemas.sharedSplitSchema>;
export type AiSettings = z.infer<typeof schemas.aiSettingsSchema>;
export type BackupPolicy = z.infer<typeof schemas.backupPolicySchema>;
export type SettingsResponse = {
  locale: string;
  currency: string;
  sharedSplit: SharedSplit;
  aiSettings: AiSettings;
  backupPolicy: BackupPolicy;
};

/**
 * ===========================================
 * Import types
 * ===========================================
 */
export type CsvPreviewBody = z.infer<typeof schemas.csvPreviewBodySchema>;
export type CsvCommitBody = z.infer<typeof schemas.csvCommitBodySchema>;
export type ImportBatchResponse = z.infer<typeof schemas.importBatchSchema>;

/**
 * ===========================================
 * Auth types
 * ===========================================
 */
export type LoginBody = z.infer<typeof schemas.loginBodySchema>;
export type SessionUserResponse = z.infer<typeof schemas.sessionUserSchema>;
export type HouseholdResponse = z.infer<typeof schemas.householdSchema>;

/**
 * ===========================================
 * Log types
 * ===========================================
 */
export type AppLogInput = z.infer<typeof schemas.appLogInputSchema>;
export type AuditLogInput = z.infer<typeof schemas.auditLogInputSchema>;

/**
 * ===========================================
 * AI types
 * ===========================================
 */
export type OpenRouterMessage = z.infer<typeof schemas.openRouterMessageSchema>;
export type CallOpenRouterInput = z.infer<typeof schemas.callOpenRouterInputSchema>;

export type AiResponse = {
  content: string;
  modelUsed?: string;
  promptTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
};

/**
 * ===========================================
 * Backup types
 * ===========================================
 */
export type BackupRunResponse = z.infer<typeof schemas.backupRunSchema>;

/**
 * ===========================================
 * Export types
 * ===========================================
 */
export type ExportCsvRow = z.infer<typeof schemas.exportCsvRowSchema>;

/**
 * ===========================================
 * Generic route types (params, bodies)
 * ===========================================
 */
export type EntityIdParams = z.infer<typeof schemas.entityIdParamsSchema>;
export type AiInsightsBody = z.infer<typeof schemas.aiInsightsBodySchema>;
export type AdminChangePasswordBody = z.infer<typeof schemas.adminChangePasswordBodySchema>;

/**
 * ===========================================
 * Response envelope types
 * ===========================================
 */
export type ApiError = z.infer<typeof schemas.apiErrorSchema>;
export type ApiErrorDetails = NonNullable<ApiError['details']>[number];

/**
 * ===========================================
 * Default categories (for UI seed)
 * ===========================================
 */
export type DefaultCategory = (typeof schemas.DEFAULT_CATEGORIES)[number];

/**
 * ===========================================
 * UI-specific types (derived from API types)
 * ===========================================
 */
export type LocalTransactionType = 'gasto' | 'ingreso' | 'ahorro' | 'transferencia' | 'ajuste';

export type CategoryGroup = {
  id: string;
  apiId?: string;
  label: string;
  icon: string;
  color: string;
  type: TransactionType;
};

export type AccountForUI = {
  id: string;
  apiId?: string;
  nombre: string;
  tipo: 'personal' | 'compartida' | 'ahorro' | 'efectivo';
  saldo: number;
  icono: string;
  color: string;
  visibility: Visibility;
  ownerName: string | null;
};

export type BudgetForUI = {
  categoria: string;
  limite: number;
  color: string;
};

export type ConfiguracionUI = {
  tasaAhorroObjetivo: number;
  moneda: string;
  primerDiaMes: number;
  cuentaPrincipalId: string | number;
  cuentaAhorroId: string | number;
  cuentaTransferenciaDestinoId: string | number;
  mostrarAhorroEnAnalisis: boolean;
  alertasPresupuesto: boolean;
  redondeoAhorro: boolean;
};

export type PatrimonioMensual = {
  key: string;
  mes: string;
  anio: number;
  patrimonio: number;
  ahorro: number;
  ingresos: number;
  gastos: number;
  transferencias: number;
};

export type MonthStats = {
  ingresosMes: number;
  gastosMes: number;
  ahorroMes: number;
  ahorroTransferidoMes: number;
  transferenciasInternasMes: number;
  ajustesMes: number;
  flujoNetoMensual: number;
  porCategoria: Record<string, number>;
  pieData: Array<{ id: string; name: string; value: number; color: string }>;
  tasaAhorroReal: number;
  monthKey: string;
  transacciones: TransactionForUI[];
};

export type YearStats = MonthStats & { year: string };

export type TransactionForUI = {
  id: string | number;
  apiId?: string;
  descripcion: string;
  categoria: string;
  importe: number;
  fecha: string;
  tipo: LocalTransactionType;
  cuentaId?: string | number;
  cuentaDestinoId?: string | number;
  visibility: Visibility;
  paidByUserId?: string;
  merchantName?: string | null;
  tags: string[];
  notes?: string;
  beneficiarySplits?: SplitPart[];
};

/**
 * ===========================================
 * Type guards / predicates
 * ===========================================
 */
export function isTransactionForUI(obj: unknown): obj is TransactionForUI {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'descripcion' in obj &&
    'categoria' in obj &&
    'importe' in obj &&
    'fecha' in obj &&
    'tipo' in obj
  );
}

export function isCategoryGroup(obj: unknown): obj is CategoryGroup {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'label' in obj &&
    'icon' in obj &&
    'color' in obj &&
    'type' in obj
  );
}

export function isAccountForUI(obj: unknown): obj is AccountForUI {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'nombre' in obj &&
    'tipo' in obj &&
    'saldo' in obj &&
    'icono' in obj &&
    'color' in obj &&
    'visibility' in obj
  );
}