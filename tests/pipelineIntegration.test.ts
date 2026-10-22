/**
 * End-to-End Integration Tests for SmartCalc AI
 *
 * Verifies the complete pipeline required by Section 30 & Section 31:
 * VOICE INPUT -> SPEECH TO TEXT -> AI INTENT PARSER -> STRUCTURED JSON
 * -> VALIDATION -> SAFE CALCULATION ENGINE -> RESULT -> TEXT TO SPEECH -> HISTORY
 */

import { IntentService } from '../src/parser/IntentService';
import { CalculationService } from '../src/engine/CalculationService';
import { ConversionService } from '../src/engine/ConversionService';
import { CurrencyService } from '../src/engine/CurrencyService';
import { VoiceInteractionState } from '../src/models/types';
import { HistoryService } from '../src/services/HistoryService';
import { SmartCalcOrchestrator } from '../src/services/SmartCalcOrchestrator';
import { SpeechService } from '../src/services/SpeechService';
import { TextToSpeechService } from '../src/services/TextToSpeechService';

describe('SmartCalc AI - Full Voice-to-Speech Pipeline Integration Tests', () => {
  let intents: IntentService;
  let calc: CalculationService;
  let conv: ConversionService;
  let curr: CurrencyService;
  let speech: SpeechService;
  let tts: TextToSpeechService;
  let history: HistoryService;
  let orchestrator: SmartCalcOrchestrator;
  let spokenOutputs: string[];

  beforeEach(() => {
    intents = new IntentService();
    calc = new CalculationService();
    conv = new ConversionService();
    curr = new CurrencyService();
    speech = new SpeechService();
    tts = new TextToSpeechService();
    history = new HistoryService();

    spokenOutputs = [];
    tts.setMockSpeakHandler(async (text) => {
      spokenOutputs.push(text);
    });

    orchestrator = new SmartCalcOrchestrator({
      intents,
      calc,
      conv,
      curr,
      speech,
      tts,
      history,
    });
  });

  test('End-to-End Voice Flow: User speaks "Calculate 250 plus 375" -> STT -> AI -> Calc -> UI 625 -> TTS "The answer is 625." -> Saved in History', async () => {
    const observedStates: VoiceInteractionState[] = [];
    let finalTranscript = '';

    let stateWhileSessionOpen: VoiceInteractionState | undefined;
    speech.setMockSpeechRecognizer(async (callbacks) => {
      callbacks.onPartialResult?.('Calculate 250');
      callbacks.onFinalResult('Calculate 250 plus 375');
      // Keep the recognizer session open while the result is processed & spoken
      await new Promise((r) => setTimeout(r, 30));
      stateWhileSessionOpen = observedStates[observedStates.length - 1];
    });

    await orchestrator.startVoiceSession({
      onVoiceStateChange: (state) => observedStates.push(state),
      onTranscriptUpdate: (t, isFinal) => {
        if (isFinal) finalTranscript = t;
      },
    });

    expect(finalTranscript).toBe('Calculate 250 plus 375');
    expect(observedStates).toContain('listening');
    expect(observedStates).toContain('processing');
    // In hands-free voice mode the answer is spoken (mic paused), then the
    // microphone resumes listening while the session is still open
    expect(observedStates).toContain('speaking');
    // Hands-free mode speaks just the number so the mic is back quickly
    expect(spokenOutputs).toContain('625');
    expect(stateWhileSessionOpen).toBe('listening');
    // Once the recognizer session ends, the UI must not claim the mic is still on
    expect(observedStates[observedStates.length - 1]).toBe('idle');

    const historyItems = history.getItems();
    expect(historyItems.length).toBe(1);
    expect(historyItems[0].originalCommand).toBe('Calculate 250 plus 375');
    expect(historyItems[0].interpretedExpression).toBe('250 + 375');
    expect(historyItems[0].result).toBe('625');
  });

  test('Conversational Context Chain 1: "What\'s 25 percent of 800?" -> 200, then "Now add 50" -> 250', async () => {
    const first = await orchestrator.processCommand(
      "What's 25 percent of 800?"
    );
    expect(first.success).toBe(true);
    expect(first.resultNumber).toBe(200);
    expect(first.formattedResult).toBe('200');

    const second = await orchestrator.processCommand('Now add 50');
    expect(second.success).toBe(true);
    expect(second.resultNumber).toBe(250);
    expect(second.formattedResult).toBe('250');
    expect(second.spokenResponse).toBe('The answer is 250.');
  });

  test('Conversational Context Chain 2 (Section 27): "500 divided by 5" -> 100, then "multiply that by 3" -> 300', async () => {
    const first = await orchestrator.processCommand('500 divided by 5');
    expect(first.success).toBe(true);
    expect(first.resultNumber).toBe(100);

    const second = await orchestrator.processCommand('multiply that by 3');
    expect(second.success).toBe(true);
    expect(second.resultNumber).toBe(300);
    expect(second.formattedResult).toBe('300');
    expect(second.spokenResponse).toBe('The answer is 300.');
  });

  test('Clarification Dialog Flow: "divide 10" -> asks "What number should I divide 10 by?" -> user says "by 2" -> 5', async () => {
    const ambiguous = await orchestrator.processCommand('divide 10');
    expect(ambiguous.success).toBe(false);
    expect(ambiguous.requiresClarification).toBe(true);
    expect(ambiguous.clarificationQuestion).toBe(
      'What number should I divide 10 by?'
    );
    expect(spokenOutputs[spokenOutputs.length - 1]).toBe(
      'What number should I divide 10 by?'
    );

    // Follow-up answer from user
    const resolved = await orchestrator.processCommand('by 2');
    expect(resolved.success).toBe(true);
    expect(resolved.resultNumber).toBe(5);
    expect(resolved.formattedResult).toBe('5');
    expect(spokenOutputs[spokenOutputs.length - 1]).toBe('The answer is 5.');
  });

  test('Live Currency Provider Integration: when live rate provider is available, converts accurately; when unavailable, informs user', async () => {
    // 1. Unavailable
    const unavailableOut = await orchestrator.processCommand(
      'Convert 100 dollars to rupees'
    );
    expect(unavailableOut.success).toBe(false);
    expect(unavailableOut.errorCode).toBe('CURRENCY_UNAVAILABLE');

    // 2. Inject mock live exchange rate provider (e.g. 1 USD = 86.5 INR)
    curr.setCustomRateProvider(async (from, to) => ({
      from,
      to,
      rate: 86.5,
      timestamp: Date.now(),
    }));

    const liveOut = await orchestrator.processCommand(
      'Convert 100 dollars to rupees'
    );
    expect(liveOut.success).toBe(true);
    expect(liveOut.resultNumber).toBe(8650);
    expect(liveOut.formattedResult).toBe('₹8650 INR');
  });

  test('Natural Language "Add 2 and 3" -> 5 with timeline recording', async () => {
    const res = await orchestrator.processCommand('Add 2 and 3');
    expect(res.success).toBe(true);
    expect(res.resultNumber).toBe(5);
    expect(res.displayExpression).toBe('2 + 3');
    expect(res.formattedResult).toBe('5');

    const historyItems = history.getItems();
    expect(historyItems.some((h) => h.interpretedExpression === '2 + 3')).toBe(true);
  });

  test('Hindi/Hinglish Voice Math "500 ko 5 se divide karo" speaks in Hindi format', async () => {
    const res = await orchestrator.processCommand('500 ko 5 se divide karo');
    expect(res.success).toBe(true);
    expect(res.resultNumber).toBe(100);
    expect(res.spokenResponse).toBe('उत्तर है 100।');
    expect(spokenOutputs[spokenOutputs.length - 1]).toBe('उत्तर है 100।');
  });

  test('User example: "hey hi, just calculate what is 2+2" ignores greetings and replies 4', async () => {
    const res = await orchestrator.processCommand('hey hi, just calculate what is 2+2');
    expect(res.success).toBe(true);
    expect(res.resultNumber).toBe(4);
    expect(res.formattedResult).toBe('4');
    expect(res.spokenResponse).toBe('The answer is 4.');
  });
});
