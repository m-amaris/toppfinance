import { QueryClient } from '@tanstack/react-query'

interface ApiError extends Error {
  status?: number
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: (failureCount, error) => {
        const apiError = error as ApiError
        if (apiError.status === 401 || apiError.status === 403) return false
        return failureCount < 2
      },
      refetchOnWindowFocus: false,
    },
  },
})