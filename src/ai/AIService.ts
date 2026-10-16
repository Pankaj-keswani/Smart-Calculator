/**
 * Pluggable AI Interpretation Service (AIService)
 *
 * Separates natural-language intent understanding from deterministic calculation.
 * Easily switches between OpenAI, Gemini, Groq, Anthropic Claude, Custom OpenAI-compatible
 * endpoints, or the built-in Mock/Local parser (`NLFallbackParser`).
 */

import { AIConfig, getDefaultAIConfig } from '../config/env';
import {
  parseAndValidateAIResponse,
  ValidationResult,
} from '../models/schemaValidator';
import {
  ConversationContext,
  ErrorCode,
  StructuredAIIntent,
} from '../models/types';
import { nlFallbackParser } from './nlFallbackParser';
import { AI_SYSTEM_PROMPT, buildContextualUserPrompt } from './systemPrompt';

export class AIServiceError extends Error {
  public readonly code: ErrorCode;
  public readonly friendlyMessage: string;

  constructor(code: ErrorCode, friendlyMessage: string) {
    super(friendlyMessage);
    this.name = 'AIServiceError';
    this.code = code;
    this.friendlyMessage = friendlyMessage;
  }
}

export class AIService {
  private config: AIConfig;
  private fallbackToLocalWhenUnconfigured = true;
  private mockRawResponseOverride: (() => Promise<string>) | null = null;

  constructor(config?: AIConfig) {
    this.config = config || getDefaultAIConfig();
  }

  public updateConfig(partial: Partial<AIConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  public getConfig(): AIConfig {
    return { ...this.config };
  }

  public isCloudConfigured(): boolean {
    return (
      this.config.provider !== 'mock' &&
      Boolean(this.config.apiKey && this.config.apiKey.trim().length > 0)
    );
  }

  public setFallbackToLocalWhenUnconfigured(allow: boolean): void {
    this.fallbackToLocalWhenUnconfigured = allow;
  }

  /**
   * Used in tests to simulate raw LLM responses (including malformed JSON, timeouts, or rate limits).
   */
  public setMockRawResponseOverride(
    fn: (() => Promise<string>) | null
  ): void {
    this.mockRawResponseOverride = fn;
  }

  /**
   * Interprets a natural-language user command into a strictly validated StructuredAIIntent.
   */
  public async interpretCommand(
    userCommand: string,
    context: ConversationContext,
    languageCode: string = 'en-US'
  ): Promise<StructuredAIIntent> {
    // 1. Test override hook (for testing malformed AI JSON, rate limit, timeout, etc.)
    if (this.mockRawResponseOverride) {
      const rawText = await this.mockRawResponseOverride();
      const validation = parseAndValidateAIResponse(rawText);
      if (!validation.valid || !validation.data) {
        throw new AIServiceError(
          'MALFORMED_AI_RESPONSE',
          "I received an unexpected response format and couldn't process that calculation."
        );
      }
      return validation.data;
    }

    // 2. If provider is 'mock' or no API key is configured yet, use the isolated local NL parser
    if (
      this.config.provider === 'mock' ||
      (!this.isCloudConfigured() && this.fallbackToLocalWhenUnconfigured)
    ) {
      const localIntent = nlFallbackParser.parse(userCommand, context);
      const validation: ValidationResult =
        parseAndValidateAIResponse(localIntent);
      if (!validation.valid || !validation.data) {
        throw new AIServiceError(
          'MALFORMED_AI_RESPONSE',
          "I couldn't interpret that command."
        );
      }
      return validation.data;
    }

    if (!this.isCloudConfigured()) {
      throw new AIServiceError(
        'API_FAILURE',
        'AI API key is not configured. Please add your API key in Settings.'
      );
    }

    // 3. Call the configured Cloud AI Provider
    const rawJsonText = await this.callCloudProvider(
      userCommand,
      context,
      languageCode
    );
    const validation = parseAndValidateAIResponse(rawJsonText);

    if (!validation.valid || !validation.data) {
      throw new AIServiceError(
        'MALFORMED_AI_RESPONSE',
        "I received an invalid response from the AI service and couldn't safely execute the calculation."
      );
    }

    return validation.data;
  }

  private async callCloudProvider(
    userCommand: string,
    context: ConversationContext,
    languageCode: string = 'en-US'
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs || 10000
    );

    const userPrompt = buildContextualUserPrompt(
      userCommand,
      context,
      languageCode
    );

    try {
      const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
      let url = `${baseUrl}/chat/completions`;
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      };
      let body: Record<string, unknown>;

      if (this.config.provider === 'anthropic') {
        url = `${baseUrl}/messages`;
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        };
        body = {
          model: this.config.model,
          max_tokens: 1500,
          temperature: 0,
          system: AI_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        };
      } else {
        // OpenAI / Gemini OpenAI-compat / Groq / Custom OpenAI-compat
        body = {
          model: this.config.model,
          temperature: 0,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 429) {
        throw new AIServiceError(
          'RATE_LIMIT',
          'The AI service is currently rate-limited. Please wait a moment and try again.'
        );
      }

      if (!response.ok) {
        let errorDetails = '';
        try {
          const errData = await response.json();
          errorDetails = JSON.stringify(errData);
        } catch {
          errorDetails = await response.text();
        }
        throw new AIServiceError(
          'API_FAILURE',
          `The AI service returned an error (status ${response.status}): ${errorDetails}`
        );
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (this.config.provider === 'anthropic') {
        const contentArr = data.content as Array<{ text?: string }> | undefined;
        const text = contentArr?.[0]?.text;
        if (!text) {
          throw new AIServiceError(
            'MALFORMED_AI_RESPONSE',
            'Empty response from Anthropic API.'
          );
        }
        return text;
      }

      const choices = data.choices as
        | Array<{ message?: { content?: string } }>
        | undefined;
      const content = choices?.[0]?.message?.content;
      if (!content) {
        throw new AIServiceError(
          'MALFORMED_AI_RESPONSE',
          'Empty response from AI provider.'
        );
      }
      return content;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof AIServiceError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AIServiceError(
          'API_TIMEOUT',
          'The AI request timed out. Please check your connection or try again.'
        );
      }
      throw new AIServiceError(
        'NO_INTERNET',
        'Unable to reach the AI service. Please check your internet connection.'
      );
    }
  }
}

export const aiService = new AIService();
