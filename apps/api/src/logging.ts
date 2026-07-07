import type { LogCategory, LogLevel } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from './db.js'

export async function appLog(input: {
  householdId?: string | null
  level: LogLevel
  category: LogCategory
  message: string
  metadata?: Record<string, unknown>
}) {
  try {
    await prisma.appLog.create({
      data: {
        householdId: input.householdId ?? null,
        level: input.level,
        category: input.category,
        message: input.message,
        metadata: input.metadata as Prisma.InputJsonValue ?? undefined,
      },
    })
  } catch (error) {
    console.error('Could not persist app log', error)
  }
}

export async function auditLog(input: {
  householdId: string
  actorUserId?: string | null
  entity: string
  entityId?: string | null
  action: string
  metadata?: Record<string, unknown>
}) {
  await prisma.auditLog.create({
    data: {
      householdId: input.householdId,
      actorUserId: input.actorUserId ?? null,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      metadata: input.metadata as Prisma.InputJsonValue ?? undefined,
    },
  })
}
