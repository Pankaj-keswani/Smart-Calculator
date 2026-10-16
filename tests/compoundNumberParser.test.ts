import {
  getTrailingZeros,
  canMergeCompoundNumbers,
  mergeCompoundSpokenNumbers,
} from '../src/utils/compoundNumberParser';
import { replaceSpokenNumbers, nlFallbackParser } from '../src/ai/nlFallbackParser';
import { calculationService } from '../src/engine/CalculationService';
import { ConversationContext } from '../src/models/types';

function createMockContext(): ConversationContext {
  return {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };
}

describe('compoundNumberParser - Positional Compound Spoken Number Handling', () => {
  describe('getTrailingZeros', () => {
    test('Calculates trailing zeros correctly', () => {
      expect(getTrailingZeros(300)).toBe(2);
      expect(getTrailingZeros(2000)).toBe(3);
      expect(getTrailingZeros(20)).toBe(1);
      expect(getTrailingZeros(100000)).toBe(5);
      expect(getTrailingZeros(345)).toBe(0);
      expect(getTrailingZeros(0)).toBe(0);
      expect(getTrailingZeros(-100)).toBe(0);
    });
  });

  describe('canMergeCompoundNumbers', () => {
    test('Valid compound numbers merge', () => {
      // Hundreds + tens/units
      expect(canMergeCompoundNumbers(300, 10)).toBe(true);
      expect(canMergeCompoundNumbers(300, 1)).toBe(true);
      expect(canMergeCompoundNumbers(300, 99)).toBe(true);
      expect(canMergeCompoundNumbers(500, 20)).toBe(true);
      expect(canMergeCompoundNumbers(1200, 50)).toBe(true);

      // Thousands + hundreds/tens/units
      expect(canMergeCompoundNumbers(2000, 500)).toBe(true);
      expect(canMergeCompoundNumbers(2000, 50)).toBe(true);
      expect(canMergeCompoundNumbers(2000, 5)).toBe(true);
      expect(canMergeCompoundNumbers(1000, 50)).toBe(true);

      // Tens + units (20..90 + 1..9)
      expect(canMergeCompoundNumbers(20, 5)).toBe(true);
      expect(canMergeCompoundNumbers(30, 7)).toBe(true);
      expect(canMergeCompoundNumbers(40, 8)).toBe(true);
      expect(canMergeCompoundNumbers(90, 9)).toBe(true);
    });

    test('Invalid combinations do NOT merge', () => {
      // Over capacity
      expect(canMergeCompoundNumbers(300, 100)).toBe(false);
      expect(canMergeCompoundNumbers(300, 200)).toBe(false);
      expect(canMergeCompoundNumbers(20, 30)).toBe(false);
      expect(canMergeCompoundNumbers(50, 50)).toBe(false);

      // Units + tens or numbers without zeros
      expect(canMergeCompoundNumbers(5, 10)).toBe(false);
      expect(canMergeCompoundNumbers(25, 5)).toBe(false);

      // Ten + unit (not a compound word in English/Hindi: "ten one" vs "eleven")
      expect(canMergeCompoundNumbers(10, 5)).toBe(false);
      expect(canMergeCompoundNumbers(10, 20)).toBe(false);
    });
  });

  describe('mergeCompoundSpokenNumbers', () => {
    test('Merges "300 10 + 310" to "310 + 310"', () => {
      expect(mergeCompoundSpokenNumbers('300 10 + 310')).toBe('310 + 310');
    });

    test('Merges multi-segment compound "3000 400 50 6" to "3456"', () => {
      expect(mergeCompoundSpokenNumbers('3000 400 50 6')).toBe('3456');
    });

    test('Merges "2000 500 / 5" to "2500 / 5"', () => {
      expect(mergeCompoundSpokenNumbers('2000 500 / 5')).toBe('2500 / 5');
    });

    test('Merges "500 20 - 100" to "520 - 100"', () => {
      expect(mergeCompoundSpokenNumbers('500 20 - 100')).toBe('520 - 100');
    });

    test('Does not alter already-delimited operators', () => {
      expect(mergeCompoundSpokenNumbers('300 + 10')).toBe('300 + 10');
      expect(mergeCompoundSpokenNumbers('300 - 10')).toBe('300 - 10');
      expect(mergeCompoundSpokenNumbers('300 * 10')).toBe('300 * 10');
      expect(mergeCompoundSpokenNumbers('300 / 10')).toBe('300 / 10');
    });
  });

  describe('replaceSpokenNumbers with mixed words and digits', () => {
    test('User test case: "three hundred 10 plus three hundred ten" -> "310 plus 310"', () => {
      expect(replaceSpokenNumbers('three hundred 10 plus three hundred ten')).toBe(
        '310 plus 310'
      );
    });

    test('Compounds with "and": "three hundred and 10 plus three hundred and ten"', () => {
      expect(
        replaceSpokenNumbers('three hundred and 10 plus three hundred and ten')
      ).toBe('310 plus 310');
    });

    test('Thousands compound: "two thousand 500 divided by 5" -> "2500 divided by 5"', () => {
      expect(replaceSpokenNumbers('two thousand 500 divided by 5')).toBe(
        '2500 divided by 5'
      );
    });

    test('Preserves conjunction "and" between distinct numbers: "add two and two"', () => {
      expect(replaceSpokenNumbers('what do I get if I add two and two')).toBe(
        'what do I get if I add 2 and 2'
      );
    });
  });

  describe('End-to-End Voice & Math Pipeline Verification', () => {
    test('User case: "three hundred 10 plus three hundred ten" evaluates to 620', () => {
      const intent = nlFallbackParser.parse(
        'three hundred 10 plus three hundred ten',
        createMockContext()
      );
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(620);
      expect(out.formattedResult).toBe('620');
      expect(out.displayExpression).toBe('310 + 310');
    });

    test('Raw digits STT case: "300 10 + 310" evaluates to 620', () => {
      const intent = nlFallbackParser.parse('300 10 + 310', createMockContext());
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(620);
      expect(out.formattedResult).toBe('620');
      expect(out.displayExpression).toBe('310 + 310');
    });

    test('"five hundred 20 minus 100" evaluates to 420', () => {
      const intent = nlFallbackParser.parse(
        'five hundred 20 minus 100',
        createMockContext()
      );
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(420);
      expect(out.formattedResult).toBe('420');
      expect(out.displayExpression).toBe('520 - 100');
    });

    test('"two thousand 500 divided by 5" evaluates to 500', () => {
      const intent = nlFallbackParser.parse(
        'two thousand 500 divided by 5',
        createMockContext()
      );
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(500);
      expect(out.formattedResult).toBe('500');
      expect(out.displayExpression).toBe('2500 ÷ 5');
    });

    test('"forty 8 times two" evaluates to 96', () => {
      const intent = nlFallbackParser.parse(
        'forty 8 times two',
        createMockContext()
      );
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(96);
      expect(out.formattedResult).toBe('96');
      expect(out.displayExpression).toBe('48 × 2');
    });

    test('Multi-segment compound: "3000 400 50 6 + 10" evaluates to 3466', () => {
      const intent = nlFallbackParser.parse(
        '3000 400 50 6 + 10',
        createMockContext()
      );
      expect(intent.intent).toBe('calculate');
      const out = calculationService.executeIntent(intent);
      expect(out.success).toBe(true);
      expect(out.resultNumber).toBe(3466);
      expect(out.formattedResult).toBe('3466');
      expect(out.displayExpression).toBe('3456 + 10');
    });
  });
});
