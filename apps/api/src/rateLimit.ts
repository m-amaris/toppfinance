/**
 * Rate limiting configuration and plugin for Fastify.
 * Uses @fastify/rate-limit with configurable limits per endpoint group.
 */

import type { FastifyInstance, FastifyRequest, RouteOptions } from 'fastify'
import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { config } from './config.js'

/**
 * Default key generator - uses IP + User-Agent for granularity
 */
function defaultKeyGenerator(request: FastifyRequest): string {
  const ip = request.ip ?? 'unknown'
  const userAgent = request.headers['user-agent'] ?? 'unknown'
  return `${ip}:${userAgent.slice(0, 50)}`
}

/**
 * Key generator for authenticated routes - uses user ID when available
 */
function authKeyGenerator(request: FastifyRequest): string {
  const user = request.user as { id?: string } | undefined
  if (user?.id) return `user:${user.id}`
  return defaultKeyGenerator(request)
}

/**
 * Custom error response for rate limit exceeded
 */
function errorResponseBuilder(
  request: FastifyRequest,
  context: { statusCode: number; ban: boolean; after: string; max: number; ttl: number }
) {
  const retryAfter = Math.ceil(context.ttl / 1000)
  request.log.warn({ reqId: request.id, ip: request.ip }, 'Rate limit exceeded')
  return {
    error: 'Demasiadas solicitudes',
    code: 'RATE_LIMIT_EXCEEDED',
    details: [
      {
        path: [],
        message: `Límite de ${context.max} solicitudes excedido. Reintente en ${retryAfter} segundos`,
      },
    ],
    timestamp: new Date().toISOString(),
    path: request.url,
    retryAfter,
  }
}

/**
 * Register rate limiting with Fastify
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const isProduction = config.NODE_ENV === 'production'

  // Register the rate limit plugin with basic config
  // Per-route limits are applied via onRoute hook
  await app.register(rateLimit, {
    global: false,
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: defaultKeyGenerator,
    allowList: config.RATE_LIMIT_ALLOWLIST?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
    ban: config.RATE_LIMIT_BAN_DURATION_MS > 0 ? config.RATE_LIMIT_BAN_DURATION_MS : undefined,
    cache: config.RATE_LIMIT_CACHE_SIZE,
    skipOnError: !isProduction,
    errorResponseBuilder,
  })

  // Add rate limit group to request for logging
  app.addHook('preHandler', async (request) => {
    const url = request.url
    let group = 'default'
    if (url.startsWith('/api/v1/auth/')) group = 'auth'
    else if (url.startsWith('/api/v1/admin/')) group = 'admin'
    else if (url.startsWith('/api/v1/ai/')) group = 'ai'
    else if (url.startsWith('/api/v1/imports/')) group = 'import'
    else if (url.startsWith('/api/v1/exports/')) group = 'export'
    else if (url.startsWith('/api/v1/')) group = 'api'
    ;(request as FastifyRequest & { rateLimitGroup?: string }).rateLimitGroup = group
  })

  // Apply per-route rate limits based on URL pattern
  app.addHook('onRoute', (routeOptions: RouteOptions) => {
    const { method, url } = routeOptions
    const methods = Array.isArray(method) ? method : [method]

    // Skip non-API routes
    if (!url.startsWith('/api/v1/')) return

    // Determine rate limit config based on URL pattern
    let limitConfig: { max: number; timeWindow: number; keyGenerator: (req: FastifyRequest) => string } | null = null

    if (url.startsWith('/api/v1/auth/')) {
      limitConfig = { max: 10, timeWindow: 60_000, keyGenerator: defaultKeyGenerator }
    } else if (url.startsWith('/api/v1/admin/')) {
      limitConfig = { max: 50, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    } else if (url.startsWith('/api/v1/ai/')) {
      limitConfig = { max: 10, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    } else if (url.startsWith('/api/v1/imports/')) {
      limitConfig = { max: 20, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    } else if (url.startsWith('/api/v1/exports/')) {
      limitConfig = { max: 30, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    } else if (methods.includes('GET') && methods.length === 1) {
      // Read-only GET endpoints get higher limit
      limitConfig = { max: 200, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    } else {
      // Standard API endpoints
      limitConfig = { max: 100, timeWindow: 60_000, keyGenerator: authKeyGenerator }
    }

    if (limitConfig) {
      const existingPreHandlers = routeOptions.preHandler
        ? Array.isArray(routeOptions.preHandler)
          ? routeOptions.preHandler
          : [routeOptions.preHandler]
        : []

      routeOptions.preHandler = [
        ...existingPreHandlers,
        app.rateLimit({
          max: limitConfig.max,
          timeWindow: limitConfig.timeWindow,
          keyGenerator: limitConfig.keyGenerator,
        }),
      ]
    }
  })
}

/**
 * Fastify plugin for rate limiting
 */
export default fp(registerRateLimit, {
  name: 'rate-limit',
  dependencies: [],
})

// Extend FastifyRequest type for rate limit group
declare module 'fastify' {
  interface FastifyRequest {
    rateLimitGroup?: string
  }
}