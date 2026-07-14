/**
 * API Response helpers for consistent success envelopes.
 * Uses the shared apiSuccessSchema and paginatedResponseSchema patterns.
 */

import type { FastifyReply } from 'fastify'

export interface SuccessResponse<T> {
  data: T
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ListResponse<T> {
  items: T[]
  total: number
}

export function success<T>(reply: FastifyReply, data: T, statusCode = 200): FastifyReply {
  return reply.status(statusCode).send({ data })
}

export function created<T>(reply: FastifyReply, data: T): FastifyReply {
  return reply.status(201).send({ data })
}

export function noContent(reply: FastifyReply): FastifyReply {
  return reply.status(204).send()
}

export function paginated<T>(
  reply: FastifyReply,
  items: T[],
  total: number,
  page: number,
  pageSize: number
): FastifyReply {
  return success(reply, {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  } as PaginatedResponse<T>)
}

export function list<T>(reply: FastifyReply, items: T[], total?: number): FastifyReply {
  return success(reply, {
    items,
    total: total ?? items.length,
  } as ListResponse<T>)
}

/**
 * Extracts pagination parameters from query with defaults and validation.
 */
export function getPaginationParams(query: Record<string, unknown>): {
  page: number
  pageSize: number
  skip: number
  take: number
} {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  }
}