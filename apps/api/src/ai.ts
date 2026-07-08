/**
 * AI module for the API layer.
 * Re-exports from @toppfinance/shared where the core logic lives.
 * API-specific AI logic should go here (e.g. database lookups before calling AI).
 */

export {
  AiSettings,
  CallOpenRouterInput,
  OpenRouterMessage,
  OpenRouterResponse,
  defaultAiSettings,
  callOpenRouter,
  anonymizeTransactions,
  buildInsightsSystemPrompt,
  buildInsightsUserPrompt,
  aiSettingsSchema,
} from '@toppfinance/shared'