/**
 * CSV import schemas, pipeline, and utilities.
 *
 * Implements the canonical import pipeline defined in docs/financial-domain.md:
 *
 *   parseCsvRows → normalizeCsvRow → buildImportDraft → computeImportFingerprint → classifyImportRow
 *
 * Stages 1–4 are pure functions with no database access. Stage 5 (classification)
 * receives DB lookup data injected as a parameter (ImportClassificationContext).
 *
 * Policies enforced here (see docs/financial-domain.md):
 * - Currency: only EUR is supported. Rows with an explicit non-EUR marker are rejected.
 * - Money: integer cents internally; banker's rounding via money.ts (parseCsvMoney).
 * - Accounting date: strict YYYY-MM-DD (parseAccountingDate). Ambiguous formats are rejected.
 * - Category ↔ transaction type compatibility.
 * - Idempotency: externalId (when present) else a deterministic SHA-256 fingerprint.
 *
 * The fingerprint canonicalises amount to ABSOLUTE cents (the monetary magnitude),
 * matching how amounts are stored (abs for non-ADJUSTMENT). The TransactionType is part
 * of the fingerprint basis, so an expense and an income of the same magnitude never collide.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { TransactionType, Visibility, ImportClassification } from './enums.js';
import { createTransactionSchema } from './schemas.js';
import { parseAccountingDate, isWithinReconciliationWindow } from './date.js';
import { parseCsvMoney, fromCents } from './money.js';
import { DEFAULT_CURRENCY, normalizeCurrency } from './currency.js';
import type { CurrencyCode } from './currency.js';
import {
  SplitUser,
  SharedSplitConfig,
  parseBeneficiarySplits,
  defaultSplits,
  normalizeText,
  findUser,
  assertSplitTotal,
} from './splits.js';
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
  currency: ['currency', 'moneda', 'divisa'],
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
 * CSV commit route params schema.
 */
export const csvCommitParamsSchema = z.object({
  id: z.string().min(1),
});

/**
 * Suggested user action for a classified import row.
 */
export type ImportSuggestedAction = 'import' | 'skip' | 'review';

/**
 * A single CSV row with each field parsed and normalised.
 * `raw*` fields keep the original text; the normalised fields hold parsed values.
 */
export interface NormalizedImportRow {
  rawDate: string;
  rawAmount: string;
  rawType: string;
  rawDescription: string;
  rawCategory: string;
  rawSourceAccount: string;
  rawDestinationAccount: string;
  rawVisibility: string;
  rawPaidBy: string;
  rawBeneficiarySplit: string;
  rawMerchant: string;
  rawTags: string;
  rawNotes: string;
  rawExternalId: string;
  rawCurrency: string;
  /** ISO accounting date (YYYY-MM-DD), or null if invalid/ambiguous. */
  date: string | null;
  /** Signed integer cents from the CSV, or null if unparseable. */
  amountCents: number | null;
  type: TransactionType;
  description: string;
  visibility: Visibility;
  /** Canonical currency when the marker is supported (EUR), null when explicitly unsupported. */
  currency: CurrencyCode | null;
}

/**
 * Reconciliation decision for a classified row.
 */
export interface ReconciliationDecision {
  classification: ImportClassification;
  reason: string;
  matchedTransactionId?: string;
  matchedFingerprint?: string;
  candidateDate?: string;
  candidateAmount?: number;
}

/**
 * Full pipeline output for one row (stages 1–5).
 */
export interface ClassifiedImportRow {
  rowNumber: number;
  normalized: NormalizedImportRow;
  draft: CreateTransactionInput | null;
  fingerprint: string;
  idempotencyKey: string;
  reconciliation: ReconciliationDecision;
  errors: string[];
  warnings: string[];
  suggestedAction: ImportSuggestedAction;
}

/**
 * DB lookup data injected into the pure classification stage.
 * Maps are keyed by the relevant identifier; values are existing transaction ids.
 * `candidates` is keyed by ABSOLUTE cents and lists existing (date, transactionId) pairs,
 * used for the duplicate_candidate (same amount, date within ±3 days) check.
 */
export interface ImportClassificationContext {
  fingerprints: ReadonlyMap<string, string>;
  externalIds: ReadonlyMap<string, string>;
  candidates: ReadonlyMap<number, ReadonlyArray<{ date: string; transactionId: string }>>;
}

/**
 * CSV preview row result (classified + display-ready; backward compatible).
 */
export interface CsvPreviewRow extends ClassifiedImportRow {
  status: 'ready' | 'error' | 'duplicate';
  duplicate: boolean;
  /** Legacy alias of `fingerprint`; kept for webhook/UI commit-body compatibility. */
  sourceHash: string;
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
 * Parses CSV content into raw records (pipeline stage 1).
 */
export function parseCsv(content: string): CsvRecord[] {
  return parse(content, {
    bom: true,
    columns: true,
    delimiter: detectDelimiter(content),
    relaxColumnCount: true,
    skipEmptyLines: true,
    trim: true,
  }) as CsvRecord[];
}

/** Conceptual alias for stage 1, matching the documented pipeline name. */
export { parseCsv as parseCsvRows };

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
 * Parses transaction type from raw string and amount (stage 1 helper).
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
 * Normalises a raw CSV record into a NormalizedImportRow (pipeline stage 2).
 * Pure: no side effects, no DB access.
 *
 * Currency handling: an empty marker assumes EUR (default). A present but
 * unsupported marker normalises to `currency: null`, which the draft stage
 * turns into a blocking error.
 */
export function normalizeCsvRow(record: CsvRecord): NormalizedImportRow {
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
  const rawCurrency = pick(record, CSV_COLUMN_ALIASES.currency);

  const date = parseAccountingDate(rawDate);
  const amountCents = parseCsvMoney(rawAmount);
  const description = rawDescription.trim();
  const type = parseTypeValue(rawType, amountCents ?? 0);
  const visibility = parseVisibilityValue(rawVisibility);
  const currency = rawCurrency ? normalizeCurrency(rawCurrency) : DEFAULT_CURRENCY;

  return {
    rawDate, rawAmount, rawType, rawDescription, rawCategory,
    rawSourceAccount, rawDestinationAccount, rawVisibility, rawPaidBy,
    rawBeneficiarySplit, rawMerchant, rawTags, rawNotes, rawExternalId, rawCurrency,
    date, amountCents, type, description, visibility, currency,
  };
}

export interface BuildImportDraftInput {
  normalized: NormalizedImportRow;
  categories: Array<{ id: string; slug: string; name: string; type: TransactionType }>;
  accounts: Array<{ id: string; name: string; type: string; visibility: Visibility; ownerUserId: string | null }>;
  users: SplitUser[];
  actorUserId: string;
  sharedSplit: SharedSplitConfig;
  defaultSourceAccountId?: string | null;
  defaultDestinationAccountId?: string | null;
}

export interface BuildImportDraftResult {
  draft: CreateTransactionInput | null;
  errors: string[];
  warnings: string[];
  /** Resolved account names — the canonical labels used for the fingerprint. */
  sourceAccountName: string;
  destinationAccountName: string;
  categoryName: string;
  resolvedType: TransactionType;
}

/**
 * Resolves a normalised row into a transaction draft (pipeline stage 3).
 * Pure: category/account/user resolution happens against injected lookups.
 *
 * Enforces the category ↔ transaction type compatibility rule: a category whose
 * type does not match the row's type is replaced with the per-type fallback.
 */
export function buildImportDraft(input: BuildImportDraftInput): BuildImportDraftResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const { normalized, categories, accounts, users, actorUserId, sharedSplit } = input;

  // Currency policy: only EUR.
  if (normalized.rawCurrency && !normalized.currency) {
    errors.push(`Moneda no soportada: "${normalized.rawCurrency}". Solo se acepta EUR.`);
  }

  // Strict date + cents validation.
  if (!normalized.date) errors.push('Fecha inválida (formato esperado YYYY-MM-DD).');
  if (normalized.amountCents == null) errors.push('Importe inválido.');
  if (!normalized.description) errors.push('Descripción obligatoria.');

  const amountCents = normalized.amountCents ?? 0;
  const absCents = Math.abs(amountCents);
  const type = normalized.type;
  const visibility = normalized.visibility;

  // Category resolution + type compatibility.
  const categoryResult = findCategory(normalized.rawCategory, type, categories);
  let category = categoryResult.category;
  if (category && category.type !== type) {
    const fallbackSlug = FALLBACK_CATEGORY_BY_TYPE[type];
    const fallback = categories.find(c => c.slug === fallbackSlug) ?? category;
    warnings.push(
      `Categoría "${category.name}" no es compatible con el tipo ${TRANSACTION_TYPE_LABELS[type]}; se usará ${fallback.name}.`
    );
    category = fallback;
  } else if (categoryResult.usedFallback && category) {
    warnings.push(`Categoría no encontrada; se usará ${category.name}.`);
  }
  if (!category) errors.push('No hay categorías disponibles.');

  // Accounts visible to the actor.
  const visibleAccounts = accounts.filter(acc =>
    acc.visibility === Visibility.SHARED || acc.ownerUserId === actorUserId
  );

  const sourceResult = findAccount(normalized.rawSourceAccount, visibleAccounts, input.defaultSourceAccountId);
  if (sourceResult.usedFallback && sourceResult.account) {
    warnings.push(`Cuenta origen no encontrada; se usará ${sourceResult.account.name}.`);
  }

  let destinationResult = findAccount(normalized.rawDestinationAccount, visibleAccounts, input.defaultDestinationAccountId);
  if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) &&
      (!destinationResult.account || destinationResult.account.id === sourceResult.account?.id)) {
    const alternative = visibleAccounts.find(acc =>
      acc.id !== sourceResult.account?.id &&
      (acc.type === 'SAVINGS' || acc.type === 'SHARED')
    ) ?? visibleAccounts.find(acc => acc.id !== sourceResult.account?.id);
    destinationResult = { account: alternative ?? null, usedFallback: true };
  }
  if (normalized.rawDestinationAccount && destinationResult.usedFallback && destinationResult.account) {
    warnings.push(`Cuenta destino no encontrada; se usará ${destinationResult.account.name}.`);
  }

  // Account requirements per type.
  if ((type === TransactionType.EXPENSE || type === TransactionType.INCOME || type === TransactionType.ADJUSTMENT) && !sourceResult.account) {
    errors.push('Falta cuenta origen.');
  }
  if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) && (!sourceResult.account || !destinationResult.account)) {
    errors.push('Faltan cuenta origen y destino.');
  }
  if ((type === TransactionType.SAVING || type === TransactionType.TRANSFER) && sourceResult.account?.id === destinationResult.account?.id) {
    errors.push('La cuenta origen y destino no pueden ser la misma.');
  }

  // Paid by.
  const paidByUser = normalized.rawPaidBy
    ? findUser(users, normalized.rawPaidBy)
    : users.find(u => u.id === actorUserId);
  if (normalized.rawPaidBy && !paidByUser) {
    warnings.push('Pagador no encontrado; se usará el usuario actual.');
  }

  // Beneficiary splits.
  const parsedSplits = parseBeneficiarySplits(normalized.rawBeneficiarySplit, users);
  warnings.push(...parsedSplits.warnings);
  const beneficiarySplits = parsedSplits.splits ?? defaultSplits({
    visibility,
    users,
    actorUserId,
    sharedSplit,
  });

  // Amount: absolute cents except ADJUSTMENT (keeps sign).
  const amount = type === TransactionType.ADJUSTMENT ? fromCents(amountCents) : fromCents(absCents);

  const draft: CreateTransactionInput = {
    type,
    date: normalized.date ?? '1970-01-01',
    amount,
    description: normalized.description,
    categoryId: category?.id ?? '',
    sourceAccountId: sourceResult.account?.id ?? null,
    destinationAccountId: (type === TransactionType.SAVING || type === TransactionType.TRANSFER)
      ? destinationResult.account?.id ?? null
      : null,
    visibility,
    paidByUserId: paidByUser?.id ?? actorUserId,
    beneficiarySplits,
    merchantName: normalized.rawMerchant || null,
    tags: splitTags(normalized.rawTags),
    notes: normalized.rawNotes || null,
    externalId: normalized.rawExternalId || null,
  };

  // Schema validation.
  const schemaResult = createTransactionSchema.safeParse(draft);
  if (!schemaResult.success) {
    errors.push(...schemaResult.error.issues.map(issue => issue.message));
  }

  // Splits sum to 100%.
  try {
    assertSplitTotal(beneficiarySplits);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'El reparto debe sumar 100%.');
  }

  return {
    draft: errors.length ? null : draft,
    errors,
    warnings,
    sourceAccountName: sourceResult.account?.name ?? '',
    destinationAccountName: destinationResult.account?.name ?? '',
    categoryName: category?.name ?? normalized.rawCategory,
    resolvedType: type,
  };
}

/**
 * Computes the deterministic import fingerprint (pipeline stage 4).
 * SHA-256 over normalised fields: {date, type, amountCents, description,
 * sourceAccountName, destinationAccountName, merchant}. `amountCents` is the
 * ABSOLUTE magnitude (see module doc). Pure.
 */
export function computeImportFingerprint(input: {
  date: string;
  type: TransactionType;
  amountCents: number;
  description: string;
  sourceAccountName: string;
  destinationAccountName: string;
  merchant: string;
}): string {
  const basis = JSON.stringify({
    date: input.date,
    type: input.type,
    amountCents: input.amountCents,
    description: normalizeText(input.description),
    sourceAccountName: normalizeText(input.sourceAccountName),
    destinationAccountName: normalizeText(input.destinationAccountName),
    merchant: normalizeText(input.merchant),
  });
  return createHash('sha256').update(basis).digest('hex');
}

/**
 * Classifies a normalised row against injected DB data (pipeline stage 5).
 * Pure: all DB knowledge arrives via `context`.
 *
 * Precedence:
 * 1. externalId match → duplicate_exact
 * 2. fingerprint match → duplicate_exact
 * 3. same abs cents + date within ±3 days → duplicate_candidate
 * 4. otherwise → new
 */
export function classifyImportRow(input: {
  fingerprint: string;
  externalId: string | null;
  date: string;
  amountCents: number;
  context: ImportClassificationContext;
}): ReconciliationDecision {
  const { fingerprint, externalId, date, amountCents, context } = input;

  if (externalId) {
    const matchedId = context.externalIds.get(externalId);
    if (matchedId) {
      return {
        classification: ImportClassification.DUPLICATE_EXACT,
        reason: `externalId ya importado: ${externalId}`,
        matchedTransactionId: matchedId,
      };
    }
  }

  const matchedByFp = context.fingerprints.get(fingerprint);
  if (matchedByFp) {
    return {
      classification: ImportClassification.DUPLICATE_EXACT,
      reason: 'El fingerprint coincide con una transacción existente.',
      matchedTransactionId: matchedByFp,
      matchedFingerprint: fingerprint,
    };
  }

  const candidates = context.candidates.get(amountCents);
  if (candidates) {
    for (const candidate of candidates) {
      if (isWithinReconciliationWindow(date, candidate.date)) {
        return {
          classification: ImportClassification.DUPLICATE_CANDIDATE,
          reason: 'Mismo importe y fecha cercana (±3 días).',
          matchedTransactionId: candidate.transactionId,
          candidateDate: candidate.date,
          candidateAmount: amountCents,
        };
      }
    }
  }

  return {
    classification: ImportClassification.NEW,
    reason: 'Sin coincidencias; lista para importar.',
  };
}

/**
 * Builds preview rows from CSV content + injected lookups (full pipeline).
 */
export interface BuildPreviewRowsInput {
  user: { id: string; householdId: string };
  fileName: string;
  content: string;
  categories: Array<{ id: string; slug: string; name: string; type: TransactionType }>;
  accounts: Array<{ id: string; name: string; type: string; visibility: Visibility; ownerUserId: string | null }>;
  users: SplitUser[];
  sharedSplit: SharedSplitConfig;
  defaultSourceAccountId?: string | null;
  defaultDestinationAccountId?: string | null;
  classificationContext: ImportClassificationContext;
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
    const normalized = normalizeCsvRow(record);

    const draftResult = buildImportDraft({
      normalized,
      categories: input.categories,
      accounts: input.accounts,
      users: input.users,
      actorUserId: input.user.id,
      sharedSplit: input.sharedSplit,
      defaultSourceAccountId: input.defaultSourceAccountId,
      defaultDestinationAccountId: input.defaultDestinationAccountId,
    });

    const hasIdentity = normalized.date != null && normalized.amountCents != null;
    const absCents = normalized.amountCents == null ? null : Math.abs(normalized.amountCents);

    const fingerprint = hasIdentity
      ? computeImportFingerprint({
          date: normalized.date!,
          type: draftResult.draft?.type ?? normalized.type,
          amountCents: absCents!,
          description: draftResult.draft?.description ?? normalized.description,
          sourceAccountName: draftResult.sourceAccountName || normalized.rawSourceAccount,
          destinationAccountName: draftResult.destinationAccountName || normalized.rawDestinationAccount,
          merchant: normalized.rawMerchant,
        })
      : '';

    const externalId = normalized.rawExternalId || null;
    const idempotencyKey = externalId ?? fingerprint;

    const reconciliation: ReconciliationDecision = hasIdentity
      ? classifyImportRow({
          fingerprint,
          externalId,
          date: normalized.date!,
          amountCents: absCents!,
          context: input.classificationContext,
        })
      : {
          classification: ImportClassification.NEW,
          reason: 'Fila con fecha o importe no válido; no se puede clasificar.',
        };

    const errors = draftResult.errors;
    const warnings = draftResult.warnings;
    const classification = reconciliation.classification;

    let suggestedAction: ImportSuggestedAction;
    if (errors.length) suggestedAction = 'skip';
    else if (classification === ImportClassification.DUPLICATE_EXACT) suggestedAction = 'skip';
    else if (classification === ImportClassification.DUPLICATE_CANDIDATE) suggestedAction = 'review';
    else suggestedAction = 'import';

    const draft = errors.length ? null : draftResult.draft;
    const status: CsvPreviewRow['status'] = errors.length
      ? 'error'
      : classification === ImportClassification.DUPLICATE_EXACT
        ? 'duplicate'
        : 'ready';

    return {
      rowNumber,
      normalized,
      draft,
      fingerprint,
      idempotencyKey,
      reconciliation,
      errors,
      warnings,
      suggestedAction,
      status,
      duplicate: classification === ImportClassification.DUPLICATE_EXACT,
      sourceHash: fingerprint,
      display: {
        date: normalized.date,
        type: draftResult.draft?.type ?? normalized.type,
        typeLabel: typeLabels[draftResult.draft?.type ?? normalized.type],
        amount: normalized.amountCents == null ? null : (draft?.amount ?? fromCents(absCents!)),
        description: draftResult.draft?.description ?? normalized.description,
        category: draftResult.categoryName,
        sourceAccount: draftResult.sourceAccountName || normalized.rawSourceAccount,
        destinationAccount: draftResult.destinationAccountName || normalized.rawDestinationAccount,
        visibility: draftResult.draft?.visibility ?? normalized.visibility,
      },
    };
  });

  const warningsCount = rows.reduce((sum, row) => sum + row.warnings.length, 0);

  return {
    rows,
    importBatch: {
      id: '', // Filled by the API
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
    'paid_by_email', 'beneficiary_split', 'merchant', 'tags', 'notes', 'external_id'
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
    '',
  ].map(escape));

  return [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
}
