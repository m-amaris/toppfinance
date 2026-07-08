/**
 * CSV import schemas and utilities.
 * Defines the CSV format, parsing logic, and transformation to transaction drafts.
 */

import { z } from 'zod';
import { TransactionType, Visibility } from './enums.js';
import { createTransactionSchema } from './schemas.js';
import { parseDateValue } from './date.js';
import { parseMoney } from './money.js';
import { SplitUser, SharedSplitConfig, parseBeneficiarySplits, defaultSplits, makeSourceHash, normalizeText, findUser } from './splits.js';
import type { CreateTransactionInput } from './types.js';

/**
 * Expected CSV column aliases (case-insensitive, accent-insensitive).
 */
export const CSV_COLUMN_ALIASES = {
  date: ['date', 'fecha', 'booking_date'],
  amount: ['amount_eur', 'amount', 'importe', 'cantidad'],
  type: ['type', 'tipo'],
  description: ['description', 'descripcion', 'concepto', 'merchant_description'],
  category: ['category', 'categoria', 'category_slug'],
  sourceAccount: ['source_account', 'source_account_name', 'cuenta', 'cuenta_origen'],
  destinationAccount: ['destination_account', 'destination_account_name', 'cuenta_destino'],
  visibility: ['visibility', 'visibilidad'],
  paidBy: ['paid_by_email', 'pagado_por'],
  beneficiarySplit: ['beneficiary_split', 'reparto'],
  merchant: ['merchant', 'comercio'],
  tags: ['tags', 'etiquetas'],
  notes: ['notes', 'notas'],
  externalId: ['external_id', 'id_externo', 'bank_id'],
} as const;

/**
 * CSV record type (raw parsed row).
 */
export type CsvRecord = Record<string, unknown>;

/**
 * Parsed and validated transaction draft from CSV.
 */
export type ImportDraft = CreateTransactionInput;

/**
 * CSV preview row result.
 */
export interface CsvPreviewRow {
  rowNumber: number;
  status: 'ready' | 'error' | 'duplicate';
  duplicate: boolean;
  sourceHash: string;
  warnings: string[];
  errors: string[];
  draft: ImportDraft | null;
  display: {
    date: string | null;
    type: TransactionType;
    typeLabel: string;
    amount: number | null;
    description: string;
    category: string | null;
    sourceAccount: string | null;
    destinationAccount: string | null;
    visibility: Visibility;
  };
}

/**
 * Type labels for display.
 */
export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  [TransactionType.EXPENSE]: 'Gasto',
  [TransactionType.INCOME]: 'Ingreso',
  [TransactionType.SAVING]: 'Ahorro',
  [TransactionType.TRANSFER]: 'Transferencia',
  [TransactionType.ADJUSTMENT]: 'Ajuste',
};

/**
 * Fallback category slug by transaction type.
 */
export const FALLBACK_CATEGORY_BY_TYPE: Record<TransactionType, string> = {
  [TransactionType.EXPENSE]: 'otros',
  [TransactionType.INCOME]: 'otros_ingreso',
  [TransactionType.SAVING]: 'ahorro',
  [TransactionType.TRANSFER]: 'transferencia_interna',
  [TransactionType.ADJUSTMENT]: 'ajuste_manual',
};

/**
 * Detects CSV delimiter from first line.
 */
export function detectDelimiter(content: string): string {
  const firstLine = content.split(/\r?\n/).find(line => line.trim()) ?? '';
  const candidates = [';', ',', '\t'];
  return candidates
    .map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ';';
}

/**
 * Parses CSV content into records.
 */
export function parseCsv(content: string): CsvRecord[] {
  const { parse } = require('csv-parse/sync');
  return parse(content, {
    bom: true,
    columns: true,
    delimiter: detectDelimiter(content),
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: true,
  }) as CsvRecord[];
}

/**
 * Picks a value from a CSV record using aliases.
 */
export function pick(record: CsvRecord, aliases: readonly string[]): string {
  const normalizedAliases = aliases.map(normalizeText);
  const found = Object.entries(record).find(([key]) =>
    normalizedAliases.includes(normalizeText(key))
  );
  return found ? String(found[1] ?? '').trim() : '';
}

/**
 * Parses transaction type from raw string and amount.
 */
export function parseTypeValue(raw: string, amount: number): TransactionType {
  const value = normalizeText(raw);
  if (['gasto', 'expense', 'debit', 'cargo'].includes(value)) return TransactionType.EXPENSE;
  if (['ingreso', 'income', 'credit', 'abono'].includes(value)) return TransactionType.INCOME;
  if (['ahorro', 'saving', 'savings'].includes(value)) return TransactionType.SAVING;
  if (['transferencia', 'transfer', 'traspaso', 'transferencia interna'].includes(value)) return TransactionType.TRANSFER;
  if (['ajuste', 'adjustment', 'ajuste manual'].includes(value)) return TransactionType.ADJUSTMENT;
  return amount < 0 ? TransactionType.EXPENSE : TransactionType.INCOME;
}

/**
 * Parses visibility from raw string.
 */
export function parseVisibilityValue(raw: string): Visibility {
  const value = normalizeText(raw);
  if (['private', 'privado', 'privada'].includes(value)) return Visibility.PRIVATE;
  return Visibility.SHARED;
}

/**
 * Splits tags string into array.
 */
export function splitTags(raw: string): string[] {
  return raw
    .split(/[|,]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/**
 * Finds a category by slug, name, or id.
 */
export function findCategory(
  raw: string,
  type: TransactionType,
  categories: Array<{ id: string; slug: string; name: string; type: TransactionType }>
): { category: typeof categories[0] | null; usedFallback: boolean } {
  const value = normalizeText(raw);
  const found = categories.find(cat =>
    normalizeText(cat.slug) === value ||
    normalizeText(cat.name) === value ||
    normalizeText(cat.id) === value
  );
  if (found) return { category: found, usedFallback: false };

  const fallbackSlug = FALLBACK_CATEGORY_BY_TYPE[type];
  const fallback = categories.find(cat => cat.slug === fallbackSlug) ?? categories[0];
  return { category: fallback ?? null, usedFallback: true };
}

/**
 * Finds an account by id or name.
 */
export function findAccount(
  raw: string,
  accounts: Array<{ id: string; name: string }>,
  fallbackId?: string | null
): { account: typeof accounts[0] | null; usedFallback: boolean } {
  const value = normalizeText(raw);
  const byCsv = value
    ? accounts.find(acc => normalizeText(acc.id) === value || normalizeText(acc.name) === value)
    : null;
  if (byCsv) return { account: byCsv, usedFallback: false };

  const byFallback = fallbackId ? accounts.find(acc => acc.id === fallbackId) : null;
  if (byFallback) return { account: byFallback, usedFallback: Boolean(raw) };

  return { account: accounts[0] ?? null, usedFallback: true };
}

/**
 * Builds preview rows from CSV content.
 */
export interface BuildPreviewRowsInput {
  user: { id: string; householdId: string };
  fileName: string;
  content: string;
  defaultSourceAccountId?: string | null;
  defaultDestinationAccountId?: string | null;
  categories: Array<{ id: string; slug: string; name: string; type: TransactionType }>;
  accounts: Array<{ id: string; name: string; type: string; visibility: Visibility; ownerUserId: string | null }>;
  users: SplitUser[];
  sharedSplit: SharedSplitConfig;
}

export interface BuildPreviewRowsOutput {
  rows: CsvPreviewRow[];
  importBatch: {
    id: string;
    status: 'PREVIEWED';
    rowsCount: number;
    warningsCount: number;
  };
  summary: {
    total: number;
    ready: number;
    duplicates: number;
    errors: number;
    warnings: number;
  };
}

export async function buildPreviewRows(input: BuildPreviewRowsInput): Promise<BuildPreviewRowsOutput> {
  const records = parseCsv(input.content);
  const typeLabels = TRANSACTION_TYPE_LABELS;

  const rows: CsvPreviewRow[] = records.map((record, index) => {
    const rowNumber = index + 2; // 1-indexed, accounting for header
    const warnings: string[] = [];
    const errors: string[] = [];

    // Extract raw values
    const rawDate = pick(record, CSV_COLUMN_ALIASES.date);
    const rawAmount = pick(record, CSV_COLUMN_ALIASES.amount);
    const rawType = pick(record, CSV_COLUMN_ALIASES.type);
    const rawDescription = pick(record, CSV_COLUMN_ALIASES.description);
    const rawCategory = pick(record, CSV_COLUMN_ALIASES.category);
    const rawSourceAccount = pick(record, CSV_COLUMN_ALIASES.sourceAccount);
    const rawDestinationAccount = pick(record, CSV_COLUMN_ALIASES.destinationAccount);
    const rawVisibility = pick(record, CSV_COLUMN_ALIASES.visibility);
    const rawPaidBy = pick(record, CSV_COLUMN_ALIASES.paidBy);
    const rawBeneficiarySplit = pick(record, CSV_COLUMN_ALIASES.beneficiarySplit);
    const rawMerchant = pick(record, CSV_COLUMN_ALIASES.merchant);
    const rawTags = pick(record, CSV_COLUMN_ALIASES.tags);
    const rawNotes = pick(record, CSV_COLUMN_ALIASES.notes);
    const rawExternalId = pick(record, CSV_COLUMN_ALIASES.externalId);

    // Parse values
    const date = parseDateValue(rawDate);
    const parsedAmount = parseMoney(rawAmount);
    const description = rawDescription.trim();

    // Validate required fields
    if (!date) errors.push('Fecha inválida.');
    if (parsedAmount == null) errors.push('Importe inválido.');
    if (!description) errors.push('Descripción obligatoria.');

    const type = parseTypeValue(rawType, parsedAmount ?? 0);
    const visibility = parseVisibilityValue(rawVisibility);
    const categoryResult = findCategory(rawCategory, type, input.categories);
    if (!categoryResult.category) errors.push('No hay categorías disponibles.');
    if (categoryResult.usedFallback && categoryResult.category) {
      warnings.push(`Categoría no encontrada; se usará ${categoryResult.category.name}.`);
    }

    // Filter accounts by visibility
    const visibleAccounts = input.accounts.filter(acc =>
      acc.visibility === Visibility.SHARED || acc.ownerUserId === input.user.id
    );

    const sourceResult = findAccount(rawSourceAccount, visibleAccounts, input.defaultSourceAccountId);
    if (sourceResult.usedFallback && sourceResult.account) {
      warnings.push(`Cuenta origen no encontrada; se usará ${sourceResult.account.name}.`);
    }

    let destinationResult = findAccount(rawDestinationAccount, visibleAccounts, input.defaultDestinationAccountId);
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        (!destinationResult.account || destinationResult.account.id === sourceResult.account?.id)) {
      const alternative = visibleAccounts.find(acc =>
        acc.id !== sourceResult.account?.id &&
        (acc.type === 'SAVINGS' || acc.type === 'SHARED')
      ) ?? visibleAccounts.find(acc => acc.id !== sourceResult.account?.id);
      destinationResult = { account: alternative ?? null, usedFallback: true };
    }
    if (rawDestinationAccount && destinationResult.usedFallback && destinationResult.account) {
      warnings.push(`Cuenta destino no encontrada; se usará ${destinationResult.account.name}.`);
    }

    // Validate accounts per transaction type
    if ((type === TransactionType.EXPENSE || type === TransactionType.INCOME || type === TransactionType.ADJUSTMENT) &&
        !sourceResult.account) {
      errors.push('Falta cuenta origen.');
    }
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        (!sourceResult.account || !destinationResult.account)) {
      errors.push('Faltan cuenta origen y destino.');
    }
    if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
        sourceResult.account?.id === destinationResult.account?.id) {
      errors.push('La cuenta origen y destino no pueden ser la misma.');
    }

    // Parse paid by
    const paidByUser = rawPaidBy
      ? findUser(input.users, rawPaidBy)
      : input.users.find(u => u.id === input.user.id);
    if (rawPaidBy && !paidByUser) warnings.push('Pagador no encontrado; se usará el usuario actual.');

    // Parse beneficiary splits
    const parsedSplits = parseBeneficiarySplits(rawBeneficiarySplit, input.users);
    warnings.push(...parsedSplits.warnings);
    const beneficiarySplits = parsedSplits.splits ?? defaultSplits({
      visibility,
      users: input.users,
      actorUserId: input.user.id,
      sharedSplit: input.sharedSplit,
    });

    // Build draft
    const draft: ImportDraft = {
      type,
      date: date ?? '1970-01-01',
      amount: type === TransactionType.ADJUSTMENT ? toMoney(parsedAmount ?? 0) : Math.abs(toMoney(parsedAmount ?? 0)),
      description,
      categoryId: categoryResult.category?.id ?? '',
      sourceAccountId: sourceResult.account?.id ?? null,
      destinationAccountId: (type === TransactionType.SAVING || type === TransactionType.TRANSFER)
        ? destinationResult.account?.id ?? null
        : null,
      visibility,
      paidByUserId: paidByUser?.id ?? input.user.id,
      beneficiarySplits,
      merchantName: rawMerchant || null,
      tags: splitTags(rawTags),
      notes: rawNotes || null,
    };

    // Validate against schema
    const schemaResult = createTransactionSchema.safeParse(draft);
    if (!schemaResult.success) {
      errors.push(...schemaResult.error.issues.map(issue => issue.message));
    }

    // Validate splits
    try {
      const { assertSplitTotal } = require('./splits.js');
      assertSplitTotal(beneficiarySplits);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'El reparto debe sumar 100%.');
    }

    // Generate source hash
    const sourceHash = makeSourceHash({
      externalId: rawExternalId,
      draft: {
        type: draft.type,
        date: draft.date,
        amount: draft.amount,
        description: draft.description,
        categoryId: draft.categoryId,
        sourceAccountId: draft.sourceAccountId ?? null,
        destinationAccountId: draft.destinationAccountId ?? null,
        merchantName: draft.merchantName ?? null,
      },
      categoryLabel: rawCategory || categoryResult.category?.slug || '',
      sourceAccountLabel: rawSourceAccount || sourceResult.account?.name || '',
      destinationAccountLabel: rawDestinationAccount || destinationResult.account?.name || '',
    });

    return {
      rowNumber,
      status: errors.length ? 'error' : 'ready',
      duplicate: false,
      sourceHash,
      warnings,
      errors,
      draft: errors.length ? null : draft,
      display: {
        date,
        type,
        typeLabel: typeLabels[type],
        amount: parsedAmount == null ? null : draft.amount,
        description,
        category: categoryResult.category?.name ?? rawCategory,
        sourceAccount: sourceResult.account?.name ?? rawSourceAccount,
        destinationAccount: destinationResult.account?.name ?? rawDestinationAccount,
        visibility,
      },
    };
  });

  // Check for duplicates against existing hashes
  // (In real implementation, this would query the database)
  // For now, we just return the rows as-is

  const warningsCount = rows.reduce((sum, row) => sum + row.warnings.length, 0);

  return {
    rows,
    importBatch: {
      id: '', // Will be generated by API
      status: 'PREVIEWED',
      rowsCount: rows.length,
      warningsCount,
    },
    summary: {
      total: rows.length,
      ready: rows.filter(r => r.status === 'ready').length,
      duplicates: rows.filter(r => r.duplicate).length,
      errors: rows.filter(r => r.status === 'error').length,
      warnings: warningsCount,
    },
  };
}

/**
 * Validates a commit body.
 */
export function validateCommitBody(body: unknown): { rows: Array<{ rowNumber: number; sourceHash: string; draft: ImportDraft }>; includeDuplicates: boolean } {
  const csvCommitBodySchema = z.object({
    includeDuplicates: z.boolean().default(false),
    rows: z.array(z.object({
      rowNumber: z.number().int().positive(),
      sourceHash: z.string().min(16),
      draft: createTransactionSchema,
    })).min(1),
  });

  const parsed = csvCommitBodySchema.parse(body);
  return {
    rows: parsed.rows,
    includeDuplicates: parsed.includeDuplicates,
  };
}

/**
 * Export transactions to CSV format.
 */
export function transactionsToCsv(transactions: Array<{
  date: Date | string;
  type: TransactionType;
  amount: number;
  description: string;
  sourceAccount?: { name: string } | null;
  destinationAccount?: { name: string } | null;
  category: { name: string };
  visibility: Visibility;
  paidByUser?: { email: string } | null;
  beneficiaries?: Array<{ user: { email: string }; percent: number }>;
  merchant?: { name: string } | null;
  tags?: string[];
  notes?: string | null;
}>): string {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  const headers = [
    'date', 'type', 'amount_eur', 'description',
    'source_account', 'destination_account', 'category', 'visibility',
    'paid_by_email', 'beneficiary_split', 'merchant', 'tags', 'notes'
  ];

  const rows = transactions.map(tx => [
    typeof tx.date === 'string' ? tx.date.slice(0, 10) : tx.date.toISOString().slice(0, 10),
    tx.type,
    Number(tx.amount).toFixed(2).replace('.', ','),
    tx.description,
    tx.sourceAccount?.name ?? '',
    tx.destinationAccount?.name ?? '',
    tx.category.name,
    tx.visibility,
    tx.paidByUser?.email ?? '',
    tx.beneficiaries?.map(s => `${s.user.email}=${Number(s.percent)}`).join('|') ?? '',
    tx.merchant?.name ?? '',
    tx.tags?.join('|') ?? '',
    tx.notes ?? '',
  ].map(escape));

  return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
}

function toMoney(value: number): number {
  return Number(Number(value).toFixed(2));
}