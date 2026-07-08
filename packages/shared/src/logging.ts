/**
 * Logging types and utilities.
 * Defines log levels, categories, and structured logging interfaces.
 * Schemas live in schemas.ts, derived types in types.ts.
 */

import { LogLevel, LogCategory } from './enums.js';

/**
 * Log entry from database (response shape, not derivable from input schema).
 */
export interface AppLogEntry {
  id: string;
  householdId: string | null;
  level: LogLevel;
  category: LogCategory;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Audit log entry from database.
 */
export interface AuditLogEntry {
  id: string;
  householdId: string;
  actorUserId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Log filters for querying (not directly from schema, used in service layer).
 */
export interface LogFilters {
  level?: LogLevel;
  category?: LogCategory;
  householdId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Structured logger interface.
 * Implementations can use Pino, Winston, console, etc.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

/**
 * Creates a child logger with additional context.
 */
export function createChildLogger(
  logger: Logger,
  bindings: Record<string, unknown>
): Logger {
  return logger.child(bindings);
}

/**
 * Sanitizes metadata for logging (removes sensitive data).
 */
export function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'session', 'hash', 'apiKey', 'apikey',
  ];

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Log levels ordered by severity (for filtering).
 */
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Checks if a log level should be logged based on minimum level.
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
}