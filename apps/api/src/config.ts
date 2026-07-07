import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().default('https://toppfinance'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default('toppfinance_session'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(365),
  COOKIE_SECURE: z.coerce.boolean().default(true),
  CORS_ORIGIN: z.string().default('http://localhost:5175'),
  BACKUP_DIR: z.string().default('./backups'),
  BACKUP_RETENTION_WEEKS: z.coerce.number().int().positive().default(30),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_DEFAULT_MODEL: z.string().default('openai/gpt-5-mini'),
  OPENROUTER_FALLBACK_MODELS: z.string().default(''),
  OPENROUTER_ZDR: z.coerce.boolean().default(true),
})

export const config = envSchema.parse(process.env)

export const corsOrigins = config.CORS_ORIGIN.split(',')
  .map(origin => origin.trim())
  .filter(Boolean)

export const openRouterFallbackModels = config.OPENROUTER_FALLBACK_MODELS.split(',')
  .map(model => model.trim())
  .filter(Boolean)
