/**
 * Security headers plugin using @fastify/helmet.
 * Adds HTTP security headers for API protection.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { config } from './config.js'

/**
 * Register Helmet security headers
 */
export async function registerHelmet(app: FastifyInstance): Promise<void> {
  const isProduction = config.NODE_ENV === 'production'

  await app.register(helmet, {
    // Content Security Policy
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Swagger UI
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false, // Disable CSP in development for easier debugging

    // HTTP Strict Transport Security (HSTS)
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: true,
        }
      : false,

    // X-Frame-Options: DENY
    frameguard: { action: 'deny' },

    // X-Content-Type-Options: nosniff
    noSniff: true,

    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: { allow: false },

    // Cross-Origin Embedder Policy
    crossOriginEmbedderPolicy: isProduction ? { policy: 'require-corp' } : false,

    // Cross-Origin Opener Policy
    crossOriginOpenerPolicy: { policy: 'same-origin' },

    // Cross-Origin Resource Policy
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // Origin-Agent-Cluster
    originAgentCluster: true,

    // Hide X-Powered-By
    hidePoweredBy: true,

    // X-XSS-Protection (legacy, but harmless)
    xssFilter: true,
  })
}

/**
 * Fastify plugin for security headers
 */
export default fp(registerHelmet, {
  name: 'helmet',
  dependencies: [],
})