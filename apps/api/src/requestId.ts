/**
 * Request ID / Correlation ID plugin for Fastify.
 * Generates or extracts request IDs for tracing across services.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { createSecureToken } from '@toppfinance/shared'

const REQUEST_ID_HEADER = 'x-request-id'
const REQUEST_ID_HEADER_LOWER = REQUEST_ID_HEADER.toLowerCase()

/**
 * Fastify plugin to add request ID to every request
 */
export async function registerRequestId(app: FastifyInstance): Promise<void> {
  // Add request ID hook - runs early
  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Get or generate request ID
    const incomingId = request.headers[REQUEST_ID_HEADER_LOWER]
    const requestId = Array.isArray(incomingId) ? incomingId[0] : incomingId ?? createSecureToken(16)

    // Attach to request for use in handlers
    request.id = requestId

    // Set response header for client correlation
    reply.header(REQUEST_ID_HEADER, requestId)
  })

  // Add request ID to logs
  app.addHook('preHandler', async (request: FastifyRequest) => {
    // Ensure child logger includes request ID
    request.log = request.log.child({ reqId: request.id })
  })

  // Add request ID to error responses
  app.addHook('onError', async (request: FastifyRequest, reply: FastifyReply, error: Error) => {
    reply.header(REQUEST_ID_HEADER, request.id)
  })
}

/**
 * Get request ID from request (type-safe accessor)
 */
export function getRequestId(request: FastifyRequest): string {
  return request.id ?? 'unknown'
}

export { REQUEST_ID_HEADER }

/**
 * Fastify plugin wrapper
 */
export default fp(registerRequestId, {
  name: 'request-id',
  dependencies: [],
})