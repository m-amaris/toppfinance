import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { config } from './config.js'

export async function registerHelmet(app: FastifyInstance): Promise<void> {
  const isProduction = config.NODE_ENV === 'production'

  await app.register(helmet, {
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
          },
        }
      : false,

    hsts: false,
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    dnsPrefetchControl: { allow: false },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    hidePoweredBy: true,
    xssFilter: true,
  })
}

export default fp(registerHelmet, {
  name: 'helmet',
  dependencies: [],
})