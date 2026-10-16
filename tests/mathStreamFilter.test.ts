import { mathStreamFilter } from '../src/ai/MathStreamFilter';
import { ConversationContext } from '../src/models/types';

function createMockContext(lastResult: number | null = null): ConversationContext {
  return {
    lastResult,
    lastFormattedResult: lastResult !== null ? String(lastResult) : null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };
}

describe('MathStreamFilter - Pure Numerical & Operation Extractor', () => {
  test('Pure conversational noise is flagged with isPureNoise=true', () => {
    const res1 = mathStreamFilter.filter('hello', createMockContext());
    expect(res1.isPureNoise).toBe(true);
    expect(res1.cleanMathText).toBeNull();

    const res2 = mathStreamFilter.filter('hey bro how are you doing', createMockContext());
    expect(res2.isPureNoise).toBe(true);

    const res3 = mathStreamFilter.filter('arre suno kya haal hai', createMockContext());
    expect(res3.isPureNoise).toBe(true);
  });

  test('Speech with conversational noise around math extracts pure mathematical tokens', () => {
    const res = mathStreamFilter.filter(
      '2+4 then someone came in front of me and i said hello',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('2 + 4');
  });

  test('Speech with "wait listen 2 plus 2" filters greetings and normalizes operator', () => {
    const res = mathStreamFilter.filter(
      'wait listen 2 plus 2',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('2 + 2');
  });

  test('Spoken numbers and operators "two into three"', () => {
    const res = mathStreamFilter.filter('two into three', createMockContext());
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('2 * 3');
  });

  test('Compound spoken numbers "two hundred fifty plus seventy"', () => {
    const res = mathStreamFilter.filter(
      'two hundred fifty plus seventy',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('250 + 70');
  });

  test('Polite fluff around math "can you do five into ten please"', () => {
    const res = mathStreamFilter.filter(
      'can you do five into ten please',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('5 * 10');
  });

  test('Chaining operation with operator prepends previous result', () => {
    const ctx = createMockContext(4); // previous calculation: 2 + 2 = 4
    const res = mathStreamFilter.filter('plus 2 - 5', ctx);
    expect(res.isPureNoise).toBe(false);
    expect(res.isChaining).toBe(true);
    expect(res.cleanMathText).toBe('4 + 2 - 5');
  });

  test('Chaining with symbol operator "+ 5 - 2"', () => {
    const ctx = createMockContext(10);
    const res = mathStreamFilter.filter('+ 5 - 2', ctx);
    expect(res.isPureNoise).toBe(false);
    expect(res.isChaining).toBe(true);
    expect(res.cleanMathText).toBe('10 + 5 - 2');
  });

  test('User example: "hey hi, just calculate what is 2+2" extracts pure "2 + 2"', () => {
    const res = mathStreamFilter.filter(
      'hey hi, just calculate what is 2+2',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('2 + 2');
  });

  test('User example with words: "bro can you calculate 15 percent of 800"', () => {
    const res = mathStreamFilter.filter(
      'bro can you calculate 15 percent of 800',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('15 percent of 800');
  });

  test('User reported bug: "three hundred 10 plus three hundred ten" normalizes to "310 + 310"', () => {
    const res = mathStreamFilter.filter(
      'three hundred 10 plus three hundred ten',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('310 + 310');
  });

  test('Speech output with raw digits "300 10 + 310" merges compound numbers', () => {
    const res = mathStreamFilter.filter(
      '300 10 + 310',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('310 + 310');
  });

  test('Compound numbers with "and": "three hundred and 10 plus three hundred and ten"', () => {
    const res = mathStreamFilter.filter(
      'three hundred and 10 plus three hundred and ten',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('310 + 310');
  });

  test('Spoken compound arithmetic: "five hundred 20 minus 100"', () => {
    const res = mathStreamFilter.filter(
      'five hundred 20 minus 100',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('520 - 100');
  });

  test('Thousands compound: "two thousand 500 divided by 5"', () => {
    const res = mathStreamFilter.filter(
      'two thousand 500 divided by 5',
      createMockContext()
    );
    expect(res.isPureNoise).toBe(false);
    expect(res.cleanMathText).toBe('2500 / 5');
  });
});
