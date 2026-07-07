import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UserRole } from '@prisma/client'
import { config } from './config.js'
import { prisma } from './db.js'
import { hashIp, hashToken } from './security.js'

export type AuthUser = {
  id: string
  householdId: string
  email: string
  displayName: string
  role: UserRole
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[config.SESSION_COOKIE_NAME]
  if (!token) {
    return reply.code(401).send({ error: 'UNAUTHENTICATED' })
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })

  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active) {
    return reply.code(401).send({ error: 'UNAUTHENTICATED' })
  }

  request.user = {
    id: session.user.id,
    householdId: session.user.householdId,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  }

  await prisma.session.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
      ipHash: hashIp(request.ip),
    },
  })
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply)
  if (reply.sent) return
  if (request.user?.role !== 'ADMIN') {
    return reply.code(403).send({ error: 'FORBIDDEN' })
  }
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(config.SESSION_COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
  })
}
