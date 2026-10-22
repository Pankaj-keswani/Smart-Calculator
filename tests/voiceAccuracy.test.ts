/**
 * Voice accuracy regression tests.
 *
 * Feeds transcripts in the exact shapes Android / iOS speech recognizers produce
 * (digits, symbols, Indian number grouping, currency symbols, Devanagari, Hinglish,
 * trailing "is/equals"...) through the real orchestrator pipeline.
 */

import { IntentService } from '../src/parser/IntentService';
import { CalculationService } from '../src/engine/CalculationService';
import { ConversionService } from '../src/engine/ConversionService';
import { CurrencyService } from '../src/engine/CurrencyService';
import { HistoryService } from '../src/services/HistoryService';
import { SmartCalcOrchestrator } from '../src/services/SmartCalcOrchestrator';
import { SpeechService } from '../src/services/SpeechService';
import { TextToSpeechService } from '../src/services/TextToSpeechService';
import { normalizeTranscript } from '../src/voice/transcriptNormalizer';
import { mathStreamFilter } from '../src/parser/MathStreamFilter';
import { replaceSpokenNumbers } from '../src/parser/nlParser';

function makeOrchestrator() {
  const intents = new IntentService();
  const curr = new CurrencyService();
  const tts = new TextToSpeechService();
  const spoken: string[] = [];
  tts.setMockSpeakHandler(async (t) => {
    spoken.push(t);
  });
  const speech = new SpeechService();
  const history = new HistoryService();
  const orchestrator = new SmartCalcOrchestrator({
    intents,
    calc: new CalculationService(),
    conv: new ConversionService(),
    curr,
    speech,
    tts,
    history,
  });
  return { orchestrator, speech, history, spoken };
}

const CORPUS: Array<[string, string]> = [
  // plain recognizer output
  ['25 + 30', '55'],
  ['what is 25 + 30?', '55'],
  ['25 + 30.', '55'],
  ['= 25 + 30', '55'],
  ['25 plus 30 equals', '55'],
  ['7 times 8 is', '56'],
  ['2 + 2 equal to', '4'],
  ['12 x 8', '96'],
  ['12x12', '144'],
  ['100 by 4', '25'],
  ['72 by 8', '9'],
  ['multiply 12 by 8', '96'],
  ['7 multiplied with 6', '42'],
  // unicode operators
  ['10 − 3', '7'],
  ['10 − 4 − 3', '3'],
  ['5 × 6', '30'],
  ['10 ÷ 2', '5'],
  ['(2 + 3) × 4', '20'],
  // Indian & western number grouping, magnitudes, currency
  ['1,000 + 500', '1,500'],
  ['1,00,000 + 50,000', '1,50,000|150,000'],
  ['1 lakh + 50000', '1,50,000|150,000'],
  ['2 lakh / 4', '50,000'],
  ['1.5 lakh / 3', '50,000'],
  ['1 crore / 100', '1,00,000|100,000'],
  ['1 crore minus 1 lakh', '99,00,000|9,900,000'],
  ['one lakh plus fifty thousand', '1,50,000|150,000'],
  ['5k + 2k', '7,000'],
  ['₹500 + ₹250', '750'],
  ['Rs 500 + Rs 250', '750'],
  ['500 rupees plus 250 rupees', '750'],
  ['$50 + $25', '75'],
  // functions & powers that the old stream filter destroyed
  ['5 squared', '25'],
  ['3 cubed', '27'],
  ['5 square', '25'],
  ['5 cube', '125'],
  ['2 to the power 10', '1,024'],
  ['2 raised to 5', '32'],
  ['2 power 5', '32'],
  ['cube root of 27', '3'],
  ['cube root of 64', '4'],
  ['square root of 144', '12'],
  ['under root 81', '9'],
  ['5 factorial', '120'],
  ['log 100', '2'],
  ['sin 30', '0.5'],
  ['half of 250', '125'],
  ['double 45', '90'],
  ['split 1200 between 4 people', '300'],
  ['split 1,200 among 4 people', '300'],
  ['average of 10, 20 and 30', '20'],
  ['3/4 of 100', '75'],
  ['open bracket 10 + 20 close bracket into 3', '90'],
  // decimals
  ['point 5 + point 25', '0.75'],
  ['3 point 5 plus 1 point 5', '5'],
  // Hinglish
  ['100 aur 200 jodo', '300'],
  ['do sau plus teen sau', '500'],
  ['do aur teen jodo', '5'],
  ['6 aur 7 ka guna', '42'],
  ['100 aur 30 ka antar', '70'],
  ['25 + 30 kitna hua', '55'],
  ['50 ko 5 se bhag karo', '10'],
  ['500 ka 10 percent', '50'],
  // Devanagari (hi-IN recognizer output)
  ['पांच प्लस तीन', '8'],
  ['5 प्लस 3', '8'],
  ['100 और 200 जोड़ो', '300'],
  ['500 का 10 प्रतिशत', '50'],
  ['10 गुणा 5', '50'],
  ['100 में से 30 घटाओ', '70'],
  ['दो सौ प्लस तीन सौ', '500'],
  // percentages / everyday
  ['15% of 200', '30'],
  ['what is 15 percent of 2,500', '375'],
  ['20% off on 500', '400'],
  ['15% tip on 800', '120'],
];

describe('Voice accuracy corpus (recognizer-shaped transcripts)', () => {
  test.each(CORPUS)('"%s" -> %s', async (phrase, expected) => {
    const { orchestrator } = makeOrchestrator();
    const out = await orchestrator.processCommand(phrase);
    expect(out.success).toBe(true);
    const strip = (v: string) => v.replace(/,/g, '');
    expect(expected.split('|').map(strip)).toContain(strip(out.formattedResult));
  });
});

describe('Transcript normalizer', () => {
  test.each([
    ['1,00,000', '100000'],
    ['1,000,000 + 5', '1000000 + 5'],
    ['10 − 3', '10 - 3'],
    ['2 lakh', '200000'],
    ['1.1 lakh', '110000'],
    ['1 lakh 50 thousand', '150000'],
    ['7 times 8 is', '7 times 8'],
    ['25 + 30 kitna hua', '25 + 30'],
    ['open bracket 2 + 3 close bracket', '( 2 + 3 )'],
    ['2 to the power of 8', '2 ^ 8'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTranscript(input)).toBe(expected);
  });

  test('is idempotent', () => {
    for (const [p] of CORPUS) {
      const once = normalizeTranscript(p);
      expect(normalizeTranscript(once)).toBe(once);
    }
  });

  test('keeps "multiply X by Y" as multiplication (does not turn "by" into divide)', () => {
    expect(normalizeTranscript('multiply 12 by 8')).toBe('multiply 12 by 8');
  });

  test('English "do" stays a verb, Hindi "do sau" becomes 200', () => {
    expect(replaceSpokenNumbers('how do i add 5 and 6')).toContain('how do i');
    expect(replaceSpokenNumbers('do sau')).toBe('200');
  });
});

describe('Stream filter keeps conversation out, math in', () => {
  const ctx = {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };
  test.each(['hello how are you', 'arre suno kya haal hai', 'okay thank you'])(
    '"%s" is pure noise',
    (p) => {
      expect(mathStreamFilter.filter(p, ctx).isPureNoise).toBe(true);
    }
  );
  test('"100 aur 200 jodo" has no dangling operator', () => {
    expect(mathStreamFilter.filter('100 aur 200 jodo', ctx).cleanMathText).toBe('100 + 200');
  });
  test('"cube root of 27" is not turned into a square root', () => {
    expect(mathStreamFilter.filter('cube root of 27', ctx).tokenMathText).toBe('cbrt(27)');
  });
});

describe('Hands-free voice session behaviour', () => {
  test('uses the recognizer alternative that is valid math', async () => {
    const { orchestrator, speech, history } = makeOrchestrator();
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('ten divided by', ['10 divided by 2', '10 divided by two']);
      await new Promise((r) => setTimeout(r, 30));
    });
    await orchestrator.startVoiceSession();
    expect(history.getItems()[0]?.result).toBe('5');
  });

  test('does not double-count when a late final repeats the same calculation', async () => {
    const { orchestrator, speech, history } = makeOrchestrator();
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('25 plus 30');
      await new Promise((r) => setTimeout(r, 20));
      cb.onFinalResult('25 + 30');
      await new Promise((r) => setTimeout(r, 20));
    });
    await orchestrator.startVoiceSession();
    expect(history.getItems().length).toBe(1);
  });

  test('unintelligible speech shows a notice instead of an Error result', async () => {
    const { orchestrator, speech } = makeOrchestrator();
    const notices: Array<string | null> = [];
    const results: string[] = [];
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('7 frogs and the moon');
      await new Promise((r) => setTimeout(r, 30));
    });
    await orchestrator.startVoiceSession({
      onNotice: (n) => notices.push(n),
      onResult: (o) => results.push(o.formattedResult),
    });
    expect(notices.some((n) => n && n.startsWith("Didn't catch"))).toBe(true);
    expect(results).not.toContain('Error');
  });

  test('speaks the answer with the microphone paused, then resumes', async () => {
    const { orchestrator, speech, spoken } = makeOrchestrator();
    const states: string[] = [];
    let listeningWhileSpeaking: boolean | null = null;
    const origSuspend = speech.suspend.bind(speech);
    speech.suspend = async () => {
      await origSuspend();
      listeningWhileSpeaking = (speech as unknown as { suspended: boolean }).suspended;
    };
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('6 times 7');
      await new Promise((r) => setTimeout(r, 30));
      states.push(`final:${speech.isListening()}`);
    });
    await orchestrator.startVoiceSession({ onVoiceStateChange: (s) => states.push(s) });
    // Hands-free mode speaks just the number so the mic is back quickly
    expect(spoken).toContain('42');
    expect(listeningWhileSpeaking).toBe(true);
    expect(states).toContain('speaking');
  });
});
