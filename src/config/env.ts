/**
 * Environment and AI API Configuration Layer
 *
 * Reads configuration from environment variables (`AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`
 * or their Expo public equivalents `EXPO_PUBLIC_*`) without ever hardcoding secrets.
 * Also supports runtime overrides configured by the user in Settings.
 */

export type AIProviderType =
  | 'openai'
  | 'gemini'
  | 'groq'
  | 'anthropic'
  | 'custom'
  | 'mock';

export interface AIConfig {
  provider: AIProviderType;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export interface CurrencyApiConfig {
  apiUrl: string;
  apiKey: string;
}

export const PROVIDER_PRESETS: Record<
  Exclude<AIProviderType, 'mock' | 'custom'>,
  { baseUrl: string; defaultModel: string; label: string }
> = {
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
  },
  groq: {
    label: 'Groq (Ultra-Fast)',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
  },
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-haiku-latest',
  },
};

function readEnvVar(primary: string, expoFallback: string, defaultValue = ''): string {
  if (typeof process !== 'undefined' && process.env) {
    const val = process.env[primary] ?? process.env[expoFallback];
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return defaultValue;
}

export function getDefaultAIConfig(): AIConfig {
  const rawProvider = readEnvVar(
    'AI_PROVIDER',
    'EXPO_PUBLIC_AI_PROVIDER',
    'openai'
  ).toLowerCase() as AIProviderType;

  const validProviders: AIProviderType[] = [
    'openai',
    'gemini',
    'groq',
    'anthropic',
    'custom',
    'mock',
  ];
  const provider: AIProviderType = validProviders.includes(rawProvider)
    ? rawProvider
    : 'openai';

  const preset =
    provider !== 'mock' && provider !== 'custom'
      ? PROVIDER_PRESETS[provider]
      : PROVIDER_PRESETS.openai;

  const apiKey = readEnvVar('AI_API_KEY', 'EXPO_PUBLIC_AI_API_KEY', '');
  const baseUrl = readEnvVar(
    'AI_BASE_URL',
    'EXPO_PUBLIC_AI_BASE_URL',
    preset.baseUrl
  );
  const model = readEnvVar(
    'AI_MODEL',
    'EXPO_PUBLIC_AI_MODEL',
    preset.defaultModel
  );
  const timeoutRaw = readEnvVar(
    'AI_TIMEOUT_MS',
    'EXPO_PUBLIC_AI_TIMEOUT_MS',
    '10000'
  );
  const timeoutMs = Number.isFinite(Number(timeoutRaw))
    ? Math.max(2000, Math.min(30000, Number(timeoutRaw)))
    : 10000;

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    timeoutMs,
  };
}

export function getDefaultCurrencyApiConfig(): CurrencyApiConfig {
  return {
    apiUrl: readEnvVar(
      'CURRENCY_API_URL',
      'EXPO_PUBLIC_CURRENCY_API_URL',
      'https://open.er-api.com/v6/latest'
    ),
    apiKey: readEnvVar('CURRENCY_API_KEY', 'EXPO_PUBLIC_CURRENCY_API_KEY', ''),
  };
}
