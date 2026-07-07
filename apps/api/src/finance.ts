import type { Prisma, TransactionType, Visibility } from '@prisma/client'
import { prisma } from './db.js'

export function toMoney(value: number | string) {
  return Number(Number(value).toFixed(2))
}

export function dateOnly(value: string) {
  return new Date(`${value}T12:00:00.000Z`)
}

export function assertSplitTotal(splits: Array<{ percent: number }>) {
  const total = splits.reduce((sum, split) => sum + split.percent, 0)
  if (Math.abs(total - 100) > 0.01) {
    throw new Error('El reparto debe sumar 100%')
  }
}

export function canSeeTransaction(input: {
  visibility: Visibility
  createdByUserId: string
  paidByUserId: string | null
  beneficiaryIds: string[]
  userId: string
}) {
  return input.visibility === 'SHARED'
    || input.createdByUserId === input.userId
    || input.paidByUserId === input.userId
    || input.beneficiaryIds.includes(input.userId)
}

export function accountVisibilityWhere(userId: string, householdId: string): Prisma.AccountWhereInput {
  return {
    householdId,
    OR: [
      { visibility: 'SHARED' },
      { ownerUserId: userId },
    ],
  }
}

export function transactionVisibilityWhere(userId: string, householdId: string): Prisma.TransactionWhereInput {
  return {
    householdId,
    OR: [
      { visibility: 'SHARED' },
      { createdByUserId: userId },
      { paidByUserId: userId },
      { beneficiaries: { some: { userId } } },
    ],
  }
}

export function buildAccountEntries(input: {
  transactionId: string
  type: TransactionType
  amount: number
  sourceAccountId?: string | null
  destinationAccountId?: string | null
}) {
  const amountAbs = Math.abs(toMoney(input.amount))
  const entries: Array<{ transactionId: string; accountId: string; amount: number }> = []

  if (input.type === 'INCOME') {
    if (!input.sourceAccountId) throw new Error('Los ingresos necesitan cuenta de entrada')
    entries.push({ transactionId: input.transactionId, accountId: input.sourceAccountId, amount: amountAbs })
  }

  if (input.type === 'EXPENSE') {
    if (!input.sourceAccountId) throw new Error('Los gastos necesitan cuenta de salida')
    entries.push({ transactionId: input.transactionId, accountId: input.sourceAccountId, amount: -amountAbs })
  }

  if (input.type === 'SAVING' || input.type === 'TRANSFER') {
    if (!input.sourceAccountId || !input.destinationAccountId) {
      throw new Error('Las transferencias necesitan cuenta origen y destino')
    }
    if (input.sourceAccountId === input.destinationAccountId) {
      throw new Error('La cuenta origen y destino no pueden ser la misma')
    }
    entries.push({ transactionId: input.transactionId, accountId: input.sourceAccountId, amount: -amountAbs })
    entries.push({ transactionId: input.transactionId, accountId: input.destinationAccountId, amount: amountAbs })
  }

  if (input.type === 'ADJUSTMENT') {
    if (!input.sourceAccountId) throw new Error('Los ajustes necesitan una cuenta')
    entries.push({ transactionId: input.transactionId, accountId: input.sourceAccountId, amount: toMoney(input.amount) })
  }

  return entries
}

export async function accountBalance(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { entries: true },
  })
  if (!account) return null
  const entriesTotal = account.entries.reduce((sum, entry) => sum + Number(entry.amount), 0)
  return toMoney(Number(account.openingBalance) + entriesTotal)
}

export async function accountWithBalance(account: {
  id: string
  openingBalance: Prisma.Decimal
  entries?: Array<{ amount: Prisma.Decimal }>
}) {
  const entries = account.entries ?? await prisma.accountEntry.findMany({ where: { accountId: account.id } })
  const entriesTotal = entries.reduce((sum, entry) => sum + Number(entry.amount), 0)
  return toMoney(Number(account.openingBalance) + entriesTotal)
}
