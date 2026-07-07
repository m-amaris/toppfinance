async function request(path, options = {}) {
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
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error ? payload.error : `HTTP ${response.status}`
    const error = new Error(message)
    error.status = response.status
    error.payload = payload
    throw error
  }

  return payload
}

export const api = {
  me: () => request('/api/auth/me'),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  accounts: () => request('/api/accounts'),
  categories: () => request('/api/categories'),
  settings: () => request('/api/settings'),
  transactions: (filters = {}) => {
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value != null && value !== ''))
    const suffix = params.toString() ? `?${params}` : ''
    return request(`/api/transactions${suffix}`)
  },
  createTransaction: (body) => request('/api/transactions', { method: 'POST', body }),
  updateTransaction: (id, body) => request(`/api/transactions/${id}`, { method: 'PATCH', body }),
  deleteTransaction: (id) => request(`/api/transactions/${id}`, { method: 'DELETE' }),
  updateCategory: (id, body) => request(`/api/categories/${id}`, { method: 'PATCH', body }),
  previewCsv: (body) => request('/api/imports/csv/preview', { method: 'POST', body }),
  commitCsv: (id, body) => request(`/api/imports/csv/${id}/commit`, { method: 'POST', body }),
}
