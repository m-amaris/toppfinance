import type { FastifyInstance, FastifyRequest, FastifyReply, RouteOptions } from 'fastify'
import { ZodTypeAny, ZodError, type SafeParseReturnType } from 'zod'
import { ApiError, isApiError, type ApiErrorDetails } from './apiErrors.js'

export interface ValidationOptions {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
  stripUnknown?: boolean
}

/**
 * Formats a ZodError into ApiErrorDetails array.
 */
function formatZodError(error: ZodError): ApiErrorDetails[] {
  return error.issues.map(issue => ({
    path: issue.path,
    message: issue.message,
  }))
}

/**
 * Validates data against a Zod schema and throws ApiError on failure.
 */
function validateSchema<T>(
  schema: ZodTypeAny,
  data: unknown,
  _stripUnknown: boolean
): SafeParseReturnType<T, T> {
  return schema.safeParse(data) as SafeParseReturnType<T, T>
}

/**
 * Creates a preHandler hook for input validation.
 */
export function createValidationHook(options: ValidationOptions) {
  return async function validationHook(request: FastifyRequest, reply: FastifyReply) {
    const { body, query, params, stripUnknown = true } = options

    try {
      if (body) {
        const result = validateSchema(body, request.body, stripUnknown)
        if (!result.success) {
          throw ApiError.validation('Cuerpo de solicitud inválido', formatZodError(result.error))
        }
        request.body = result.data
      }

      if (query) {
        const result = validateSchema(query, request.query, stripUnknown)
        if (!result.success) {
          throw ApiError.validation('Parámetros de consulta inválidos', formatZodError(result.error))
        }
        request.query = result.data
      }

      if (params) {
        const result = validateSchema(params, request.params, stripUnknown)
        if (!result.success) {
          throw ApiError.validation('Parámetros de ruta inválidos', formatZodError(result.error))
        }
        request.params = result.data
      }
    } catch (error) {
      if (isApiError(error)) throw error
      throw ApiError.internal('Error de validación')
    }
  }
}

/**
 * Creates an onSend hook for response validation.
 */
export function createResponseValidationHook(responseSchema: ZodTypeAny) {
  return async function responseValidationHook(
    _request: FastifyRequest,
    reply: FastifyReply,
    payload: unknown
  ) {
    // Skip validation for error responses (they're already standardized)
    if (reply.statusCode >= 400) return payload

    // Skip validation for 204 No Content
    if (reply.statusCode === 204) return payload

    const result = responseSchema.safeParse(payload)
    if (!result.success) {
      // Log but don't block in production - response validation errors
      // indicate a bug in the route handler, not a client error
      const error = new Error(
        `Response validation failed: ${formatZodError(result.error).map(d => d.message).join(', ')}`
      )
      error.name = 'ResponseValidationError'
      reply.log.error({ err: error, statusCode: reply.statusCode }, 'Response validation error')

      // In development, throw to catch bugs early
      if (process.env.NODE_ENV !== 'production') {
        throw ApiError.internal('Error de validación de respuesta')
      }
    }
    return payload
  }
}

/**
 * Route schema definition for use with createValidatedRoute.
 */
export interface ValidatedRouteSchema extends ValidationOptions {
  response?: {
    [statusCode: number]: ZodTypeAny
  }
}

/**
 * Helper to create a validated route configuration.
 * Usage:
 *   app.post('/api/route', createValidatedRoute({
 *     schema: { body: myBodySchema, query: myQuerySchema },
 *     handler: async (req, reply) => { ... }
 *   }))
 */
export function createValidatedRoute(
  options: RouteOptions & { schema?: ValidatedRouteSchema }
): RouteOptions {
  const { schema, ...routeOptions } = options

  if (!schema) return routeOptions

  const preHandlers = routeOptions.preHandler
    ? (Array.isArray(routeOptions.preHandler) ? routeOptions.preHandler : [routeOptions.preHandler])
    : []

  if (schema.body || schema.query || schema.params) {
    preHandlers.push(createValidationHook(schema))
  }

  // Note: Response validation is added manually in handlers for now
  // to avoid complexity with Fastify's onSend hooks per status code

  return {
    ...routeOptions,
    preHandler: preHandlers,
  }
}

/**
 * Decorator for adding validated routes to Fastify instance.
 */
export function registerValidatedRoute(
  app: FastifyInstance,
  route: RouteOptions & { schema?: ValidatedRouteSchema }
) {
  const validatedRoute = createValidatedRoute(route)
  app.route(validatedRoute)
}

export { ApiError, isApiError }