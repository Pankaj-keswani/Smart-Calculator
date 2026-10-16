/**
 * JEV Deterministic Calculation Engine Test Suite
 * Verifies all requirements from Sections 1–18:
 * - Section 1: JevCalculationEngine abstraction & dedicated methods
 * - Section 2 & 3: AI only parses intent; AI-supplied answers are stripped/ignored
 * - Section 4: Safe expression pipeline (no eval/Function, strict operator/function whitelist)
 * - Section 5: Decimal-safe scaled integer precision (0.1 + 0.2 = 0.3)
 * - Section 6: Explicit percentage normalization (percentage of, discount, GST/tax)
 * - Section 7: Multi-step local state context resolution
 * - Section 8: Scientific calculations (sqrt, cbrt, power, sin, cos, tan, log, ln, abs, exp, factorial)
 * - Section 9: Double validation (JEV RPN vs Independent Recursive-Descent AST validator)
 * - Section 10: Ambiguous input clarification
 * - Section 11 & 12: Voice & Hinglish calculation examples
 * - Section 13 & 14: Separate UnitConversionEngine and CurrencyService
 * - Section 15 & 17: Edge cases & safe error messages (never NaN/Infinity/undefined/null)
 * - Section 16 & 18: Developer Debug Mode trace & API key redaction
 */

import { nlFallbackParser } from '../src/ai/nlFallbackParser';
import { CurrencyService } from '../src/engine/CurrencyService';
import {
  JevCalculationEngine,
  jevCalculationEngine,
} from '../src/engine/JevCalculationEngine';
import { unitConversionEngine } from '../src/engine/UnitConversionEngine';
import { parseAndValidateAIResponse } from '../src/models/schemaValidator';
import { ConversationContext } from '../src/models/types';
import { debugLogger } from '../src/services/DebugLogger';

function createContext(lastResult: number | null = null): ConversationContext {
  return {
    lastResult,
    lastFormattedResult: lastResult !== null ? String(lastResult) : null,
    lastExpression: lastResult !== null ? String(lastResult) : null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };
}

describe('JEV Deterministic Calculation Architecture (Sections 1–18)', () => {
  describe('Section 1: JevCalculationEngine Dedicated Methods', () => {
    test('evaluateExpression() evaluates arithmetic & PEMDAS deterministically', () => {
      expect(jevCalculationEngine.evaluateExpression('2 + 2')).toBe(4);
      expect(jevCalculationEngine.evaluateExpression('25 + 75')).toBe(100);
      expect(jevCalculationEngine.evaluateExpression('100 - 37')).toBe(63);
      expect(jevCalculationEngine.evaluateExpression('12 * 8')).toBe(96);
      expect(jevCalculationEngine.evaluateExpression('100 / 4')).toBe(25);
    });

    test('calculatePercentage() handles percentage_of, discount, and tax_addition', () => {
      const pctOf = jevCalculationEngine.calculatePercentage(15, 800, 'of');
      expect(pctOf.normalizedExpression).toBe('15 / 100 * 800');
      expect(pctOf.result).toBe(120);

      const discount = jevCalculationEngine.calculatePercentage(
        20,
        1500,
        'discount'
      );
      expect(discount.normalizedExpression).toBe('1500 - (20 / 100 * 1500)');
      expect(discount.result).toBe(1200);

      const gst = jevCalculationEngine.calculatePercentage(18, 1000, 'gst');
      expect(gst.normalizedExpression).toBe('1000 + (18 / 100 * 1000)');
      expect(gst.result).toBe(1180);
    });

    test('calculatePower() and calculateRoot()', () => {
      expect(jevCalculationEngine.calculatePower(2, 10)).toBe(1024);
      expect(jevCalculationEngine.calculateRoot(144, 2)).toBe(12);
      expect(jevCalculationEngine.calculateRoot(27, 3)).toBe(3);
    });

    test('calculateScientificFunction() supports all whitelisted scientific functions', () => {
      expect(jevCalculationEngine.calculateScientificFunction('sqrt', 144)).toBe(
        12
      );
      expect(jevCalculationEngine.calculateScientificFunction('cbrt', 27)).toBe(
        3
      );
      expect(jevCalculationEngine.calculateScientificFunction('sin', 90)).toBe(
        1
      );
      expect(jevCalculationEngine.calculateScientificFunction('cos', 0)).toBe(
        1
      );
      expect(jevCalculationEngine.calculateScientificFunction('tan', 45)).toBe(
        1
      );
      expect(
        jevCalculationEngine.calculateScientificFunction('log', 1000)
      ).toBe(3);
      expect(
        jevCalculationEngine.calculateScientificFunction('ln', Math.E)
      ).toBeCloseTo(1, 10);
      expect(jevCalculationEngine.calculateScientificFunction('abs', -42)).toBe(
        42
      );
      expect(jevCalculationEngine.calculateScientificFunction('exp', 0)).toBe(
        1
      );
      expect(
        jevCalculationEngine.calculateScientificFunction('factorial', 5)
      ).toBe(120);
    });

    test('formatResult() formats integers, decimals, and scientific notation cleanly', () => {
      expect(jevCalculationEngine.formatResult(4)).toBe('4');
      expect(jevCalculationEngine.formatResult(2.5)).toBe('2.5');
      expect(jevCalculationEngine.formatResult(0.3)).toBe('0.3');
      expect(jevCalculationEngine.formatResult(-0)).toBe('0');
    });
  });

  describe('Section 2 & 3: Never Trust AI Answers', () => {
    test('Schema validator strips AI-generated answer/result/final_answer/response_text fields on calculation intents', () => {
      const maliciousOrHallucinatedAIJson = JSON.stringify({
        intent: 'calculate',
        operation: 'addition',
        operands: [2, 2],
        expression: '2 + 2',
        answer: 5,
        result: 999,
        final_answer: 42,
        calculated_value: 100,
        solution: '2 + 2 = 5',
        response_text: 'The answer is 5.',
        requires_clarification: false,
      });

      const validated = parseAndValidateAIResponse(
        maliciousOrHallucinatedAIJson
      );
      expect(validated.valid).toBe(true);
      expect(validated.data).toBeDefined();

      // Ensure hallucinated answer fields are stripped and response_text is null
      const dataRecord = validated.data as unknown as Record<string, unknown>;
      expect(dataRecord.answer).toBeUndefined();
      expect(dataRecord.result).toBeUndefined();
      expect(dataRecord.final_answer).toBeUndefined();
      expect(dataRecord.calculated_value).toBeUndefined();
      expect(dataRecord.solution).toBeUndefined();
      expect(validated.data?.response_text).toBeNull();

      // Execute through JEV local engine -> must deterministically equal 4
      const output = jevCalculationEngine.executeIntent(
        validated.data!,
        '2 plus 2'
      );
      expect(output.success).toBe(true);
      expect(output.resultNumber).toBe(4);
      expect(output.formattedResult).toBe('4');
      expect(output.spokenResponse).toBe('The answer is 4.');
    });
  });

  describe('Section 4: Safe Expression Pipeline & Whitelist Enforcement', () => {
    test('Rejects code injection and non-whitelisted tokens', () => {
      expect(() =>
        jevCalculationEngine.evaluateExpression('eval("2+2")')
      ).toThrow();
      expect(() =>
        jevCalculationEngine.evaluateExpression('Function("return 4")()')
      ).toThrow();
      expect(() =>
        jevCalculationEngine.evaluateExpression('process.exit(1)')
      ).toThrow();
      expect(() =>
        jevCalculationEngine.evaluateExpression('unknownFunc(10)')
      ).toThrow();
    });
  });

  describe('Section 5: Decimal and Floating-Point Precision', () => {
    test('0.1 + 0.2 equals 0.3 exactly (never 0.30000000000000004)', () => {
      const res = jevCalculationEngine.evaluateExpression('0.1 + 0.2');
      expect(res).toBe(0.3);
      expect(jevCalculationEngine.formatResult(res)).toBe('0.3');
    });

    test('0.3 - 0.1 equals 0.2 and 0.1 * 0.2 equals 0.02', () => {
      expect(jevCalculationEngine.evaluateExpression('0.3 - 0.1')).toBe(0.2);
      expect(jevCalculationEngine.evaluateExpression('0.1 * 0.2')).toBe(0.02);
    });

    test('Does not blindly round all results to 2 decimal places', () => {
      const res = jevCalculationEngine.evaluateExpression('1 / 8');
      expect(res).toBe(0.125);
      expect(jevCalculationEngine.formatResult(res)).toBe('0.125');
    });
  });

  describe('Section 6: Explicit Percentage Normalization', () => {
    test('"15 percent of 800" normalizes to "15 / 100 * 800" -> 120', () => {
      const intent = nlFallbackParser.parse(
        '15 percent of 800',
        createContext()
      );
      expect(intent.expression).toBe('15 / 100 * 800');
      const out = jevCalculationEngine.executeIntent(
        intent,
        '15 percent of 800'
      );
      expect(out.resultNumber).toBe(120);
      expect(out.formattedResult).toBe('120');
    });

    test('"20 percent discount on 1500" normalizes to "1500 - (20 / 100 * 1500)" -> 1200', () => {
      const intent = nlFallbackParser.parse(
        '20 percent discount on 1500',
        createContext()
      );
      expect(intent.expression).toBe('1500 - (20 / 100 * 1500)');
      const out = jevCalculationEngine.executeIntent(
        intent,
        '20 percent discount on 1500'
      );
      expect(out.resultNumber).toBe(1200);
      expect(out.formattedResult).toBe('1200');
    });

    test('"18 percent GST on 1000" normalizes to "1000 + (18 / 100 * 1000)" -> 1180', () => {
      const intent = nlFallbackParser.parse(
        '18 percent GST on 1000',
        createContext()
      );
      expect(intent.expression).toBe('1000 + (18 / 100 * 1000)');
      const out = jevCalculationEngine.executeIntent(
        intent,
        '18 percent GST on 1000'
      );
      expect(out.resultNumber).toBe(1180);
      expect(out.formattedResult).toBe('1180');
    });
  });

  describe('Section 7: Multi-Step Calculation Context', () => {
    test('Command 1: "500 divided by 5" -> 100, Command 2: "multiply that by 3" -> 300', () => {
      const ctx1 = createContext(null);
      const intent1 = nlFallbackParser.parse('500 divided by 5', ctx1);
      const out1 = jevCalculationEngine.executeIntent(
        intent1,
        '500 divided by 5'
      );
      expect(out1.resultNumber).toBe(100);

      const ctx2 = createContext(out1.resultNumber!);
      const intent2 = nlFallbackParser.parse('multiply that by 3', ctx2);
      expect(intent2.uses_previous_result).toBe(true);
      const out2 = jevCalculationEngine.executeIntent(
        intent2,
        'multiply that by 3'
      );
      expect(out2.resultNumber).toBe(300);
      expect(out2.formattedResult).toBe('300');
    });
  });

  describe('Section 9: Double Validation (Independent AST vs JEV RPN)', () => {
    test('Independent Recursive-Descent AST validator agrees with JEV on complex expressions', () => {
      const expr = '1500 - (20 / 100 * 1500) + sqrt(144) * 2 ^ 3';
      const primary = jevCalculationEngine.evaluateExpression(expr);
      const check = jevCalculationEngine.validateResult(expr, primary);
      expect(check.valid).toBe(true);
      expect(check.independentResult).toBe(primary);
    });

    test('Returns safe error message and logs discrepancy if independent validation disagrees', () => {
      const customEngine = new JevCalculationEngine();
      // Inject a simulated faulty independent validator returning a mismatched number
      customEngine.setCustomIndependentValidator(() => 999999);

      const intent = nlFallbackParser.parse('2 plus 2', createContext());
      const out = customEngine.executeIntent(intent, '2 plus 2');

      expect(out.success).toBe(false);
      expect(out.errorCode).toBe('VALIDATION_MISMATCH');
      expect(out.spokenResponse).toBe(
        'Something went wrong while calculating that. Please try again.'
      );
      expect(out.debugTrace?.validationStatus).toBe('FAIL');

      const discrepancies = debugLogger.getDiscrepancies();
      expect(discrepancies.length).toBeGreaterThan(0);
    });
  });

  describe('Section 10: Ambiguous Input Handling', () => {
    test.each([
      ['divide 10'],
      ['calculate 20'],
      ['percent of 500'],
      ['multiply by 3'],
    ])('"%s" triggers clarification instead of guessing', (input) => {
      const intent = nlFallbackParser.parse(input, createContext(null));
      expect(intent.requires_clarification).toBe(true);
      expect(intent.clarification_question).toBeTruthy();
    });
  });

  describe('Section 11 & 12: Voice & Hinglish Calculation Examples', () => {
    test.each([
      ['2 plus 2', 4],
      ['what is 2 plus 2', 4],
      ['add 25 and 75', 100],
      ['subtract 35 from 100', 65],
      ['multiply 12 by 8', 96],
      ['divide 144 by 12', 12],
      ['what is 15 percent of 800', 120],
      ['20 percent discount on 1500', 1200],
      ['add 18 percent GST to 1000', 1180],
      ['square root of 144', 12],
      ['2 raised to the power of 10', 1024],
      ['2 plus 2 kitna hai?', 4],
      ['500 ko 5 se divide karo', 100],
      ['800 ka 15 percent kitna hai?', 120],
      ['1500 pe 20 percent discount lagao', 1200],
      ['1000 mein 18 percent GST add karo', 1180],
    ])('Voice/Hinglish: "%s" -> %d', (utterance, expected) => {
      const intent = nlFallbackParser.parse(utterance, createContext(null));
      const out = jevCalculationEngine.executeIntent(intent, utterance);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(expected);
    });

    test('Hinglish multi-step: "jo answer aya usme 50 add karo" with previous 100 -> 150', () => {
      const ctx = createContext(100);
      const intent = nlFallbackParser.parse(
        'jo answer aya usme 50 add karo',
        ctx
      );
      expect(intent.uses_previous_result).toBe(true);
      const out = jevCalculationEngine.executeIntent(
        intent,
        'jo answer aya usme 50 add karo'
      );
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(150);
    });
  });

  describe('Section 13 & 14: UnitConversionEngine and CurrencyService', () => {
    test('UnitConversionEngine converts units deterministically', () => {
      const res = unitConversionEngine.convert(5, 'km', 'm');
      expect(res.convertedValue).toBe(5000);
      expect(res.formattedResult).toBe('5000 meters');
    });

    test('CurrencyService never invents exchange rates when offline', async () => {
      const service = new CurrencyService();
      service.setAllowLiveNetworkFetch(false);
      const intent = nlFallbackParser.parse(
        'Convert 50 USD to INR',
        createContext()
      );
      const out = await service.executeIntent(intent);
      expect(out.success).toBe(false);
      expect(out.spokenResponse).toBe(
        "Current exchange-rate data isn't available."
      );
    });
  });

  describe('Section 15 & 17: Edge Cases (0, negatives, large/small numbers, nested parens, long expressions)', () => {
    test('Zero and negative numbers', () => {
      expect(jevCalculationEngine.evaluateExpression('0 + 0')).toBe(0);
      expect(jevCalculationEngine.evaluateExpression('-15 + 5')).toBe(-10);
      expect(jevCalculationEngine.evaluateExpression('-8 * -4')).toBe(32);
    });

    test('Nested parentheses and long expressions', () => {
      expect(
        jevCalculationEngine.evaluateExpression(
          '((10 + 5) * (20 - 16)) / (2 + 4)'
        )
      ).toBe(10);
      expect(
        jevCalculationEngine.evaluateExpression(
          '1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10'
        )
      ).toBe(55);
    });

    test('Very large and very small numbers', () => {
      expect(jevCalculationEngine.evaluateExpression('1000000 * 1000000')).toBe(
        1e12
      );
      expect(jevCalculationEngine.evaluateExpression('0.0001 * 0.001')).toBe(
        0.0000001
      );
    });

    test('Division by zero returns safe error message and never NaN/Infinity', () => {
      const intent = nlFallbackParser.parse(
        '50 divided by 0',
        createContext()
      );
      const out = jevCalculationEngine.executeIntent(intent, '50 divided by 0');
      expect(out.success).toBe(false);
      expect(out.errorCode).toBe('DIVISION_BY_ZERO');
      expect(out.spokenResponse).toBe("I can't divide a number by zero.");
      expect(out.formattedResult).not.toMatch(/NaN|Infinity|undefined|null/);
    });
  });

  describe('Section 16 & 18: Developer Debug Mode & API Key Redaction', () => {
    test('Produces exact Section 16 structured debug trace on calculation output', () => {
      const intent = nlFallbackParser.parse(
        '15 percent of 800',
        createContext()
      );
      const out = jevCalculationEngine.executeIntent(
        intent,
        '15 percent of 800'
      );
      expect(out.debugTrace).toBeDefined();
      expect(out.debugTrace?.formattedLog).toContain(
        'Voice input:\n"15 percent of 800"'
      );
      expect(out.debugTrace?.formattedLog).toContain(
        'Normalized expression:\n15 / 100 * 800'
      );
      expect(out.debugTrace?.formattedLog).toContain('JEV result:\n120');
      expect(out.debugTrace?.formattedLog).toContain('Validation:\nPASS');
      expect(out.debugTrace?.formattedLog).toContain('Final result:\n120');
    });

    test('Redacts API keys and bearer tokens from debug logs', () => {
      const raw =
        'Header Authorization: Bearer sk-1234567890abcdefghijklmnop and gsk_9876543210abcdefghijklmnop';
      const redacted = debugLogger.redactSecrets(raw);
      expect(redacted).not.toContain('sk-1234567890abcdefghijklmnop');
      expect(redacted).not.toContain('gsk_9876543210abcdefghijklmnop');
      expect(redacted).toContain('[REDACTED]');
    });
  });
});
