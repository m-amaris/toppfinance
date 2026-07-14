/**
 * Configuration schemas and types.
 * Centralizes all environment-based configuration.
 */

import { z } from 'zod';
import { BackupFrequency, DataCollection } from './enums.js';
import { percentSchema } from './schemas.js';

/**
 * Environment configuration schema.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().default('https://toppfinance'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default('toppfinance_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(365),
  COOKIE_SECURE: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
  CORS_ORIGIN: z.string().default('http://localhost:5175'),
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_RETENTION_WEEKS: z.coerce.number().int().positive().default(30),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().default('openai/gpt-5-mini'),
  OPENROUTER_FALLBACK_MODELS: z.string().default(''),
  OPENROUTER_ZDR: z.coerce.boolean().default(true),
  // Rate limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_ALLOWLIST: z.string().optional(),
  RATE_LIMIT_BAN_DURATION_MS: z.coerce.number().int().nonnegative().default(0),
  RATE_LIMIT_CACHE_SIZE: z.coerce.number().int().positive().default(5000),
});

/**
 * Parsed configuration type.
 */
export type Config = z.infer<typeof envSchema>;

/**
 * Parses fallback models from comma-separated string.
 */
export function parseFallbackModels(value: string): string[] {
  return value
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
}

/**
 * CORS origins from comma-separated string.
 */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
}

/**
 * Shared/publishable configuration (safe for frontend).
 */
export const publicConfigSchema = z.object({
  currency: z.string().length(3).default('EUR'),
  locale: z.string().default('es-ES'),
  sessionCookieName: z.string(),
  appUrl: z.string(),
});

export type PublicConfig = z.infer<typeof publicConfigSchema>;

/**
 * Admin settings that can be stored in database.
 */
export const adminSettingsSchema = z.object({
  sharedSplit: z.object({
    miguelPercent: percentSchema,
    saraPercent: percentSchema,
  }).refine(data => Math.abs(data.miguelPercent + data.saraPercent - 100) <= 0.01, {
    message: 'El reparto global debe sumar 100%',
    path: ['saraPercent'],
  }),
  aiSettings: z.object({
    defaultModel: z.string().trim().min(1),
    fallbackModels: z.array(z.string().trim().min(1)).default([]),
    enforceZdr: z.boolean(),
    dataCollection: z.nativeEnum(DataCollection),
  }),
  backupPolicy: z.object({
    frequency: z.nativeEnum(BackupFrequency).default(BackupFrequency.WEEKLY),
    retentionWeeks: z.number().int().min(1).max(260).default(30),
    backupDir: z.string().trim().min(1).default('./backups'),
  }),
});

export type AdminSettings = z.infer<typeof adminSettingsSchema>;

/**
 * Default admin settings.
 */
export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  sharedSplit: { miguelPercent: 50, saraPercent: 50 },
  aiSettings: {
    defaultModel: 'openai/gpt-5-mini',
    fallbackModels: [],
    enforceZdr: true,
    dataCollection: DataCollection.DENY,
  },
  backupPolicy: {
    frequency: BackupFrequency.WEEKLY,
    retentionWeeks: 30,
    backupDir: './backups',
  },
};