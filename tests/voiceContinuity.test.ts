/**
 * Hands-free continuity tests: what the user hears/sees across pauses.
 * Each case is a list of recognizer FINAL results, one per pause.
 *   "2 + 2" (pause) "+ 2"           -> 6   (continue from the last answer)
 *   "25 plus" (pause) "30"          -> 55  (unfinished phrase waits for the rest)
 *   "5" (pause) "+ 5"               -> 10  (a lone number becomes the current value)
 */

import { IntentService } from '../src/parser/IntentService';
import { CalculationService } from '../src/engine/CalculationService';
import { ConversionService } from '../src/engine/ConversionService';
import { CurrencyService } from '../src/engine/CurrencyService';
import { HistoryService } from '../src/services/HistoryService';
import { SmartCalcOrchestrator } from '../src/services/SmartCalcOrchestrator';
import { SpeechService } from '../src/services/SpeechService';
import { TextToSpeechService } from '../src/services/TextToSpeechService';

function makeOrchestrator() {
  const tts = new TextToSpeechService();
  tts.setMockSpeakHandler(async () => undefined);
  const speech = new SpeechService();
  const history = new HistoryService();
  const orchestrator = new SmartCalcOrchestrator({
    intents: new IntentService(),
    calc: new CalculationService(),
    conv: new ConversionService(),
    curr: new CurrencyService(),
    speech,
    tts,
    history,
  });
  return { orchestrator, speech, history };
}

const strip = (v: string) => v.replace(/,/g, '');

const SEQUENCES: Array<[string[], string]> = [
  [
    [
      "2 + 2",
      "+ 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "+2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "plus 2"
    ],
    "6"
  ],
  [
    [
      "2 plus 2",
      "Plus two"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "plus to"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "add 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "and plus 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "now plus 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "then plus 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "again plus 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "okay plus 2"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "plus 2 more"
    ],
    "6"
  ],
  [
    [
      "2 + 2",
      "- 1"
    ],
    "3"
  ],
  [
    [
      "2 + 2",
      "minus 1"
    ],
    "3"
  ],
  [
    [
      "2 + 2",
      "-1"
    ],
    "3"
  ],
  [
    [
      "2 + 2",
      "times 3"
    ],
    "12"
  ],
  [
    [
      "2 + 2",
      "x 3"
    ],
    "12"
  ],
  [
    [
      "2 + 2",
      "into 3"
    ],
    "12"
  ],
  [
    [
      "2 + 2",
      "multiply by 3"
    ],
    "12"
  ],
  [
    [
      "2 + 2",
      "multiply it by 3"
    ],
    "12"
  ],
  [
    [
      "10 + 10",
      "divided by 2"
    ],
    "10"
  ],
  [
    [
      "10 + 10",
      "/ 2"
    ],
    "10"
  ],
  [
    [
      "10 + 10",
      "by 2"
    ],
    "10"
  ],
  [
    [
      "10 + 10",
      "divide by 2"
    ],
    "10"
  ],
  [
    [
      "2 + 2",
      "double it"
    ],
    "8"
  ],
  [
    [
      "10 + 10",
      "half of it"
    ],
    "10"
  ],
  [
    [
      "2 + 2",
      "square it"
    ],
    "16"
  ],
  [
    [
      "100 + 100",
      "20% of that"
    ],
    "40"
  ],
  [
    [
      "100 + 100",
      "plus 10%"
    ],
    "220"
  ],
  [
    [
      "2 + 2",
      "+ 2",
      "+ 2",
      "+ 2"
    ],
    "10"
  ],
  [
    [
      "5",
      "+ 5"
    ],
    "10"
  ],
  [
    [
      "5 plus",
      "5"
    ],
    "10"
  ],
  [
    [
      "25 plus",
      "30"
    ],
    "55"
  ],
  [
    [
      "100 divided by",
      "4"
    ],
    "25"
  ],
  [
    [
      "12 into",
      "5"
    ],
    "60"
  ],
  [
    [
      "2 + 2",
      "5 + 5"
    ],
    "10"
  ],
  [
    [
      "2 + 2",
      "7"
    ],
    "7"
  ],
  [
    [
      "2 + 2",
      "clear",
      "+ 3"
    ],
    "3"
  ],
  [
    [
      "10 into 2 plus 3"
    ],
    "23"
  ],
  [
    [
      "what's 5 + 5 into 2"
    ],
    "15"
  ],
  [
    [
      "10 plus 10 then minus 5"
    ],
    "15"
  ],
  [
    [
      "2 + 2",
      "plus",
      "2"
    ],
    "6"
  ],
  [
    [
      "okay 5",
      "+ 5"
    ],
    "10"
  ],
  [
    [
      "2 + 2",
      "7 frogs and the moon"
    ],
    "4"
  ],
  [
    [
      "500 rupees",
      "plus 250 rupees"
    ],
    "750"
  ],
  [
    [
      "10",
      "times",
      "3"
    ],
    "30"
  ],
  [
    [
      "2 lakh",
      "divided by 4"
    ],
    "50000"
  ],
  [
    [
      "25 + 25",
      "minus 10",
      "minus 10"
    ],
    "30"
  ],
  [
    [
      "100",
      "- 18%"
    ],
    "82"
  ],
  [
    [
      "100",
      "plus 18% GST"
    ],
    "118"
  ]
];

describe('Continuity across pauses (hands-free voice)', () => {
  test.each(SEQUENCES)('%j -> %s', async (finals, expected) => {
    const { orchestrator, speech } = makeOrchestrator();
    let shown = '';
    speech.setMockSpeechRecognizer(async (cb) => {
      for (const f of finals) {
        cb.onFinalResult(f, []);
        await new Promise((r) => setTimeout(r, 15));
      }
      await new Promise((r) => setTimeout(r, 15));
    });
    await orchestrator.startVoiceSession({
      onResult: (o) => {
        if (o.success) shown = o.formattedResult;
      },
    });
    expect(strip(shown)).toBe(expected);
  });

  test('a lone number is not saved to history, a real sum is', async () => {
    const { orchestrator, speech, history } = makeOrchestrator();
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('5', []);
      await new Promise((r) => setTimeout(r, 15));
      cb.onFinalResult('plus 5', []);
      await new Promise((r) => setTimeout(r, 15));
    });
    await orchestrator.startVoiceSession();
    expect(history.getItems().length).toBe(1);
    expect(history.getItems()[0].result).toBe('10');
  });

  test('an unfinished phrase is shown while waiting for the rest', async () => {
    const { orchestrator, speech } = makeOrchestrator();
    const transcripts: string[] = [];
    speech.setMockSpeechRecognizer(async (cb) => {
      cb.onFinalResult('25 plus', []);
      await new Promise((r) => setTimeout(r, 15));
    });
    await orchestrator.startVoiceSession({ onTranscriptUpdate: (t) => transcripts.push(t) });
    expect(transcripts).toContain('25 plus …');
  });
});

const PHRASES: Array<[string, string]> = [
  [
    "add 5 to 10",
    "15"
  ],
  [
    "subtract 3 from 10",
    "7"
  ],
  [
    "take away 3 from 10",
    "7"
  ],
  [
    "10 take away 3",
    "7"
  ],
  [
    "10 less 3",
    "7"
  ],
  [
    "sum of 5 and 6",
    "11"
  ],
  [
    "the sum of 5 and 6",
    "11"
  ],
  [
    "product of 4 and 5",
    "20"
  ],
  [
    "difference between 10 and 4",
    "6"
  ],
  [
    "what is the difference between 10 and 4",
    "6"
  ],
  [
    "a quarter of 100",
    "25"
  ],
  [
    "one third of 90",
    "30"
  ],
  [
    "twice 7",
    "14"
  ],
  [
    "thrice 7",
    "21"
  ],
  [
    "three times 7",
    "21"
  ],
  [
    "increase 100 by 10 percent",
    "110"
  ],
  [
    "decrease 100 by 10%",
    "90"
  ],
  [
    "reduce 500 by 20%",
    "400"
  ],
  [
    "100 plus 20 percent",
    "120"
  ],
  [
    "2 multiply 3",
    "6"
  ],
  [
    "2 multiply by 3",
    "6"
  ],
  [
    "negative 5 plus 3",
    "-2"
  ],
  [
    "minus 5 plus 3",
    "-2"
  ],
  [
    "7 into 8 plus 3",
    "59"
  ],
  [
    "1 by 2",
    "0.5"
  ],
  [
    "one and a half plus 2",
    "3.5"
  ],
  [
    "two and a half times 4",
    "10"
  ],
  [
    "12 point 5 percent of 400",
    "50"
  ],
  [
    "zero point five times 10",
    "5"
  ],
  [
    "1 million divided by 4",
    "250000"
  ],
  [
    "what is 5 plus 5",
    "10"
  ],
  [
    "how much is 5 plus 5",
    "10"
  ],
  [
    "can you tell me 5 plus 5",
    "10"
  ],
  [
    "please calculate 5 plus 5",
    "10"
  ],
  [
    "5 plus 5 is how much",
    "10"
  ],
  [
    "5 plus 5 equals what",
    "10"
  ],
  [
    "five plus five",
    "10"
  ],
  [
    "Five Plus Five",
    "10"
  ],
  [
    "fifty five plus forty five",
    "100"
  ],
  [
    "a hundred plus 50",
    "150"
  ],
  [
    "one hundred and five minus five",
    "100"
  ],
  [
    "two thousand twenty five plus 5",
    "2030"
  ],
  [
    "1000 - 250",
    "750"
  ],
  [
    "10 percent of 1 lakh",
    "10000"
  ],
  [
    "15 % of 200",
    "30"
  ],
  [
    "5.5 + 4.5",
    "10"
  ],
  [
    "0.1 + 0.2",
    "0.3"
  ],
  [
    "3 + 4 * 2",
    "11"
  ],
  [
    "10 minus 2 minus 3",
    "5"
  ],
  [
    "100 divided by 10 divided by 2",
    "5"
  ],
  [
    "2 into 3 into 4",
    "24"
  ],
  [
    "9 squared plus 1",
    "82"
  ],
  [
    "square root of 16 plus 4",
    "8"
  ],
  [
    "hmm 7 plus uh 3",
    "10"
  ],
  [
    "seven plus three equals",
    "10"
  ],
  [
    "7 + 3 =",
    "10"
  ],
  [
    "7+3",
    "10"
  ],
  [
    "7 plus 3 plus",
    "10"
  ]
];

describe('Natural phrasings', () => {
  test.each(PHRASES)('"%s" -> %s', async (phrase, expected) => {
    const { orchestrator } = makeOrchestrator();
    const out = await orchestrator.processCommand(phrase);
    expect(out.success).toBe(true);
    expect(strip(out.formattedResult)).toBe(expected);
  });
});
