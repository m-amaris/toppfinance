import '@testing-library/jest-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as rtlRender, screen, fireEvent, cleanup, waitFor, act, within, getByRole, getByText, getByLabelText, getByPlaceholderText, getByTestId, queryByRole, queryByText, queryByLabelText, queryByPlaceholderText, queryByTestId, findByRole, findByText, findByLabelText, findByPlaceholderText, findByTestId } from '@testing-library/react'
import React from 'react'

// Create a QueryClient for testing
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      gcTime: 0,
      staleTime: 0,
    },
    mutations: {
      retry: false,
    },
  },
})

// Custom render with providers
export function render(ui: React.ReactElement, options: { queryClient?: QueryClient } = {}) {
  const client = options.queryClient || queryClient
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  )
  return rtlRender(ui, { wrapper: Wrapper, ...options })
}

// Re-export everything from @testing-library/react except render
export { screen, fireEvent, cleanup, waitFor, act, within, getByRole, getByText, getByLabelText, getByPlaceholderText, getByTestId, queryByRole, queryByText, queryByLabelText, queryByPlaceholderText, queryByTestId, findByRole, findByText, findByLabelText, findByPlaceholderText, findByTestId }

// Export QueryClientProvider for tests that need to wrap with it
export { QueryClientProvider } from '@tanstack/react-query'