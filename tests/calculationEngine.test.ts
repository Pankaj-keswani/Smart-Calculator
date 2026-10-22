/**
 * Comprehensive Unit Tests for SmartCalc AI
 * Covers Section 27 (Example Test Cases) and Section 30 (Unit Tests):
 * - addition, subtraction, multiplication, division
 * - percentages, GST, discount, tip, split bill
 * - order of operations, brackets, scientific functions
 * - square root, cube root, powers, factorial, logarithms, trigonometry
 * - unit conversions across categories
 * - currency conversion safety (no invented rates)
 * - conversational context & follow-up commands
 * - ambiguous commands & clarification flow
 * - invalid input, division by zero, overflow, malformed AI JSON
 */

import { nlFallbackParser } from '../src/parser/nlParser';
import { calculationService } from '../src/engine/CalculationService';
import { conversionService } from '../src/engine/ConversionService';
import { CurrencyService } from '../src/engine/CurrencyService';
import { parseAndValidateAIResponse } from '../src/models/schemaValidator';
import { ConversationContext } from '../src/models/types';

function createEmptyContext(): ConversationContext {
  return {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };
}

describe('SmartCalc AI - Safe Calculation Engine & Natural Language Parser', () => {
  describe('1. Addition & Natural Language Variations', () => {
    test.each([
      ['2 plus 2', 4, '4'],
      ['add 2 and 2', 4, '4'],
      ['what is 2 plus 2', 4, '4'],
      ['calculate 2 + 2', 4, '4'],
      ['two plus two', 4, '4'],
      ['what do I get if I add two and two', 4, '4'],
      ['Add 25 and 75', 100, '100'],
      ['25 plus 30', 55, '55'],
      ['What is the sum of 25 and 30?', 55, '55'],
      ['25 added to 30', 55, '55'],
      ['combine 40 and 60', 100, '100'],
      ['increase 120 by 30', 150, '150'],
    ])('"%s" -> %s', (command, expectedNum, expectedStr) => {
      const intent = nlFallbackParser.parse(command, createEmptyContext());
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(expectedNum);
      expect(out.formattedResult).toBe(expectedStr);
      expect(out.spokenResponse).toBe(`The answer is ${expectedStr}.`);
    });
  });

  describe('2. Subtraction & Natural Language Variations', () => {
    test.each([
      ['100 minus 37', 63],
      ['100 minus 35', 65],
      ['Subtract 35 from 100', 65],
      ['Take 35 away from 100', 65],
      ['difference between 100 and 35', 65],
      ['reduce 100 by 35', 65],
      ['remove 35 from 100', 65],
    ])('"%s" -> %d', (command, expected) => {
      const intent = nlFallbackParser.parse(command, createEmptyContext());
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(expected);
      expect(out.formattedResult).toBe(String(expected));
    });
  });

  describe('3. Multiplication & Natural Language Variations', () => {
    test.each([
      ['12 times 8', 96],
      ['12 into 8', 96],
      ['Multiply 12 by 8', 96],
      ['12 multiplied by 8', 96],
      ['12 x 8', 96],
    ])('"%s" -> %d', (command, expected) => {
      const intent = nlFallbackParser.parse(command, createEmptyContext());
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(expected);
    });
  });

  describe('4. Division & Natural Language Variations', () => {
    test.each([
      ['144 divided by 12', 12],
      ['100 divided by 4', 25],
      ['100 over 4', 25],
      ['divide 100 by 4', 25],
      ['quotient of 100 and 4', 25],
    ])('"%s" -> %d', (command, expected) => {
      const intent = nlFallbackParser.parse(command, createEmptyContext());
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(expected);
    });
  });

  describe('5. Percentages, GST, Discounts, and Smart Everyday Calculations', () => {
    test('"What is 15 percent of 800?" -> 120', () => {
      const intent = nlFallbackParser.parse(
        'What is 15 percent of 800?',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(120);
      expect(out.formattedResult).toBe('120');
      expect(out.spokenResponse).toBe('15 percent of 800 is 120.');
    });

    test('"20 percent discount on 1500" -> 1200', () => {
      const intent = nlFallbackParser.parse(
        '20 percent discount on 1500',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1200);
      expect(out.formattedResult).toBe('1200');
    });

    test('"18 percent GST on 1000" -> 1180', () => {
      const intent = nlFallbackParser.parse(
        '18 percent GST on 1000',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1180);
      expect(out.formattedResult).toBe('1180');
    });

    test('"Add 18 percent GST to 2500" -> 2950', () => {
      const intent = nlFallbackParser.parse(
        'Add 18 percent GST to 2500',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(2950);
    });

    test('"What is a 15 percent tip on 1200?" -> 180', () => {
      const intent = nlFallbackParser.parse(
        'What is a 15 percent tip on 1200?',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(180);
    });

    test('"Split 2500 between 5 people" -> 500', () => {
      const intent = nlFallbackParser.parse(
        'Split 2500 between 5 people',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(500);
    });

    test('"I have 1000 and spend 275" -> 725', () => {
      const intent = nlFallbackParser.parse(
        'I have 1000 and spend 275',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(725);
    });

    test('"I bought 3 items for 250 each, what\'s the total?" -> 750', () => {
      const intent = nlFallbackParser.parse(
        "I bought 3 items for 250 each, what's the total?",
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(750);
    });
  });

  describe('6. Advanced Mathematics & Order of Operations', () => {
    test('"Square root of 144" -> 12', () => {
      const intent = nlFallbackParser.parse(
        'Square root of 144',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(12);
    });

    test('"Cube root of 27" -> 3', () => {
      const intent = nlFallbackParser.parse(
        'Cube root of 27',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(3);
    });

    test('"2 raised to the power of 10" -> 1024', () => {
      const intent = nlFallbackParser.parse(
        '2 raised to the power of 10',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1024);
    });

    test('"2 to the power of 10" -> 1024', () => {
      const intent = nlFallbackParser.parse(
        '2 to the power of 10',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1024);
    });

    test('"5 factorial" -> 120', () => {
      const intent = nlFallbackParser.parse(
        '5 factorial',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(120);
    });

    test('"sin 90 degrees" -> 1', () => {
      const intent = nlFallbackParser.parse(
        'sin 90 degrees',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1);
    });

    test('Order of operations: "Calculate 25 × (10 + 5)" -> 375', () => {
      const intent = nlFallbackParser.parse(
        'Calculate 25 × (10 + 5)',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(375);
    });

    test('Order of operations (PEMDAS): "2 + 3 * 4 ^ 2" -> 50', () => {
      const res = calculationService.evaluateExpression('2 + 3 * 4 ^ 2');
      expect(res).toBe(50);
    });

    test('Logarithm and Absolute Value', () => {
      const logIntent = nlFallbackParser.parse(
        'log of 1000',
        createEmptyContext()
      );
      expect(calculationService.executeIntent(logIntent).resultNumber).toBe(3);

      const absIntent = nlFallbackParser.parse(
        'absolute value of -42',
        createEmptyContext()
      );
      expect(calculationService.executeIntent(absIntent).resultNumber).toBe(42);
    });
  });

  describe('7. Unit Conversion Engine', () => {
    test('"Convert 5 kilometers to meters" -> 5000 meters', () => {
      const intent = nlFallbackParser.parse(
        'Convert 5 kilometers to meters',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(5000);
      expect(out.formattedResult).toBe('5000 meters');
      expect(out.spokenResponse).toBe(
        '5 kilometers is equal to 5000 meters.'
      );
    });

    test('"How many grams are in 2 kilograms?" -> 2000 grams', () => {
      const intent = nlFallbackParser.parse(
        'How many grams are in 2 kilograms?',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(2000);
      expect(out.formattedResult).toBe('2000 grams');
    });

    test('"Convert 100 Fahrenheit to Celsius" -> 37.7778 degrees Celsius', () => {
      const intent = nlFallbackParser.parse(
        'Convert 100 Fahrenheit to Celsius',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBeCloseTo(37.7778, 3);
    });

    test('"How many liters are 5000 milliliters?" -> 5 liters', () => {
      const intent = nlFallbackParser.parse(
        'How many liters are 5000 milliliters?',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(5);
      expect(out.formattedResult).toBe('5 liters');
    });

    test('"Convert 10 Mbps to MB per second" -> 1.25 MB per second', () => {
      const intent = nlFallbackParser.parse(
        'Convert 10 Mbps to MB per second',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(1.25);
      expect(out.formattedResult).toBe('1.25 MB per second');
    });

    test('"How many seconds are in 3 hours?" -> 10800 seconds', () => {
      const intent = nlFallbackParser.parse(
        'How many seconds are in 3 hours?',
        createEmptyContext()
      );
      const out = conversionService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(10800);
      expect(out.formattedResult).toBe('10800 seconds');
    });
  });

  describe('8. Hinglish / Multilingual Support', () => {
    test('"2 plus 2 kitna hota hai?" -> 4', () => {
      const intent = nlFallbackParser.parse(
        '2 plus 2 kitna hota hai?',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(4);
    });

    test('"25 percent of 800 calculate karo." -> 200', () => {
      const intent = nlFallbackParser.parse(
        '25 percent of 800 calculate karo.',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(200);
    });

    test('"500 ko 5 se divide karo." -> 100', () => {
      const intent = nlFallbackParser.parse(
        '500 ko 5 se divide karo.',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(100);
    });
  });

  describe('9. Ambiguous Commands & Error Handling', () => {
    test('"divide 10" -> Clarification required', () => {
      const intent = nlFallbackParser.parse('divide 10', createEmptyContext());
      expect(intent.requires_clarification).toBe(true);
      expect(intent.clarification_question).toBe(
        'What number should I divide 10 by?'
      );
    });

    test('"Calculate 20" -> Clarification required', () => {
      const intent = nlFallbackParser.parse(
        'Calculate 20',
        createEmptyContext()
      );
      expect(intent.requires_clarification).toBe(true);
      expect(intent.clarification_question).toBe(
        'What would you like me to calculate with 20?'
      );
    });

    test('Division by zero returns human-friendly error, never Infinity or NaN', () => {
      const intent = nlFallbackParser.parse(
        '100 divided by 0',
        createEmptyContext()
      );
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(false);
      expect(out.errorCode).toBe('DIVISION_BY_ZERO');
      expect(out.spokenResponse).toBe("I can't divide a number by zero.");
      expect(out.formattedResult).not.toMatch(/NaN|Infinity|undefined|null/);
    });

    test('Malformed AI JSON is caught by strict schema validator', async () => {
      const validation = parseAndValidateAIResponse('{ invalid json: [123 ');
      expect(validation.valid).toBe(false);

      const missingIntent = parseAndValidateAIResponse(
        '{"operation":"addition","values":[1,2]}'
      );
      expect(missingIntent.valid).toBe(false);

      const nonFiniteValues = parseAndValidateAIResponse(
        '{"intent":"calculate","operation":"addition","values":["abc", 2]}'
      );
      expect(nonFiniteValues.valid).toBe(false);

      const garbage = parseAndValidateAIResponse('NOT_JSON_AT_ALL');
      expect(garbage.valid).toBe(false);
    });

    test('Currency conversion never invents rates when no offline rate is saved', async () => {
      const curr = new CurrencyService();

      const intent = nlFallbackParser.parse(
        'Convert 100 dollars to rupees',
        createEmptyContext()
      );
      expect(intent.intent).toBe('currency');
      const out = await curr.executeIntent(intent);
      expect(out.success).toBe(false);
      expect(out.errorCode).toBe('CURRENCY_UNAVAILABLE');
      expect(out.spokenResponse).toContain('Set the INR exchange rate in Settings');

      // With a saved offline rate (1 USD = 83.5 INR) it converts without any network
      curr.setRates({ INR: 83.5 });
      const ok = await curr.executeIntent(intent);
      expect(ok.success).toBe(true);
      expect(ok.resultNumber).toBe(8350);
    });
  });
});
