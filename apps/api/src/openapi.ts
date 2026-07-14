/**
 * OpenAPI/Swagger configuration for API documentation.
 * Generates OpenAPI 3.1 spec and serves Swagger UI.
 */

import type { FastifyInstance, FastifyPluginCallback } from 'fastify'
import fp from 'fastify-plugin'
import * as fastifySwaggerModule from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'
import { API_VERSION_CONFIG } from './apiVersion.js'

const swaggerPlugin = fastifySwaggerModule.default ?? fastifySwaggerModule.fastifySwagger

/**
 * Build OpenAPI info object
 */
export const openApiInfo = {
  title: 'ToppFinance API',
  description: `
# ToppFinance API

Financial management API for household budgeting, transaction tracking, and AI-powered insights.

## Authentication

All endpoints (except health) require authentication via session cookie.
- **Login**: \`POST /api/v1/auth/login\` with email/password
- **Session**: HttpOnly cookie named \`session\`
- **Logout**: \`POST /api/v1/auth/logout\`

## Versioning

API version is specified in the URL path: \`/api/v1/...\`
Supported versions: \`${API_VERSION_CONFIG.supported.join(', ')}\`
Current version: \`${API_VERSION_CONFIG.current}\`

Clients can request a specific version via the \`Accept-Version\` header.

## Error Format

All errors follow a consistent format:
\`\`\`json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": [{"path": ["field"], "message": "Validation error"}],
  "timestamp": "2024-01-01T00:00:00.000Z",
  "path": "/api/v1/endpoint"
}
\`\`\`

Common error codes:
- \`VALIDATION_ERROR\` (400) - Request validation failed
- \`INVALID_CREDENTIALS\` (401) - Wrong email/password
- \`UNAUTHENTICATED\` (401) - No valid session
- \`FORBIDDEN\` (403) - Insufficient permissions
- \`NOT_FOUND\` (404) - Resource doesn't exist
- \`CONFLICT\` (409) - Resource conflict
- \`ALREADY_EXISTS\` (409) - Duplicate resource
- \`INTERNAL_ERROR\` (500) - Server error
- \`DATABASE_ERROR\` (500) - Database issue

## Pagination

List endpoints support pagination via query parameters:
- \`page\` (default: 1)
- \`pageSize\` (default: 20, max: 100)

Response includes:
\`\`\`json
{
  "data": {
    "items": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}
\`\`\`

## Rate Limiting

API endpoints are rate limited:
- Auth endpoints: 10 requests/minute
- General API: 100 requests/minute
- Admin endpoints: 50 requests/minute

Exceeding limits returns 429 with \`Retry-After\` header.

## Monetary Values

All monetary amounts are handled as **integer cents** (Money type).
- Input: decimal (e.g., \`15.50\`) → stored as cents (\`1550\`)
- Output: cents → decimal string
- Use \`formatMoney(cents)\` for display
  `,
  version: '1.0.0',
  contact: {
    name: 'ToppFinance Team',
    url: 'https://github.com/toppfinance',
  },
  license: {
    name: 'Proprietary',
  },
}

/**
 * OpenAPI server configuration
 */
export const openApiServers = [
  {
    url: '/api/v1',
    description: 'Current API version (v1)',
  },
]

/**
 * OpenAPI tags for grouping endpoints
 */
export const openApiTags = [
  { name: 'Health', description: 'Health check endpoints' },
  { name: 'Authentication', description: 'Login, logout, session management' },
  { name: 'Accounts', description: 'Bank account management' },
  { name: 'Categories', description: 'Transaction category management' },
  { name: 'Transactions', description: 'Transaction CRUD and queries' },
  { name: 'Imports', description: 'CSV import preview and commit' },
  { name: 'Exports', description: 'Data export (CSV, JSON)' },
  { name: 'Settings', description: 'User and household settings' },
  { name: 'AI', description: 'AI-powered financial insights' },
  { name: 'Admin', description: 'Administrative endpoints (requires ADMIN role)' },
]

/**
 * Get status description for OpenAPI
 */
function getStatusDescription(statusCode: number): string {
  const descriptions: Record<number, string> = {
    200: 'Successful response',
    201: 'Resource created',
    204: 'No content',
    400: 'Bad request - validation error',
    401: 'Unauthenticated',
    403: 'Forbidden - insufficient permissions',
    404: 'Not found',
    409: 'Conflict - resource already exists',
    422: 'Unprocessable entity',
    429: 'Too many requests',
    500: 'Internal server error',
  }
  return descriptions[statusCode] ?? 'Response'
}

/**
 * Register OpenAPI/Swagger with Fastify
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(swaggerPlugin as any, {
    openapi: {
      info: openApiInfo,
      servers: openApiServers,
      tags: openApiTags,
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'toppfinance_session',
            description: 'Session cookie authentication',
          },
        },
        schemas: {
          // Common error response
          ApiError: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              code: { type: 'string' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    path: { type: 'array', items: { type: 'string' } },
                    message: { type: 'string' },
                  },
                },
              },
              timestamp: { type: 'string', format: 'date-time' },
              path: { type: 'string' },
            },
            required: ['error', 'code', 'timestamp'],
          },
          // Success response wrapper
          ApiSuccess: {
            type: 'object',
            properties: {
              data: {},
            },
            required: ['data'],
          },
          // Paginated response
          PaginatedResponse: {
            type: 'object',
            properties: {
              items: { type: 'array', items: {} },
              total: { type: 'integer' },
              page: { type: 'integer' },
              pageSize: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
            required: ['items', 'total', 'page', 'pageSize', 'totalPages'],
          },
        },
        responses: {
          ValidationError: {
            description: 'Validation error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: {
                  error: 'Cuerpo de solicitud inválido',
                  code: 'VALIDATION_ERROR',
                  details: [{ path: ['amount'], message: 'Expected number, received nan' }],
                  timestamp: '2024-01-01T00:00:00.000Z',
                },
              },
            },
          },
          Unauthenticated: {
            description: 'Not authenticated',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: { error: 'No autenticado', code: 'UNAUTHENTICATED', timestamp: '2024-01-01T00:00:00.000Z' },
              },
            },
          },
          Forbidden: {
            description: 'Access denied',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: { error: 'Acceso denegado', code: 'FORBIDDEN', timestamp: '2024-01-01T00:00:00.000Z' },
              },
            },
          },
          NotFound: {
            description: 'Resource not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: { error: 'Transacción no encontrado', code: 'NOT_FOUND', timestamp: '2024-01-01T00:00:00.000Z' },
              },
            },
          },
          InternalError: {
            description: 'Internal server error',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiError' },
                example: { error: 'Error interno del servidor', code: 'INTERNAL_ERROR', timestamp: '2024-01-01T00:00:00.000Z' },
              },
            },
          },
        },
      },
      security: [{ cookieAuth: [] }],
    },
    transform: true,
    transformObject: true,
  })

  await app.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  })
}

/**
 * Fastify plugin for OpenAPI
 */
export default fp(registerOpenApi, {
  name: 'openapi',
  dependencies: [],
})