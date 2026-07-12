/**
 * All enums consolidated in one place.
 * These mirror Prisma enums and add application-specific enums.
 */

// Prisma enums (kept in sync with prisma/schema.prisma)
export enum UserRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum AccountType {
  PERSONAL = 'PERSONAL',
  SHARED = 'SHARED',
  SAVINGS = 'SAVINGS',
  CASH = 'CASH',
  OTHER = 'OTHER',
}

export enum Visibility {
  PRIVATE = 'PRIVATE',
  SHARED = 'SHARED',
}

export enum TransactionType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  SAVING = 'SAVING',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum BudgetScope {
  USER = 'USER',
  SHARED = 'SHARED',
}

export enum ImportStatus {
  PREVIEWED = 'PREVIEWED',
  COMMITTED = 'COMMITTED',
  FAILED = 'FAILED',
}

/**
 * Outcome of classifying a CSV import row against existing transactions.
 * Prisma-facing enum equivalent is not required: this is an application enum
 * computed by the shared import pipeline (see docs/financial-domain.md).
 */
export enum ImportClassification {
  NEW = 'new',
  DUPLICATE_EXACT = 'duplicate_exact',
  DUPLICATE_CANDIDATE = 'duplicate_candidate',
}

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

export enum LogCategory {
  APPLICATION = 'APPLICATION',
  AUDIT = 'AUDIT',
  ERROR = 'ERROR',
  SCHEDULER = 'SCHEDULER',
  INTEGRATION = 'INTEGRATION',
  SECURITY = 'SECURITY',
}

export enum BackupStatus {
  STARTED = 'STARTED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

// Application-specific enums
export enum TransactionCategoryType {
  EXPENSE = 'EXPENSE',
  INCOME = 'INCOME',
  SAVING = 'SAVING',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum DataCollection {
  DENY = 'deny',
  ALLOW = 'allow',
}

export enum BackupFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

// Type guards for enums
export function isTransactionType(value: string): value is TransactionType {
  return Object.values(TransactionType).includes(value as TransactionType);
}

export function isVisibility(value: string): value is Visibility {
  return Object.values(Visibility).includes(value as Visibility);
}

export function isAccountType(value: string): value is AccountType {
  return Object.values(AccountType).includes(value as AccountType);
}

export function isBudgetScope(value: string): value is BudgetScope {
  return Object.values(BudgetScope).includes(value as BudgetScope);
}

export function isUserRole(value: string): value is UserRole {
  return Object.values(UserRole).includes(value as UserRole);
}

export function isImportStatus(value: string): value is ImportStatus {
  return Object.values(ImportStatus).includes(value as ImportStatus);
}

export function isImportClassification(value: string): value is ImportClassification {
  return Object.values(ImportClassification).includes(value as ImportClassification);
}

export function isLogLevel(value: string): value is LogLevel {
  return Object.values(LogLevel).includes(value as LogLevel);
}

export function isLogCategory(value: string): value is LogCategory {
  return Object.values(LogCategory).includes(value as LogCategory);
}

export function isBackupStatus(value: string): value is BackupStatus {
  return Object.values(BackupStatus).includes(value as BackupStatus);
}

export function isDataCollection(value: string): value is DataCollection {
  return Object.values(DataCollection).includes(value as DataCollection);
}

export function isBackupFrequency(value: string): value is BackupFrequency {
  return Object.values(BackupFrequency).includes(value as BackupFrequency);
}