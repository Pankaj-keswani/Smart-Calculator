/**
 * Live Groq API Integration Test
 * Verifies live connectivity, intent parsing, and deterministic calculation using Groq API.
 */

import { AIService } from '../src/ai/AIService';
import { calculationService } from '../src/engine/CalculationService';
import { conversionService } from '../src/engine/ConversionService';
import { ConversationContext } from '../src/models/types';

describe('Live Groq API Intent Parsing', () => {
  const apiKey = process.env.EXPO_PUBLIC_AI_API_KEY || '';
  const runLive = Boolean(process.env.EXPO_PUBLIC_AI_API_KEY);

  const groqService = new AIService({
    provider: 'groq',
    apiKey,
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    timeoutMs: 15000,
  });

  const emptyContext: ConversationContext = {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };

  (runLive ? test : test.skip)(
    'Groq parses "What is 15 percent of 800?" and calculation engine computes 120',
    async () => {
      const intent = await groqService.interpretCommand(
        'What is 15 percent of 800?',
        emptyContext
      );
      expect(intent.requires_clarification).toBe(false);
      const output = calculationService.executeIntent(intent);
      expect(output.success).toBe(true);
      expect(output.resultNumber).toBe(120);
      expect(output.formattedResult).toBe('120');
    }
  );

  (runLive ? test : test.skip)(
    'Groq parses "Convert 5 kilometers to meters" and conversion engine computes 5000 meters',
    async () => {
      const intent = await groqService.interpretCommand(
        'Convert 5 kilometers to meters',
        emptyContext
      );
      expect(['conversion', 'unit_conversion']).toContain(intent.intent);
      const output = conversionService.executeIntent(intent);
      expect(output.success).toBe(true);
      expect(output.resultNumber).toBe(5000);
      expect(output.formattedResult).toBe('5000 meters');
    }
  );

  (runLive ? test : test.skip)(
    'Groq identifies ambiguity for "divide 10" and requests clarification',
    async () => {
      const intent = await groqService.interpretCommand(
        'divide 10',
        emptyContext
      );
      expect(intent.requires_clarification).toBe(true);
      expect(intent.clarification_question).toBeTruthy();
    }
  );
});
