import 'dotenv/config'
import {
  envSchema,
  parseCorsOrigins,
  parseFallbackModels,
} from '@toppfinance/shared'

export const config = envSchema.parse(process.env)

export const corsOrigins = parseCorsOrigins(config.CORS_ORIGIN)

export const openRouterFallbackModels = parseFallbackModels(config.OPENROUTER_FALLBACK_MODELS)
