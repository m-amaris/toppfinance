import { aiSettingsSchema } from '@toppfinance/shared'
import { config, openRouterFallbackModels } from './config.js'

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AiSettings = {
  defaultModel: string
  fallbackModels: string[]
  enforceZdr: boolean
  dataCollection: 'deny' | 'allow'
}

export function defaultAiSettings(): AiSettings {
  return {
    defaultModel: config.OPENROUTER_DEFAULT_MODEL,
    fallbackModels: openRouterFallbackModels,
    enforceZdr: config.OPENROUTER_ZDR,
    dataCollection: 'deny',
  }
}

export async function callOpenRouter(input: {
  settings?: Partial<AiSettings>
  messages: OpenRouterMessage[]
  responseSchema?: Record<string, unknown>
}) {
  if (!config.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY no esta configurada')
  }

  const settings = aiSettingsSchema.parse({
    ...defaultAiSettings(),
    ...input.settings,
  })

  const models = [settings.defaultModel, ...settings.fallbackModels].filter(Boolean)
  const started = Date.now()

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': config.APP_URL ?? 'https://toppfinance',
      'X-Title': 'ToppFinance',
    },
    body: JSON.stringify({
      model: models[0],
      models,
      messages: input.messages,
      provider: {
        data_collection: settings.dataCollection,
        ...(settings.enforceZdr ? { require_parameters: true, zdr: true } : {}),
      },
      ...(input.responseSchema
        ? {
            response_format: {
              type: 'json_schema',
              json_schema: input.responseSchema,
            },
          }
        : {}),
    }),
  })

  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: { message?: string }
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenRouter devolvio HTTP ${response.status}`)
  }

  return {
    content: payload.choices?.[0]?.message?.content ?? '',
    modelUsed: payload.model,
    promptTokens: payload.usage?.prompt_tokens,
    outputTokens: payload.usage?.completion_tokens,
    latencyMs: Date.now() - started,
  }
}

export function anonymizeTransactions(transactions: Array<{
  id: string
  date: Date
  amount: unknown
  type: string
  description: string
  category?: { name: string } | null
  merchant?: { name: string } | null
}>) {
  return transactions.map((tx, index) => ({
    id: `tx_${index + 1}`,
    month: tx.date.toISOString().slice(0, 7),
    amount: Number(tx.amount),
    type: tx.type,
    category: tx.category?.name ?? null,
    merchantAlias: tx.merchant ? `merchant_${index + 1}` : null,
    descriptionHint: tx.description
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/\b\d{4,}\b/g, '[number]')
      .slice(0, 80),
  }))
}
