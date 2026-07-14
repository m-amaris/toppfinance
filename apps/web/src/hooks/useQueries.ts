import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi, accountsApi, categoriesApi, settingsApi, transactionsApi, csvApi } from '../api/client.ts'
import type {
  CreateTransactionInput,
  UpdateTransactionInput,
  UpdateCategoryInput,
} from '@toppfinance/shared'

/** Query keys for consistent caching */
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    status: ['auth', 'status'] as const,
  },
  accounts: {
    all: ['accounts'] as const,
    list: () => [...queryKeys.accounts.all, 'list'] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => [...queryKeys.categories.all, 'list'] as const,
  },
  settings: {
    all: ['settings'] as const,
    get: () => [...queryKeys.settings.all, 'get'] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (filters: Record<string, unknown> = {}) => [...queryKeys.transactions.all, 'list', filters] as const,
  },
  csv: {
    preview: ['csv', 'preview'] as const,
  },
}

/** Auth hooks */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: authApi.me,
    retry: false,
    staleTime: Infinity,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => authApi.login(email, password),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      queryClient.clear()
    },
  })
}

/** Accounts hooks */
export function useAccounts() {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: accountsApi.list,
  })
}

/** Categories hooks */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: categoriesApi.list,
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryInput }) => categoriesApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.list() })
    },
  })
}

/** Settings hooks */
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings.get(),
    queryFn: settingsApi.get,
  })
}

/** Transactions hooks */
export function useTransactions(filters: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: queryKeys.transactions.list(filters),
    queryFn: () => transactionsApi.list(filters),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTransactionInput) => transactionsApi.create(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTransactionInput }) => transactionsApi.update(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => transactionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}

/** CSV Import hooks */
export function useCsvPreview() {
  return useMutation({
    mutationFn: csvApi.preview,
  })
}

export function useCsvCommit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { includeDuplicates: boolean; rows: Array<{ rowNumber: number; sourceHash: string; draft: boolean }> } }) => csvApi.commit(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all })
    },
  })
}