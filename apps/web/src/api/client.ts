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

interface ApiEnvelope<T> {
  data: T
}

const API_BASE_PATH = '/api/v1'

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const hasBody = options.body !== undefined
  const response = await fetch(`${API_BASE_PATH}${path}`, {
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

  if (!contentType.includes('application/json') || typeof payload !== 'object' || payload === null || !('data' in payload)) {
    throw new Error(`Respuesta inválida de la API (${response.status}): se esperaba JSON con el campo data`)
  }

  return (payload as ApiEnvelope<T>).data
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
  me: () => request<AuthMeResponse>('/auth/me'),
  login: (email: string, password: string) => request<LoginResponse>('/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
}

/** Accounts */
interface AccountsListResponse {
  accounts: AccountWithBalanceResponse[]
}

export const accountsApi = {
  list: () => request<AccountsListResponse>('/accounts'),
}

/** Categories */
interface CategoriesListResponse {
  categories: CategoryResponse[]
}

export const categoriesApi = {
  list: () => request<CategoriesListResponse>('/categories'),
  update: async (id: string, body: UpdateCategoryInput) => {
    const { category } = await request<{ category: CategoryResponse }>(`/categories/${id}`, { method: 'PATCH', body })
    return category
  },
}

/** Settings */
export const settingsApi = {
  get: () => request<SettingsResponse>('/settings'),
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

interface TransactionsPageResponse {
  items: TransactionResponse[]
}

export const transactionsApi = {
  list: async (filters: TransactionFilters = {}) => {
    const params = new URLSearchParams(
      Object.entries(filters).filter(([, value]) => value != null && value !== '')
    )
    const suffix = params.toString() ? `?${params}` : ''
    const page = await request<TransactionsPageResponse>(`/transactions${suffix}`)
    return { transactions: page.items }
  },
  create: async (body: CreateTransactionInput) => {
    const { transaction } = await request<{ transaction: TransactionResponse }>('/transactions', { method: 'POST', body })
    return transaction
  },
  update: async (id: string, body: UpdateTransactionInput) => {
    const { transaction } = await request<{ transaction: TransactionResponse }>(`/transactions/${id}`, { method: 'PATCH', body })
    return transaction
  },
  delete: (id: string) => request<{ ok: boolean }>(`/transactions/${id}`, { method: 'DELETE' }),
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
  preview: (body: CsvPreviewBody) => request<CsvPreviewResponse>('/imports/csv/preview', { method: 'POST', body }),
  commit: (id: string, body: CsvCommitBody) => request<CsvCommitResponse>(`/imports/csv/${id}/commit`, { method: 'POST', body }),
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
