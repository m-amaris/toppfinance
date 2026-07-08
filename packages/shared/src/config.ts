/**
 * Configuration schemas and types.
 * Centralizes all environment-based configuration.
 */

import { z } from 'zod';
import { BackupFrequency, DataCollection } from './enums.js';

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
    miguelPercent: z.number().min(0).max(100),
    saraPercent: z.number().min(0).max(100),
  }),
  aiSettings: z.object({
    defaultModel: z.string(),
    fallbackModels: z.array(z.string()),
    enforceZdr: z.boolean(),
    dataCollection: z.nativeEnum(DataCollection),
  }),
  backupPolicy: z.object({
    frequency: z.nativeEnum(BackupFrequency),
    retentionWeeks: z.number().int().min(1).max(260),
    backupDir: z.string(),
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