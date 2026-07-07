import { z } from 'zod'

export const currency = 'EUR' as const
export const locale = 'es-ES' as const

export const transactionTypes = ['EXPENSE', 'INCOME', 'SAVING', 'TRANSFER', 'ADJUSTMENT'] as const
export const visibilityValues = ['PRIVATE', 'SHARED'] as const
export const accountTypes = ['PERSONAL', 'SHARED', 'SAVINGS', 'CASH', 'OTHER'] as const
export const budgetScopes = ['USER', 'SHARED'] as const

export const transactionTypeSchema = z.enum(transactionTypes)
export const visibilitySchema = z.enum(visibilityValues)
export const accountTypeSchema = z.enum(accountTypes)
export const budgetScopeSchema = z.enum(budgetScopes)

export type TransactionType = z.infer<typeof transactionTypeSchema>
export type Visibility = z.infer<typeof visibilitySchema>
export type AccountType = z.infer<typeof accountTypeSchema>
export type BudgetScope = z.infer<typeof budgetScopeSchema>

export const splitPartSchema = z.object({
  userId: z.string().min(1),
  percent: z.number().min(0).max(100),
})

export const createTransactionSchema = z.object({
  type: transactionTypeSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number(),
  description: z.string().trim().min(1).max(240),
  categoryId: z.string().min(1),
  sourceAccountId: z.string().min(1).optional().nullable(),
  destinationAccountId: z.string().min(1).optional().nullable(),
  visibility: visibilitySchema,
  paidByUserId: z.string().min(1).optional().nullable(),
  beneficiarySplits: z.array(splitPartSchema).min(1),
  merchantName: z.string().trim().max(120).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const updateTransactionSchema = createTransactionSchema.partial().extend({
  beneficiarySplits: z.array(splitPartSchema).min(1).optional(),
})

export const transactionFiltersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: transactionTypeSchema.optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  visibility: visibilitySchema.optional(),
})

export const aiSettingsSchema = z.object({
  defaultModel: z.string().trim().min(1),
  fallbackModels: z.array(z.string().trim().min(1)).default([]),
  enforceZdr: z.boolean().default(true),
  dataCollection: z.enum(['deny', 'allow']).default('deny'),
})

export const backupPolicySchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']).default('weekly'),
  retentionWeeks: z.number().int().min(1).max(260).default(30),
  backupDir: z.string().trim().min(1).default('./backups'),
})

export const defaultCategories = [
  { type: 'EXPENSE', slug: 'vivienda', name: 'Vivienda', icon: 'Home', color: '#01696f' },
  { type: 'EXPENSE', slug: 'servicios', name: 'Servicios', icon: 'Bolt', color: '#0f766e' },
  { type: 'EXPENSE', slug: 'alimentacion', name: 'Alimentacion', icon: 'ShoppingCart', color: '#437a22' },
  { type: 'EXPENSE', slug: 'transporte', name: 'Transporte', icon: 'Car', color: '#006494' },
  { type: 'EXPENSE', slug: 'salud', name: 'Salud', icon: 'Heart', color: '#964219' },
  { type: 'EXPENSE', slug: 'deporte', name: 'Deporte', icon: 'Dumbbell', color: '#1d4ed8' },
  { type: 'EXPENSE', slug: 'ocio', name: 'Ocio', icon: 'Gamepad2', color: '#d19900' },
  { type: 'EXPENSE', slug: 'compras', name: 'Compras', icon: 'Package', color: '#7a39bb' },
  { type: 'EXPENSE', slug: 'educacion', name: 'Educacion', icon: 'GraduationCap', color: '#a13544' },
  { type: 'EXPENSE', slug: 'ropa', name: 'Ropa', icon: 'Shirt', color: '#da7101' },
  { type: 'EXPENSE', slug: 'viajes', name: 'Viajes', icon: 'Plane', color: '#0891b2' },
  { type: 'EXPENSE', slug: 'regalos', name: 'Regalos', icon: 'Gift', color: '#be185d' },
  { type: 'EXPENSE', slug: 'otros', name: 'Otros', icon: 'MoreHorizontal', color: '#7a7974' },
  { type: 'INCOME', slug: 'nomina', name: 'Nomina', icon: 'Briefcase', color: '#01696f' },
  { type: 'INCOME', slug: 'freelance', name: 'Freelance', icon: 'Code2', color: '#437a22' },
  { type: 'INCOME', slug: 'inversiones', name: 'Inversiones', icon: 'TrendingUp', color: '#006494' },
  { type: 'INCOME', slug: 'otros_ingreso', name: 'Otros ingresos', icon: 'Plus', color: '#7a7974' },
  { type: 'SAVING', slug: 'ahorro', name: 'Ahorro', icon: 'PiggyBank', color: '#01696f' },
  { type: 'TRANSFER', slug: 'transferencia_interna', name: 'Transferencia interna', icon: 'ArrowLeftRight', color: '#0f766e' },
  { type: 'ADJUSTMENT', slug: 'ajuste_manual', name: 'Ajuste manual', icon: 'Scale', color: '#7a7974' },
] as const satisfies Array<{
  type: TransactionType
  slug: string
  name: string
  icon: string
  color: string
}>

export const defaultSharedSplit = {
  miguelPercent: 50,
  saraPercent: 50,
}
