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
  http.get('/api/v1/auth/me', () => HttpResponse.json({ data: { user: { id: '1', email: 'test@test.com', displayName: 'Test User' }, household: { id: 'household-1', name: 'Test' } } })),
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as { email?: string; password?: string }
    const { email, password } = body
    if (email === 'test@test.com' && password === 'password') {
      return HttpResponse.json({ data: { user: { id: '1', email, displayName: 'Test User' }, household: { id: 'household-1', name: 'Test' } } })
    }
    return HttpResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }),
  http.post('/api/v1/auth/logout', () => HttpResponse.json({ data: { ok: true } })),
  http.get('/api/v1/accounts', () => HttpResponse.json({ data: { accounts: [
    { id: '1', name: 'Cuenta Principal', type: 'CHECKING', balance: '1000.00', visibility: 'SHARED', ownerName: 'Test User' },
    { id: '2', name: 'Ahorro', type: 'SAVINGS', balance: '500.00', visibility: 'SHARED', ownerName: 'Test User' },
  ] } })),
  http.get('/api/v1/categories', () => HttpResponse.json({ data: { categories: [
    { id: '1', slug: 'vivienda', name: 'Vivienda', icon: 'Home', color: '#ff0000', type: 'EXPENSE' },
    { id: '2', slug: 'alimentacion', name: 'Alimentación', icon: 'Utensils', color: '#00ff00', type: 'EXPENSE' },
    { id: '3', slug: 'ocio', name: 'Ocio', icon: 'Gamepad2', color: '#0000ff', type: 'EXPENSE' },
    { id: '4', slug: 'nomina', name: 'Nómina', icon: 'Briefcase', color: '#00ffff', type: 'INCOME' },
    { id: '5', slug: 'ahorro', name: 'Ahorro', icon: 'PiggyBank', color: '#ffff00', type: 'SAVING' },
    { id: '6', slug: 'transferencia_interna', name: 'Transferencia Interna', icon: 'ArrowLeftRight', color: '#ff00ff', type: 'TRANSFER' },
    { id: '7', slug: 'ajuste_manual', name: 'Ajuste Manual', icon: 'Scale', color: '#ffffff', type: 'ADJUSTMENT' },
  ] } })),
  http.get('/api/v1/settings', () => HttpResponse.json({ data: {
    currency: 'EUR',
    tasaAhorroObjetivo: 20,
    mostrarAhorroEnAnalisis: true,
  } })),
  http.get('/api/v1/transactions', () => HttpResponse.json({ data: {
    items: [...initialTransactions, ...createdTransactions], total: initialTransactions.length + createdTransactions.length, page: 1, pageSize: 20, totalPages: 1,
  } })),
  http.post('/api/v1/transactions', async ({ request }) => {
    const body = await request.json() as Record<string, unknown>
    if (!Array.isArray(body.beneficiarySplits) || body.beneficiarySplits.length === 0) {
      return HttpResponse.json({ error: 'Se requiere al menos un beneficiario' }, { status: 400 })
    }
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
    return HttpResponse.json({ data: { transaction: newTx } }, { status: 201 })
  }),
  http.patch('/api/v1/transactions/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ data: { transaction: { id: params.id, ...body } } })
  }),
  http.delete('/api/v1/transactions/:id', () => HttpResponse.json({ data: { ok: true } })),
  http.patch('/api/v1/categories/:id', async ({ request, params }) => {
    const body = await request.json() as Record<string, unknown>
    return HttpResponse.json({ data: { category: { id: params.id, ...body } } })
  }),
  http.post('/api/v1/imports/csv/preview', async ({ request }) => {
    await request.json() // consume body
    return HttpResponse.json({ data: {
      importBatch: { id: 'batch-1' },
      rows: [],
      summary: { total: 0, valid: 0, duplicates: 0, errors: 0 },
    } })
  }),
  http.post('/api/v1/imports/csv/:id/commit', async ({ request }) => {
    const body = await request.json() as { rows?: unknown[] }
    return HttpResponse.json({ data: { summary: { created: body.rows?.length || 0, skippedDuplicates: 0 } } })
  }),
]

// Reset function for tests
export function resetHandlers() {
  createdTransactions = []
}
