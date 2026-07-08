/**
 * AI types and utilities.
 * Handles OpenRouter integration, anonymization, and request/response types.
 * Schemas live in schemas.ts, derived types in types.ts.
 *
 * callOpenRouter is implemented here so both API and scripts can use it.
 * It uses fetch() (available in Node 18+).
 */

import { z } from 'zod';
import { TransactionType, DataCollection } from './enums.js';
import type { OpenRouterMessage, CallOpenRouterInput, AiSettings } from './types.js';

// Re-export types for convenience
export type { OpenRouterMessage, CallOpenRouterInput, AiSettings };

/**
 * Response from OpenRouter.
 */
export interface OpenRouterResponse {
  content: string;
  modelUsed?: string;
  promptTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

/**
 * Default AI settings.
 */
export function defaultAiSettings(config?: {
  OPENROUTER_DEFAULT_MODEL?: string;
  OPENROUTER_FALLBACK_MODELS?: string[];
  OPENROUTER_ZDR?: boolean;
}): AiSettings {
  return {
    defaultModel: config?.OPENROUTER_DEFAULT_MODEL ?? 'openai/gpt-5-mini',
    fallbackModels: config?.OPENROUTER_FALLBACK_MODELS ?? [],
    enforceZdr: config?.OPENROUTER_ZDR ?? true,
    dataCollection: DataCollection.DENY,
  };
}

/**
 * Calls OpenRouter API and returns the response.
 * Tries fallback models if the primary fails.
 */
export async function callOpenRouter(input: CallOpenRouterInput): Promise<OpenRouterResponse> {
  // Note: at call time the API key is expected in process.env.OPENROUTER_API_KEY
  const apiKey = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>).OPENROUTER_API_KEY : undefined;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY no configurada');
  }

  const messages = input.messages;
  const models = [
    input.settings?.defaultModel ?? 'openai/gpt-5-mini',
    ...(input.settings?.fallbackModels ?? []),
  ];

  let lastError: Error | undefined;

  for (const model of models) {
    try {
      const startTime = Date.now();
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...(input.settings?.enforceZdr !== false ? { 'X-Title': 'ToppFinance' } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          ...(input.responseSchema ? { response_format: { type: 'json_schema', json_schema: input.responseSchema } } : {}),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const latencyMs = Date.now() - startTime;

      return {
        content: data.choices?.[0]?.message?.content ?? '',
        modelUsed: model,
        promptTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        latencyMs,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      continue;
    }
  }

  throw lastError ?? new Error('No se pudo contactar con OpenRouter');
}

/**
 * Anonymizes transactions before sending to AI provider.
 * Removes personally identifiable information while preserving analytical value.
 */
export function anonymizeTransactions(transactions: Array<{
  id: string;
  date: Date | string;
  amount: number;
  type: TransactionType;
  description: string;
  category?: { name: string } | null;
  merchant?: { name: string } | null;
}>): Array<{
  id: string;
  month: string;
  amount: number;
  type: TransactionType;
  category: string | null;
  merchantAlias: string | null;
  descriptionHint: string;
}> {
  return transactions.map((tx, index) => {
    const dateStr = typeof tx.date === 'string' ? tx.date : tx.date.toISOString();
    const month = dateStr.slice(0, 7);

    const descriptionHint = tx.description
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
      .replace(/\b\d{4,}\b/g, '[number]')
      .slice(0, 80);

    return {
      id: `tx_${index + 1}`,
      month,
      amount: Number(tx.amount),
      type: tx.type,
      category: tx.category?.name ?? null,
      merchantAlias: tx.merchant ? `merchant_${index + 1}` : null,
      descriptionHint,
    };
  });
}

/**
 * Builds the system prompt for financial insights.
 */
export function buildInsightsSystemPrompt(): string {
  return `Eres un analista financiero prudente para una pareja. No inventes datos.
Responde en español, con acciones concretas y sin exponer datos personales.
Enfócate en: patrones de gasto, oportunidades de ahorro, alertas de presupuesto, anomalías.`;
}

/**
 * Builds the user prompt for financial insights.
 */
export function buildInsightsUserPrompt(data: {
  locale: string;
  currency: string;
  transactions: ReturnType<typeof anonymizeTransactions>;
  budgets?: Array<{ category: string; limit: number; spent: number }>;
  goals?: Array<{ name: string; target: number; current: number }>;
}): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Validates and merges AI settings with defaults.
 */
export function validateAiSettings(
  input: Partial<AiSettings>,
  defaults: AiSettings
): AiSettings {
  const { aiSettingsSchema } = require('./schemas.js');
  return aiSettingsSchema.parse({ ...defaults, ...input });
}

/**
 * Builds the models array for OpenRouter (primary + fallbacks).
 */
export function buildModelsArray(settings: AiSettings): string[] {
  return [settings.defaultModel, ...settings.fallbackModels].filter(Boolean);
}