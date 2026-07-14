/**
 * Standardized API Error classes and utilities.
 * All API errors should use these classes for consistent error responses.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'ALREADY_EXISTS'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'INVALID_CATEGORY'
  | 'INVALID_ACCOUNT'
  | 'INVALID_BENEFICIARY'

export const API_PREFIX = '/api/v1'

export interface ApiErrorDetails {
  path: (string | number)[]
  message: string
}

export interface ApiErrorResponse {
  error: string
  code: ApiErrorCode
  details?: ApiErrorDetails[]
  timestamp: string
  path?: string
}

export class ApiError extends Error {
  public readonly statusCode: number
  public readonly code: ApiErrorCode
  public readonly details?: ApiErrorDetails[]
  public readonly timestamp: string

  constructor(message: string, statusCode: number, code: ApiErrorCode, details?: ApiErrorDetails[]) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    this.timestamp = new Date().toISOString()
  }

  toResponse(path?: string): ApiErrorResponse {
    const response: ApiErrorResponse = {
      error: this.message,
      code: this.code,
      timestamp: this.timestamp,
    }
    if (this.details?.length) response.details = this.details
    if (path) response.path = path
    return response
  }

  static validation(message: string, details?: ApiErrorDetails[]) {
    return new ApiError(message, 400, 'VALIDATION_ERROR', details)
  }

  static invalidCredentials() {
    return new ApiError('Credenciales inválidas', 401, 'INVALID_CREDENTIALS')
  }

  static unauthorized(message = 'No autenticado') {
    return new ApiError(message, 401, 'UNAUTHENTICATED')
  }

  static forbidden(message = 'Acceso denegado') {
    return new ApiError(message, 403, 'FORBIDDEN')
  }

  static notFound(resource = 'Recurso') {
    return new ApiError(`${resource} no encontrado`, 404, 'NOT_FOUND')
  }

  static conflict(message: string) {
    return new ApiError(message, 409, 'CONFLICT')
  }

  static alreadyExists(resource = 'Recurso') {
    return new ApiError(`${resource} ya existe`, 409, 'ALREADY_EXISTS')
  }

  static invalidCategory() {
    return new ApiError('Categoría inválida', 400, 'INVALID_CATEGORY')
  }

  static invalidAccount() {
    return new ApiError('Cuenta inválida o sin permisos', 400, 'INVALID_ACCOUNT')
  }

  static invalidBeneficiary() {
    return new ApiError('Beneficiario inválido', 400, 'INVALID_BENEFICIARY')
  }

  static internal(message = 'Error interno del servidor') {
    return new ApiError(message, 500, 'INTERNAL_ERROR')
  }

  static database(message = 'Error de base de datos') {
    return new ApiError(message, 500, 'DATABASE_ERROR')
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function toApiError(error: unknown, path?: string): ApiError {
  if (isApiError(error)) return error

  if (error instanceof Error) {
    // Handle known error types by message/content
    if (error.message.includes('P2002') || error.message.includes('Unique constraint')) {
      return ApiError.alreadyExists('Recurso')
    }
    if (error.message.includes('not found') || error.message.includes('no encontrado')) {
      return ApiError.notFound()
    }
    if (error.message.includes('unauthorized') || error.message.includes('no autenticado')) {
      return ApiError.unauthorized()
    }
    if (error.message.includes('forbidden') || error.message.includes('acceso denegado')) {
      return ApiError.forbidden()
    }
    return ApiError.internal(error.message)
  }

  return ApiError.internal('Error desconocido')
}