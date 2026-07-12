# Financial Domain Specification

## Purpose

This document defines the canonical vocabulary, invariants, and contracts for the financial domain in ToppFinance. Every piece of financial data entering the system must pass through a shared, deterministic pipeline defined here.

---

## Vocabulary

### Pipeline stages

| Term | Definition |
|---|---|
| `raw csv row` | A single line from a CSV file parsed into a `Record<string, string>` keyed by column header. No type coercion has been applied. |
| `normalized row` | A `NormalizedImportRow` where each field has been parsed and normalized: date is `YYYY-MM-DD`, amount is in integer cents, text is trimmed and case-normalized. |
| `import draft` | A `CreateTransactionInput` ready for Zod validation. The draft is what the system would persist if committed. |
| `duplicate exact` | A row whose `import fingerprint` matches an existing transaction's fingerprint exactly within the same household. |
| `duplicate candidate` | A row that is not an exact fingerprint match but shares high similarity (same amount in cents, date within ±3 days, similar description). |
| `reconciled row` | A row for which a reconciliation decision has been made: `keep` (import as new), `skip` (ignore as duplicate), or `force` (import despite being a duplicate candidate). |
| `blocking error` | A validation error that prevents a row from being imported. The row cannot be committed. |
| `warning` | A non-blocking issue reported to the user. The row can still be committed. |
| `idempotency key` | A deterministic key used to prevent duplicate imports. First priority is `externalId`; fallback is the `import fingerprint`. |
| `import fingerprint` | A SHA-256 hash computed over normalised fields: `{date, type, amountCents, description, sourceAccountName, destinationAccountName, merchant}`. Deterministic across imports. |

### Classification outcomes

| Outcome | Meaning |
|---|---|
| `new` | Row has no match in the database — safe to import. |
| `duplicate_exact` | Fingerprint matches an existing transaction — exact duplicate. |
| `duplicate_candidate` | No exact fingerprint match, but same amount in cents and date within reconciliation window — possible duplicate. |

---

## Business rules

### 1. Currency policy

- **Only `EUR` is supported** as the import currency.
- Any CSV row with an explicit non-EUR currency marker is rejected.
- All monetary values are assumed EUR unless otherwise specified.
- `DEFAULT_CURRENCY = 'EUR'`.
- Currency code is validated against `CurrencyCode` enum.
- The system always stores `currency = 'EUR'` in the database.

### 2. Rounding policy

- **Banker's rounding** (round half to even, aka "round ties to even") is used for all monetary operations.
- Internal representation: **integer cents** for all critical arithmetic.
- Display representation: **2 decimal places**.
- Serialisation: `number` with 2 decimal places (`toFixed(2)` → `Number()`).
- Allocations (splits, percentages) use controlled remainder distribution to ensure totals match exactly.

### 3. Accounting date semantics

- Date format: `YYYY-MM-DD` (ISO 8601 calendar date).
- **No hours, minutes, seconds, or timezone offsets** in the business date field.
- Date-only values are stored as `DateTime` in UTC at noon (to avoid DST boundary issues).
- The accounting date is the date the transaction was booked, not the date it was imported or entered.
- Reconciliation windows are always computed in calendar days (UTC date-only comparison).

### 4. Category → Transaction type compatibility

- Categories are strictly typed by `TransactionType`:
  - `EXPENSE` categories can only be used for expense transactions.
  - `INCOME` categories can only be used for income transactions.
  - `SAVING` categories can only be used for saving transactions.
  - `TRANSFER` categories can only be used for transfer transactions.
  - `ADJUSTMENT` categories can only be used for adjustment transactions.
- A category must match the transaction type when resolved during import.
- Fallback categories are defined per type in `FALLBACK_CATEGORY_BY_TYPE`.

### 5. Idempotency hierarchy

When importing, duplicates are detected in this priority order:

1. **`externalId`** — If the CSV row has an `external_id` (bank transaction ID), it is used as the natural key within the household. Unique index on `(householdId, externalId)`.
2. **`import fingerprint`** — If no `externalId`, a deterministic SHA-256 hash is computed from normalized fields. Unique index on `(householdId, fingerprint)`.

### 6. Reconciliation precedence

| Condition | Classification | Commit action |
|---|---|---|
| Fingerprint match | `duplicate_exact` | Skipped (unless `includeDuplicates: true`) |
| Same cents + date within ±3 days | `duplicate_candidate` | Warned, but not skipped |
| No match | `new` | Imported normally |

---

## Pipeline architecture

```
                    ┌──────────────────┐
                    │   parseCsvRows    │  (csv-parse → array of records)
                    └────────┬─────────┘
                             │ raw rows
                             ▼
                    ┌──────────────────┐
                    │  normalizeCsvRow  │  (date, money, text normalisation)
                    └────────┬─────────┘
                             │ normalized row
                             ▼
                    ┌──────────────────┐
                    │  buildImportDraft │  (resolve accounts, categories, splits)
                    └────────┬─────────┘
                             │ import draft
                             ▼
                    ┌──────────────────┐
                    │ computeImportFP   │  (SHA-256 fingerprint)
                    └────────┬─────────┘
                             │ fingerprint
                             ▼
                    ┌──────────────────┐
                    │  classifyImport   │  (check vs DB fingerprints → outcome)
                    └────────┬─────────┘
                             │ classified row
                             ▼
                    ┌──────────────────┐
                    │  CsvPreviewRow    │  (enriched with classification)
                    └──────────────────┘
```

- Stages 1–4 are **pure functions** in `packages/shared/src/` (no database access).
- Stage 5 (classification) requires DB lookup data injected as a parameter.
- The API orchestrates: call pure pipeline, inject DB data for classification, return preview.

---

## Data contracts

### NormalizedImportRow

```typescript
interface NormalizedImportRow {
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
  // Normalized fields:
  date: string | null;           // YYYY-MM-DD or null if invalid
  amountCents: number | null;    // integer cents or null if invalid
  type: TransactionType;
  description: string;
  visibility: Visibility;
}
```

### ReconciliationDecision

```typescript
interface ReconciliationDecision {
  classification: 'new' | 'duplicate_exact' | 'duplicate_candidate';
  reason: string;
  matchedTransactionId?: string;
  matchedFingerprint?: string;
  candidateDate?: string;
  candidateAmount?: number;
}
```

### ClassifiedImportRow

```typescript
interface ClassifiedImportRow {
  rowNumber: number;
  normalized: NormalizedImportRow;
  draft: CreateTransactionInput | null;
  fingerprint: string;
  idempotencyKey: string;
  reconciliation: ReconciliationDecision;
  errors: string[];
  warnings: string[];
  suggestedAction: 'import' | 'skip' | 'review';
}
```