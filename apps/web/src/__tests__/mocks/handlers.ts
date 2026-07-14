import { http, HttpResponse } from 'msw'

// Initial transactions for testing
interface TestTransaction {
  id: string
  description: string
  amount: number
  date: string
  type: string
  categoryId: string
  sourceAccountId: string
  visibility: string
}

const initialTransactions: TestTransaction[] = [
  { id: 'tx-1', description: 'Libros técnicos', amount: -25.50, date: '2026-06-15', type: 'EXPENSE', categoryId: 'otros', sourceAccountId: '1', visibility: 'SHARED' },
  { id: 'tx-2', description: 'Nómina junio', amount: 2000, date: '2026-06-01', type: 'INCOME', categoryId: 'nomina', sourceAccountId: '1', visibility: 'SHARED' },
]

// Store for created transactions
let createdTransactions: TestTransaction[] = []

export const handlers = [
  http.get('/api/auth/me', () => HttpResponse.json({ user: { id: 1, email: 'test@test.com', displayName: 'Test User' } })),
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json() as { email?: string; password?: string }
    const { email, password } = body
    if (email === 'test@test.com' && password === 'password') {
      return HttpResponse.json({ user: { id: 1, email, displayName: 'Test User' } })
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }),
  http.post('/api/auth/logout', () => HttpResponse.json({ ok: true })),
  http.get('/api/accounts', () => HttpResponse.json({ accounts: [
    { id: '1', name: 'Cuenta Principal', type: 'CHECKING', balance: '1000.00', visibility: 'SHARED', ownerName: 'Test User' },
    { id: '2', name: 'Ahorro', type: 'SAVINGS', balance: '500.00', visibility: 'SHARED', ownerName: 'Test User' },
  ] })),
  http.get('/api/categories', () => HttpResponse.json({ categories: [
    { id: '1', slug: 'vivienda', label: 'Vivienda', icon: 'Home', color: '#ff0000', type: 'EXPENSE' },
    { id: '2', slug: 'alimentacion', label: 'Alimentación', icon: 'Utensils', color: '#00ff00', type: 'EXPENSE' },
    { id: '3', slug: 'ocio', label: 'Ocio', icon: 'Gamepad2', color: '#0000ff', type: 'EXPENSE' },
    { id: '4', slug: 'nomina', label: 'Nómina', icon: 'Briefcase', color: '#00ffff', type: 'INCOME' },
    { id: '5', slug: 'ahorro', label: 'Ahorro', icon: 'PiggyBank', color: '#ffff00', type: 'SAVING' },
    { id: '6', slug: 'transferencia_interna', label: 'Transferencia Interna', icon: 'ArrowLeftRight', color: '#ff00ff', type: 'TRANSFER' },
    { id: '7', slug: 'ajuste_manual', label: 'Ajuste Manual', icon: 'Scale', color: '#ffffff', type: 'ADJUSTMENT' },
  ] })),
  http.get('/api/settings', () => HttpResponse.json({
    currency: 'EUR',
    tasaAhorroObjetivo: 20,
    mostrarAhorroEnAnalisis: true,
  })),
  http.get('/api/transactions', () => HttpResponse.json({
    transactions: [...initialTransactions, ...createdTransactions]
  })),
  http.post('/api/transactions', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    const newTx: TestTransaction = {
      id: 'new-tx-' + Date.now(),
      description: String(body.description ?? ''),
      amount: Number(body.amount ?? 0),
      date: String(body.date ?? ''),
      type: String(body.type ?? ''),
      categoryId: String(body.categoryId ?? ''),
      sourceAccountId: String(body.sourceAccountId ?? ''),
      visibility: String(body.visibility ?? 'SHARED'),
    }
    createdTransactions.push(newTx)
    return HttpResponse.json(newTx, { status: 201 })
  }),
  http.patch('/api/transactions/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ id: params.id, ...body })
  }),
  http.delete('/api/transactions/:id', () => HttpResponse.json({ ok: true })),
  http.patch('/api/categories/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ id: params.id, ...body })
  }),
  http.post('/api/imports/csv/preview', async ({ request }) => {
    await request.json() // consume body
    return HttpResponse.json({
      importBatch: { id: 'batch-1' },
      rows: [],
      summary: { total: 0, valid: 0, duplicates: 0, errors: 0 },
    })
  }),
  http.post('/api/imports/csv/:id/commit', async ({ request }) => {
    const body = await request.json() as { rows?: unknown[] }
    return HttpResponse.json({ imported: body.rows?.length || 0 })
  }),
]

// Reset function for tests
export function resetHandlers() {
  createdTransactions = []
}