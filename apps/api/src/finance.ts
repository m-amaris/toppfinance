import type { Prisma, TransactionType, Visibility } from '@prisma/client'
import { prisma } from './db.js'
import {
  toMoney,
  dateOnly,
  assertSplitTotal,
  canSeeTransaction,
  accountVisibilityWhere,
  transactionVisibilityWhere,
  buildAccountEntries,
  calculateAccountBalance,
  validateAccountAccess,
  getDefaultAccountForType,
  validateTransferAccounts,
} from '@toppfinance/shared'

export { toMoney, dateOnly, assertSplitTotal, canSeeTransaction, accountVisibilityWhere, transactionVisibilityWhere, buildAccountEntries, calculateAccountBalance, validateAccountAccess, getDefaultAccountForType, validateTransferAccounts }

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
