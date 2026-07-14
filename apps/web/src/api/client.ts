/**
 * API client - thin wrapper around fetch with credentials
 * Exports individual functions for tree-shaking and React Query integration
 */
import type {
  TransactionResponse,
  CategoryResponse,
  AccountWithBalanceResponse,
  SessionUserResponse,
  HouseholdResponse,
  CreateTransactionInput,
  UpdateTransactionInput,
  UpdateCategoryInput,
  SettingsResponse,
} from '@toppfinance/shared'

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

interface ApiError extends Error {
  status?: number
  payload?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined
  const response = await fetch(path, {
    method: options.method || 'GET',
    credentials: 'include',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error: string }).error
      : `HTTP ${response.status}`
    const error = new Error(message) as ApiError
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload as T
}

/** Auth */
interface AuthMeResponse {
  user: SessionUserResponse
  household: HouseholdResponse
}

interface LoginResponse {
  user: SessionUserResponse
  household: HouseholdResponse
}

export const authApi = {
  me: () => request<AuthMeResponse>('/api/auth/me'),
  login: (email: string, password: string) => request<LoginResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
}

/** Accounts */
interface AccountsListResponse {
  accounts: AccountWithBalanceResponse[]
}

export const accountsApi = {
  list: () => request<AccountsListResponse>('/api/accounts'),
}

/** Categories */
interface CategoriesListResponse {
  categories: CategoryResponse[]
}

export const categoriesApi = {
  list: () => request<CategoriesListResponse>('/api/categories'),
  update: (id: string, body: UpdateCategoryInput) => request<CategoryResponse>(`/api/categories/${id}`, { method: 'PATCH', body }),
}

/** Settings */
export const settingsApi = {
  get: () => request<SettingsResponse>('/api/settings'),
}

/** Transactions */
interface TransactionFilters {
  categoryId?: string
  type?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

interface TransactionsListResponse {
  transactions: TransactionResponse[]
}

export const transactionsApi = {
  list: (filters: TransactionFilters = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value != null && value !== '')
    )
    const suffix = params.toString() ? `?${params}` : ''
    return request<TransactionsListResponse>(`/api/transactions${suffix}`)
  },
  create: (body: CreateTransactionInput) => request<TransactionResponse>('/api/transactions', { method: 'POST', body }),
  update: (id: string, body: UpdateTransactionInput) => request<TransactionResponse>(`/api/transactions/${id}`, { method: 'PATCH', body }),
  delete: (id: string) => request<{ ok: boolean }>(`/api/transactions/${id}`, { method: 'DELETE' }),
}

/** CSV Import */
interface CsvPreviewBody {
  fileName: string
  content: string
  defaultSourceAccountId: string
  defaultDestinationAccountId?: string
}

interface CsvPreviewResponse {
  importBatch: { id: string }
  rows: Array<{ rowNumber: number; sourceHash: string; draft: boolean; duplicate: boolean; display: unknown; errors: string[]; warnings: string[]; suggestedAction?: string }>
  summary: { total: number; valid: number; duplicates: number; errors: number; ready: number }
}

interface CsvCommitBody {
  includeDuplicates: boolean
  rows: Array<{ rowNumber: number; sourceHash: string; draft: boolean }>
}

interface CsvCommitResponse {
  summary: { created: number; skippedDuplicates: number }
}

export const csvApi = {
  preview: (body: CsvPreviewBody) => request<CsvPreviewResponse>('/api/imports/csv/preview', { method: 'POST', body }),
  commit: (id: string, body: CsvCommitBody) => request<CsvCommitResponse>(`/api/imports/csv/${id}/commit`, { method: 'POST', body }),
}

/** Legacy combined export for backward compatibility during migration */
export const api = {
  me: authApi.me,
  login: authApi.login,
  logout: authApi.logout,
  accounts: accountsApi.list,
  categories: categoriesApi.list,
  settings: settingsApi.get,
  transactions: transactionsApi.list,
  createTransaction: transactionsApi.create,
  updateTransaction: transactionsApi.update,
  deleteTransaction: transactionsApi.delete,
  updateCategory: categoriesApi.update,
  previewCsv: csvApi.preview,
  commitCsv: csvApi.commit,
}