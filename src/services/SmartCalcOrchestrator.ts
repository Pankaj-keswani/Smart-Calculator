/**
 * SmartCalc End-to-End Pipeline Orchestrator (SmartCalcOrchestrator)
 *
 * Everything runs on the phone:
 * VOICE INPUT -> ON-DEVICE SPEECH TO TEXT -> TRANSCRIPT NORMALIZER -> RULE-BASED PARSER
 * -> VALIDATION -> SAFE CALCULATION ENGINE -> RESULT -> TEXT TO SPEECH -> HISTORY
 */

import { intentService, IntentService, IntentError } from '../parser/IntentService';
import {
  CalculationService,
  calculationService,
} from '../engine/CalculationService';
import {
  ConversionService,
  conversionService,
} from '../engine/ConversionService';
import { CurrencyService, currencyService } from '../engine/CurrencyService';
import {
  CalculationOutput,
  ConversationContext,
  ErrorCode,
  StructuredAIIntent,
  VoiceInteractionState,
} from '../models/types';
import { normalizeTranscript } from '../voice/transcriptNormalizer';
import { HistoryService, historyService } from './HistoryService';
import { SpeechService, speechService } from './SpeechService';
import {
  TextToSpeechService,
  textToSpeechService,
} from './TextToSpeechService';
import { settingsService } from './SettingsService';
import { formatSpokenResult, getLocalizedErrorMessage } from '../localization/i18n';
import { mathStreamFilter } from '../parser/MathStreamFilter';
import { updateWidgetDisplay } from '../utils/floatingOverlay';
import { playConfirmationChime } from '../utils/sound';

export interface OrchestratorStateCallbacks {
  onVoiceStateChange?: (state: VoiceInteractionState) => void;
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onResult?: (output: CalculationOutput) => void;
  onContextUpdate?: (context: ConversationContext) => void;
  /** Short, non-error status line for the mic UI ("Didn't catch that…", mic problems). */
  onNotice?: (message: string | null) => void;
}

interface IntentResolution {
  intent: StructuredAIIntent;
  /** The candidate text that produced the intent. */
  command: string;
  /** Output already computed while validating the candidate (pure engines only). */
  output?: CalculationOutput;
}

/**
 * Engine errors that mean "this text was not understood" (try another candidate),
 * as opposed to real math outcomes such as division by zero.
 */
const NOT_UNDERSTOOD_ERRORS = new Set<ErrorCode>([
  'UNSUPPORTED_OPERATION',
  'INVALID_EXPRESSION',
  'INVALID_NUMBER',
  'UNSUPPORTED_JEV_FUNCTION',
  'JEV_ERROR',
  'VALIDATION_MISMATCH',
  'UNSUPPORTED_UNIT',
  'MALFORMED_AI_RESPONSE',
]);

/** Filler words allowed around a lone number ("okay 5", "now 500 rupees"). */
const NUMBER_FILLER = new Set([
  'um', 'uh', 'hmm', 'ok', 'okay', 'so', 'now', 'then', 'and', 'the', 'a', 'number',
  'is', 'it', 'its', "it's", 'just', 'start', 'with', 'from', 'value', 'new', 'next',
  'please', 'again', 'set', 'yes', 'hey', 'hi', 'hello', 'calculate', 'what', 'whats',
  "what's", 'equals', 'equal', 'to', 'hai', 'bhai', 'arre', 'acha', 'haan', 'chalo',
]);

/** True when a phrase is only a number plus filler — not "7 frogs and the moon". */
function isJustANumber(text: string): boolean {
  const words = normalizeTranscript(text)
    .toLowerCase()
    .replace(/[-+]?\d+(?:\.\d+)?/g, ' ')
    .split(/[^a-z'\u0900-\u097f]+/)
    .filter(Boolean);
  return words.every((w) => NUMBER_FILLER.has(w));
}

/** Window in which an identical spoken calculation is treated as a duplicate. */
const DUPLICATE_WINDOW_MS = 4000;
/** Partial transcripts are only evaluated if no final result arrives within this time. */
const PARTIAL_FALLBACK_MS = 2500;
/** "25 plus" … (pause) … "30": how long a dangling phrase waits for its continuation. */
const PENDING_PREFIX_MS = 12000;
/**
 * A phrase that ends on an operator is incomplete ("25 plus", "100 divided by",
 * "square root of"). Percent at the end is complete ("1000 + 18%"), and Hinglish
 * verbs at the end ("100 aur 200 jodo") finish a command.
 */
const DANGLING_END =
  /(?:[+\-*/^×÷(]|\b(?:plus|minus|times|into|multiply|multiplied\s+by|divide|divided\s+by|by|over|upon|of|and|aur|ka|pe|par|guna|bhag|power|raised\s+to|to\s+the\s+power(?:\s+of)?))\s*$/i;

export class SmartCalcOrchestrator {
  private context: ConversationContext = {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };

  private intents: IntentService;
  private calc: CalculationService;
  private conv: ConversionService;
  private curr: CurrencyService;
  private speech: SpeechService;
  private tts: TextToSpeechService;
  private history: HistoryService;
  private partialEvalTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProcessedTranscript = '';
  private lastEvaluatedAt = 0;
  /** Incomplete phrase waiting for the next one ("25 plus" + "30"). */
  private pendingPrefix: { text: string; at: number } | null = null;
  /** Raw text of the last partial-fallback evaluation (its late final is ignored). */
  private lastPartialEvaluated: { text: string; at: number } | null = null;

  constructor(deps?: {
    intents?: IntentService;
    calc?: CalculationService;
    conv?: ConversionService;
    curr?: CurrencyService;
    speech?: SpeechService;
    tts?: TextToSpeechService;
    history?: HistoryService;
  }) {
    this.intents = deps?.intents || intentService;
    this.calc = deps?.calc || calculationService;
    this.conv = deps?.conv || conversionService;
    this.curr = deps?.curr || currencyService;
    this.speech = deps?.speech || speechService;
    this.tts = deps?.tts || textToSpeechService;
    this.history = deps?.history || historyService;
  }

  public getContext(): ConversationContext {
    return {
      ...this.context,
      recentTurns: [...this.context.recentTurns],
    };
  }

  public resetContext(): ConversationContext {
    this.context = {
      lastResult: null,
      lastFormattedResult: null,
      lastExpression: null,
      lastUnit: null,
      pendingClarification: null,
      recentTurns: [],
    };
    return this.getContext();
  }

  /**
   * Updates the conversational context from Manual Calculator mode or reused history item
   * so follow-up voice commands ("Multiply that by 3") work across modes.
   */
  public setLastCalculationContext(
    resultNumber: number,
    formattedResult: string,
    expression: string,
    unit: string | null = null
  ): void {
    this.context.lastResult = resultNumber;
    this.context.lastFormattedResult = formattedResult;
    this.context.lastExpression = expression;
    this.context.lastUnit = unit;
    this.context.pendingClarification = null;
    updateWidgetDisplay(formattedResult);
  }

  /**
   * Section 8 Local Context Resolver:
   * Ensures any reference to `that`, `it`, `previous_result`, `last_result`, `ans`
   * or `uses_previous_result` is populated strictly from local `this.context.lastResult`.
   */
  public resolveContextFromLocalState(
    intent: StructuredAIIntent
  ): StructuredAIIntent {
    const previousResult = this.context.lastResult;
    if (previousResult === null || !Number.isFinite(previousResult)) {
      return intent;
    }

    const resolved: StructuredAIIntent = {
      ...intent,
      values: intent.values ? [...intent.values] : undefined,
    };

    if (resolved.expression) {
      const hasContextToken =
        /\b(?:that|it|previous_result|last_result|previousResult|ans|the_answer)\b/i.test(
          resolved.expression
        );
      if (hasContextToken) {
        resolved.expression = resolved.expression.replace(
          /\b(?:that|it|previous_result|last_result|previousResult|ans|the_answer)\b/gi,
          String(previousResult)
        );
        resolved.uses_previous_result = true;
      }
    }

    if (resolved.uses_previous_result) {
      const op = resolved.operation;
      if (
        (op === 'addition' ||
          op === 'subtraction' ||
          op === 'multiplication' ||
          op === 'division' ||
          op === 'power') &&
        resolved.values
      ) {
        if (resolved.values.length === 1) {
          resolved.values = [previousResult, resolved.values[0]];
        } else if (resolved.values.length >= 2 && resolved.values[0] !== previousResult) {
          // Force first operand to be authoritative local previousResult
          resolved.values[0] = previousResult;
        }
      }
    }

    return resolved;
  }

  /**
   * Executes a single natural-language voice or text command through the complete pipeline:
   * AI Intent Understanding -> Schema Validation -> Deterministic Engine -> History -> TTS
   */
  public async processCommand(
    spokenOrTypedCommand: string,
    callbacks?: OrchestratorStateCallbacks,
    options?: {
      isVoiceStream?: boolean;
      originalSpoken?: string;
      /** Other speech-recognizer hypotheses for the same utterance (best first). */
      alternatives?: string[];
    }
  ): Promise<CalculationOutput> {
    const trimmed = spokenOrTypedCommand.trim();
    const displayCommand = options?.originalSpoken?.trim() || trimmed;
    callbacks?.onTranscriptUpdate?.(displayCommand, true);
    callbacks?.onVoiceStateChange?.('processing');

    const userLang = settingsService.getSettings().language || 'en-US';
    const isHindiText = /[\u0900-\u097F]|\b(?:jodo|ghatao|guna|bhaag|kitna|hota|hai|aur|karo|uttar|pratishat|bata)\b/i.test(trimmed);
    const effectiveLang = (isHindiText && (userLang === 'en-US' || userLang === 'en-IN')) ? 'hi-IN' : userLang;

    try {
      // On-device interpretation over every recognizer hypothesis.
      // Context (previousResult) is injected from local state.
      const resolution = await this.resolveIntent(trimmed, options);
      const intent = resolution.intent;

      // Handle context reset
      if (intent.intent === 'context_reset') {
        this.resetContext();
        callbacks?.onContextUpdate?.(this.getContext());
        const output: CalculationOutput = {
          success: true,
          formattedResult: '0',
          displayExpression: 'Context reset',
          spokenResponse:
            intent.response_text || 'Calculation context has been cleared.',
          intent,
        };
        callbacks?.onResult?.(output);
        if (options?.isVoiceStream) {
          await this.announceInVoiceStream(output.spokenResponse, callbacks);
        } else {
          await this.speakOutput(output.spokenResponse, callbacks);
        }
        return output;
      }

      // Handle Hands-Free Voice Control Commands (Clear, Undo, Copy, Repeat, Memory slots)
      if (intent.intent === 'voice_control') {
        const action = intent.voice_action;
        let controlOutput: CalculationOutput;

        if (action === 'clear') {
          this.resetContext();
          controlOutput = {
            success: true,
            resultNumber: 0,
            formattedResult: '0',
            displayExpression: '0',
            spokenResponse: 'Cleared.',
          };
        } else if (action === 'undo') {
          const recent = this.context.recentTurns;
          if (recent.length > 1) {
            recent.pop();
            const prev = recent[recent.length - 1];
            this.context.lastResult = prev.result;
            this.context.lastFormattedResult = String(prev.result);
            this.context.lastExpression = prev.expression;
            controlOutput = {
              success: true,
              resultNumber: prev.result,
              formattedResult: String(prev.result),
              displayExpression: prev.expression,
              spokenResponse: `Reverted to ${prev.result}.`,
            };
          } else {
            this.resetContext();
            controlOutput = {
              success: true,
              resultNumber: 0,
              formattedResult: '0',
              displayExpression: '0',
              spokenResponse: 'Cleared.',
            };
          }
        } else if (action === 'copy') {
          const textToCopy = this.context.lastFormattedResult || '0';
          try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const Clipboard = require('expo-clipboard');
            void Clipboard.setStringAsync(textToCopy);
          } catch {
            // Ignore
          }
          controlOutput = {
            success: true,
            resultNumber: this.context.lastResult ?? undefined,
            formattedResult: textToCopy,
            displayExpression: this.context.lastExpression || '0',
            spokenResponse: `Copied ${textToCopy} to clipboard.`,
          };
        } else if (action === 'repeat') {
          const textToSpeak = this.context.lastFormattedResult
            ? `The answer is ${this.context.lastFormattedResult}.`
            : 'No previous calculation.';
          controlOutput = {
            success: true,
            resultNumber: this.context.lastResult ?? undefined,
            formattedResult: this.context.lastFormattedResult || '0',
            displayExpression: this.context.lastExpression || '0',
            spokenResponse: textToSpeak,
          };
        } else if (action === 'memory_save') {
          const key = intent.memory_key || 'memory';
          const val = intent.value ?? (this.context.lastResult ?? 0);
          if (!this.context.memoryVariables) {
            this.context.memoryVariables = {};
          }
          this.context.memoryVariables[key] = val;
          controlOutput = {
            success: true,
            resultNumber: val,
            formattedResult: String(val),
            displayExpression: `${key} = ${val}`,
            spokenResponse: `Saved ${val} as ${key}.`,
          };
        } else if (action === 'memory_recall') {
          const key = intent.memory_key || 'memory';
          const val = intent.value ?? (this.context.memoryVariables?.[key] ?? 0);
          this.context.lastResult = val;
          this.context.lastFormattedResult = String(val);
          this.context.lastExpression = key;
          controlOutput = {
            success: true,
            resultNumber: val,
            formattedResult: String(val),
            displayExpression: key,
            spokenResponse: `${key} is ${val}.`,
          };
        } else {
          controlOutput = {
            success: true,
            formattedResult: this.context.lastFormattedResult || '0',
            displayExpression: this.context.lastExpression || '0',
            spokenResponse: intent.response_text || 'OK.',
          };
        }

        callbacks?.onResult?.(controlOutput);
        callbacks?.onContextUpdate?.(this.getContext());
        if (options?.isVoiceStream) {
          await this.announceInVoiceStream(controlOutput.spokenResponse, callbacks);
        } else {
          await this.speakOutput(controlOutput.spokenResponse, callbacks);
        }
        return controlOutput;
      }

      let output: CalculationOutput;

      // Route to appropriate deterministic engine
      if (intent.requires_clarification || intent.intent === 'clarification') {
        output = this.calc.executeIntent(intent, displayCommand);
        this.context.pendingClarification = {
          question:
            output.clarificationQuestion ||
            'Could you clarify what you would like to calculate?',
          partialCommand: trimmed,
          operation: intent.pending_operation?.operation || intent.operation,
          firstOperand:
            intent.pending_operation?.first_operand ??
            intent.value ??
            intent.values?.[0],
          fromUnit: intent.from_unit ?? undefined,
        };
        callbacks?.onContextUpdate?.(this.getContext());
      } else if (resolution.output) {
        output = resolution.output;
      } else if (
        intent.intent === 'conversion' ||
        intent.intent === 'unit_conversion'
      ) {
        output = this.conv.executeIntent(intent);
      } else if (
        intent.intent === 'currency' ||
        intent.intent === 'currency_conversion'
      ) {
        output = await this.curr.executeIntent(intent);
      } else {
        output = this.calc.executeIntent(intent, displayCommand);
      }

      // Hands-free mode: an utterance we could not understand is not an "Error" on the
      // calculator — show a gentle hint, keep the previous result, keep listening.
      if (
        options?.isVoiceStream &&
        !output.success &&
        !output.requiresClarification &&
        (intent.intent === 'unsupported' ||
          (output.errorCode !== undefined && NOT_UNDERSTOOD_ERRORS.has(output.errorCode)))
      ) {
        this.notifyNotUnderstood(displayCommand, callbacks);
        return {
          ...output,
          formattedResult: this.context.lastFormattedResult || '0',
          displayExpression: this.context.lastExpression || 'Ready',
          spokenResponse: '',
        };
      }

      // Update context and history on successful deterministic calculation
      if (output.success && typeof output.resultNumber === 'number') {
        this.context.lastResult = output.resultNumber;
        this.context.lastFormattedResult = output.formattedResult;
        this.context.lastExpression = output.displayExpression;
        this.context.lastUnit = output.unit ?? null;
        this.context.pendingClarification = null;
        this.context.recentTurns = [
          ...this.context.recentTurns.slice(-9),
          {
            userText: trimmed,
            expression: output.displayExpression,
            result: output.resultNumber,
            timestamp: Date.now(),
          },
        ];
        callbacks?.onContextUpdate?.(this.getContext());

        await this.history.addEntry({
          originalCommand: displayCommand,
          interpretedExpression: output.displayExpression,
          result: output.formattedResult,
          numericResult: output.resultNumber,
          unit: output.unit,
          mode: 'voice',
        });
      }

      // Parser response_text never overrides deterministic mathematical results.
      // Only use response_text for unsupported/clarification intents.
      if (
        intent.intent === 'unsupported' &&
        intent.response_text &&
        !output.clarificationQuestion
      ) {
        output.spokenResponse = intent.response_text;
      } else if (
        output.success &&
        output.formattedResult &&
        output.spokenResponse &&
        (output.spokenResponse.startsWith('The answer is') ||
          output.spokenResponse.startsWith('The result is') ||
          effectiveLang !== 'en-US')
      ) {
        output.spokenResponse = formatSpokenResult(
          output.formattedResult,
          effectiveLang
        );
      }

      callbacks?.onNotice?.(null);
      callbacks?.onResult?.(output);
      if (output.success && output.formattedResult) {
        updateWidgetDisplay(output.formattedResult);
      }
      if (options?.isVoiceStream) {
        // Hands-free mode: chime, then speak just the number ("6") with the mic paused,
        // so the recognizer never hears the app's own voice and is back quickly for
        // the next "plus 2".
        const short =
          output.success && !output.requiresClarification
            ? output.formattedResult
            : output.spokenResponse;
        await this.announceInVoiceStream(short, callbacks);
      } else {
        await this.speakOutput(output.spokenResponse, callbacks);
      }
      return output;
    } catch (err) {
      const errorCode =
        err instanceof IntentError ? err.code : 'INVALID_EXPRESSION';
      const friendlyMessage =
        err instanceof IntentError
          ? err.friendlyMessage
          : getLocalizedErrorMessage(effectiveLang);

      const errorOutput: CalculationOutput = {
        success: false,
        formattedResult: 'Error',
        displayExpression: trimmed || 'Invalid command',
        spokenResponse: friendlyMessage,
        errorCode,
        errorMessage: friendlyMessage,
      };

      if (options?.isVoiceStream) {
        // In continuous hands-free voice stream, never flash "Error" on the calculator display
        // for transient noise or mid-sentence pauses; keep listening smoothly!
        this.notifyNotUnderstood(displayCommand, callbacks);
        return {
          success: false,
          formattedResult: this.context.lastFormattedResult || '0',
          displayExpression: this.context.lastExpression || 'Ready',
          spokenResponse: '',
          errorCode,
          errorMessage: friendlyMessage,
        };
      }

      callbacks?.onResult?.(errorOutput);
      await this.speakOutput(errorOutput.spokenResponse, callbacks);
      return errorOutput;
    }
  }

  private clearPartialEvalTimer(): void {
    if (this.partialEvalTimer) {
      clearTimeout(this.partialEvalTimer);
      this.partialEvalTimer = null;
    }
  }

  /**
   * Builds the ordered, de-duplicated list of texts to try for one utterance:
   * for every recognizer hypothesis, the filtered math text and the normalized
   * full sentence (which keeps words like "squared", "half of", "split").
   */
  private buildCandidates(primary: string, alternatives?: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (t?: string | null) => {
      const v = t?.replace(/\s+/g, ' ').trim();
      if (!v) return;
      const key = v.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(v);
    };

    const hypotheses = [primary, ...(alternatives || [])].filter(
      (h, i, arr) => h && h.trim() && arr.findIndex((x) => x.trim().toLowerCase() === h.trim().toLowerCase()) === i
    );

    for (const hyp of hypotheses) {
      const filtered = mathStreamFilter.filter(hyp, this.context);
      const normalized = normalizeTranscript(hyp);
      if (filtered.isPureNoise && !/\d/.test(normalized)) {
        continue;
      }
      if (this.context.pendingClarification) {
        // Answers to a clarification ("by 2") must keep their wording
        push(normalized);
        push(filtered.cleanMathText);
      } else if (filtered.needsNaturalLanguageParser) {
        push(filtered.cleanMathText);
        push(normalized);
        push(filtered.tokenMathText);
      } else {
        push(filtered.cleanMathText);
        push(normalized);
      }
    }
    if (out.length === 0) push(primary);
    return out;
  }

  /**
   * Runs one candidate through the on-device parser and (for pure engines) the
   * calculator, so we can tell "understood" from "not understood" before committing.
   */
  private tryLocalCandidate(
    candidate: string,
    displayCommand: string
  ): (IntentResolution & { status: 'ok' | 'clarification' | 'failed' }) | null {
    let intent: StructuredAIIntent;
    try {
      intent = this.resolveContextFromLocalState(
        this.intents.interpret(candidate, this.context)
      );
    } catch {
      return null;
    }

    if (intent.intent === 'unsupported') {
      return { intent, command: candidate, status: 'failed' };
    }
    if (intent.requires_clarification || intent.intent === 'clarification') {
      return { intent, command: candidate, status: 'clarification' };
    }
    if (
      intent.intent === 'voice_control' ||
      intent.intent === 'context_reset' ||
      intent.intent === 'currency' ||
      intent.intent === 'currency_conversion'
    ) {
      return { intent, command: candidate, status: 'ok' };
    }

    let output: CalculationOutput;
    try {
      output =
        intent.intent === 'conversion' || intent.intent === 'unit_conversion'
          ? this.conv.executeIntent(intent)
          : this.calc.executeIntent(intent, displayCommand);
    } catch {
      return { intent, command: candidate, status: 'failed' };
    }

    const understood =
      output.success ||
      (output.errorCode !== undefined && !NOT_UNDERSTOOD_ERRORS.has(output.errorCode));
    return { intent, command: candidate, output, status: understood ? 'ok' : 'failed' };
  }

  /**
   * On-device intent resolution: every candidate through the deterministic parser
   * (instant, offline); if none is understood, the best clarification / failure
   * is used for a helpful message.
   */
  private async resolveIntent(
    trimmed: string,
    options?: { originalSpoken?: string; alternatives?: string[] }
  ): Promise<IntentResolution> {
    const displayCommand = options?.originalSpoken?.trim() || trimmed;
    const candidates = this.buildCandidates(trimmed, options?.alternatives);

    let firstClarification: IntentResolution | null = null;
    let firstFailure: IntentResolution | null = null;
    for (const candidate of candidates) {
      const attempt = this.tryLocalCandidate(candidate, displayCommand);
      if (!attempt) continue;
      if (attempt.status === 'ok') return attempt;
      if (attempt.status === 'clarification' && !firstClarification) firstClarification = attempt;
      if (attempt.status === 'failed' && !firstFailure) firstFailure = attempt;
    }

    // Safety net: a candidate that is already a pure math expression
    // ("sqrt(16) + 4", "( 100 * 3 / 4 ) + 5") goes straight to the engine.
    for (const candidate of candidates) {
      const bare = candidate.replace(/\b(?:sqrt|cbrt|sin|cos|tan|log|ln|abs)\b/gi, '');
      if (!/\d/.test(candidate) || !/^[\d\s.+\-*/^%()]+$/.test(bare) || !/[+\-*/^%(]/.test(bare)) {
        continue;
      }
      const intent: StructuredAIIntent = {
        intent: 'calculate',
        operation: 'expression',
        expression: candidate,
        requires_clarification: false,
      };
      try {
        const output = this.calc.executeIntent(intent, displayCommand);
        if (output.success) return { intent, command: candidate, output };
      } catch {
        // try next
      }
    }

    if (firstClarification) return firstClarification;
    if (firstFailure) return firstFailure;
    return {
      intent: this.resolveContextFromLocalState(
        this.intents.interpret(trimmed, this.context)
      ),
      command: trimmed,
    };
  }

  private notifyNotUnderstood(
    spoken: string,
    callbacks?: OrchestratorStateCallbacks
  ): void {
    const shown = spoken.length > 40 ? `${spoken.slice(0, 40)}…` : spoken;
    callbacks?.onTranscriptUpdate?.('', false);
    callbacks?.onNotice?.(`Didn't catch "${shown}" — try again`);
    if (this.speech.isListening()) {
      callbacks?.onVoiceStateChange?.('listening');
    } else {
      callbacks?.onVoiceStateChange?.('idle');
    }
  }

  /** Sets a spoken bare number as the current value (no history entry, no speech). */
  private setRunningValue(
    value: number,
    spoken: string,
    callbacks?: OrchestratorStateCallbacks
  ): void {
    if (!Number.isFinite(value)) return;
    const formatted = this.calc.formatNumber(value);
    this.context.lastResult = value;
    this.context.lastFormattedResult = formatted;
    this.context.lastExpression = formatted;
    this.context.lastUnit = null;
    this.context.pendingClarification = null;
    callbacks?.onNotice?.(null);
    callbacks?.onTranscriptUpdate?.(spoken, true);
    callbacks?.onResult?.({
      success: true,
      resultNumber: value,
      formattedResult: formatted,
      displayExpression: formatted,
      spokenResponse: '',
    });
    callbacks?.onContextUpdate?.(this.getContext());
    updateWidgetDisplay(formatted);
    callbacks?.onVoiceStateChange?.(this.speech.isListening() ? 'listening' : 'idle');
  }

  /**
   * Hands-free feedback: chime + haptic, then (if TTS is on) speak the answer while
   * the microphone is paused, then resume listening.
   */
  private async announceInVoiceStream(
    text: string,
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    playConfirmationChime();
    const settings = settingsService.getSettings();
    if (settings.ttsEnabled && text && text.trim() && this.speech.isListening()) {
      await this.speech.suspend();
      await new Promise<void>((resolve) => {
        // Safety net: some devices never fire onDone (no TTS voice installed, audio
        // focus lost). Never leave the microphone paused because of that.
        const safety = setTimeout(resolve, Math.min(8000, 2500 + text.length * 90));
        const finish = () => {
          clearTimeout(safety);
          resolve();
        };
        void this.tts.speak(text, {
          onStart: () => callbacks?.onVoiceStateChange?.('speaking'),
          onDone: finish,
          onError: finish,
        });
      });
      const resumed = await this.speech.resume();
      callbacks?.onVoiceStateChange?.(
        resumed && this.speech.isListening() ? 'listening' : 'idle'
      );
      return;
    }
    callbacks?.onVoiceStateChange?.(this.speech.isListening() ? 'listening' : 'idle');
  }

  /**
   * Evaluates one recognized utterance (with all recognizer hypotheses).
   */
  private async evaluateSpokenSegment(
    rawTranscript: string,
    callbacks?: OrchestratorStateCallbacks,
    alternatives: string[] = [],
    fromPartial = false
  ): Promise<void> {
    const raw = rawTranscript.trim();
    if (!raw) return;
    const now = Date.now();

    // A late final for audio we already evaluated from a partial transcript
    if (!fromPartial && this.lastPartialEvaluated) {
      const recent = now - this.lastPartialEvaluated.at < DUPLICATE_WINDOW_MS;
      const same =
        normalizeTranscript(raw).toLowerCase() ===
        normalizeTranscript(this.lastPartialEvaluated.text).toLowerCase();
      this.lastPartialEvaluated = null;
      if (recent && same) return;
    }

    let hypotheses = [raw, ...alternatives.filter((a) => a && a.trim())];

    // Continue an incomplete phrase from the previous pause: "25 plus" … "30"
    if (this.pendingPrefix) {
      if (now - this.pendingPrefix.at < PENDING_PREFIX_MS) {
        const prefix = this.pendingPrefix.text;
        hypotheses = hypotheses.map((h) => `${prefix} ${h.trim()}`);
      }
      if (!fromPartial) this.pendingPrefix = null;
    }

    // Phrase ends on an operator -> wait for the rest instead of guessing.
    // If another recognizer hypothesis is complete ("10 divided by 2"), use it.
    const isDangling = (h: string) => DANGLING_END.test(normalizeTranscript(h));
    const complete = hypotheses.filter((h) => !isDangling(h));
    if (complete.length === 0) {
      if (!fromPartial) {
        const normalizedBest = normalizeTranscript(hypotheses[0]);
        this.pendingPrefix = { text: hypotheses[0], at: now };
        callbacks?.onNotice?.(null);
        callbacks?.onTranscriptUpdate?.(`${normalizedBest} …`, false);
      }
      return;
    }
    hypotheses = complete;

    // Pick the first hypothesis that contains math at all
    let chosen: string | null = null;
    let cleanKey = '';
    let chosenFilter: ReturnType<typeof mathStreamFilter.filter> | null = null;
    for (const hyp of hypotheses) {
      const f = mathStreamFilter.filter(hyp, this.context);
      if (!f.isPureNoise && f.cleanMathText) {
        chosen = hyp.trim();
        cleanKey = f.cleanMathText.trim().toLowerCase();
        chosenFilter = f;
        break;
      }
    }
    if (!chosen || !chosenFilter) {
      // 100% conversation ("hello", "arre suno") — ignore silently, keep listening
      return;
    }

    // Same calculation already handled moments ago (partial fallback + late final)
    if (
      cleanKey === this.lastProcessedTranscript &&
      Date.now() - this.lastEvaluatedAt < DUPLICATE_WINDOW_MS
    ) {
      return;
    }
    this.lastProcessedTranscript = cleanKey;
    this.lastEvaluatedAt = Date.now();
    // The pending "25 plus" (if any) has now been used
    this.pendingPrefix = null;

    if (fromPartial) {
      this.lastPartialEvaluated = { text: raw, at: now };
    }

    // Just a number ("5", "2 lakh") = the new current value, like pressing it on the
    // keypad. The next "plus 5" continues from it; nothing is spoken.
    const tokenText = chosenFilter.tokenMathText?.trim() || '';
    if (
      isJustANumber(chosen) &&
      !this.context.pendingClarification &&
      !chosenFilter.needsNaturalLanguageParser &&
      !chosenFilter.isChaining &&
      /^-?\d+(?:\.\d+)?$/.test(tokenText)
    ) {
      this.setRunningValue(Number(tokenText), chosen, callbacks);
      return;
    }

    const others = hypotheses.filter((h) => h.trim() !== chosen);
    await this.processCommand(chosen, callbacks, {
      isVoiceStream: true,
      originalSpoken: chosen,
      alternatives: others,
    });

    // A partial-based evaluation leaves the phrase in the recognizer buffer; flush it.
    if (fromPartial) {
      this.speech.restartSession();
    }
  }

  /**
   * Starts microphone listening in hands-free mode. Results are evaluated on the
   * recognizer's final hypotheses; the mic switches itself off after a period of
   * silence or when the user taps the mic button.
   */
  public async startVoiceSession(
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    await this.tts.stop();
    this.clearPartialEvalTimer();
    this.lastProcessedTranscript = '';
    this.lastEvaluatedAt = 0;
    this.pendingPrefix = null;
    this.lastPartialEvaluated = null;

    await this.speech.startListening({
      onStart: () => {
        callbacks?.onNotice?.(null);
        callbacks?.onVoiceStateChange?.('listening');
      },
      onPartialResult: (partial) => {
        callbacks?.onTranscriptUpdate?.(partial, false);
        if (partial.trim()) callbacks?.onNotice?.(null);
        this.clearPartialEvalTimer();

        // Fallback only: Android delivers a final result ~0.5-1.5 s after speech ends.
        // If none arrives (some iOS / OEM recognizers), evaluate the partial.
        this.partialEvalTimer = setTimeout(() => {
          this.partialEvalTimer = null;
          void this.evaluateSpokenSegment(partial, callbacks, [], true);
        }, PARTIAL_FALLBACK_MS);
      },
      onFinalResult: async (finalTranscript, alternatives) => {
        this.clearPartialEvalTimer();
        await this.evaluateSpokenSegment(finalTranscript, callbacks, alternatives || []);
      },
      onError: (code, friendlyMessage) => {
        // The speech service only reports errors it could not recover from.
        this.clearPartialEvalTimer();
        callbacks?.onNotice?.(friendlyMessage);
        const errorOutput: CalculationOutput = {
          success: false,
          formattedResult: this.context.lastFormattedResult || '—',
          displayExpression: 'Voice input',
          spokenResponse: friendlyMessage,
          errorCode: code,
          errorMessage: friendlyMessage,
        };
        callbacks?.onVoiceStateChange?.('idle');
        callbacks?.onResult?.(errorOutput);
      },
      onEnd: () => {
        this.clearPartialEvalTimer();
        callbacks?.onVoiceStateChange?.('idle');
      },
    });
  }

  public async stopVoiceSession(
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    this.clearPartialEvalTimer();
    this.lastProcessedTranscript = '';
    await this.speech.stopListening();
    callbacks?.onVoiceStateChange?.('idle');
  }

  private async speakOutput(
    text: string,
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    if (!text) {
      callbacks?.onVoiceStateChange?.('idle');
      return;
    }

    await new Promise<void>((resolve) => {
      void this.tts.speak(text, {
        onStart: () => {
          callbacks?.onVoiceStateChange?.('speaking');
        },
        onDone: () => {
          callbacks?.onVoiceStateChange?.('idle');
          resolve();
        },
        onError: () => {
          callbacks?.onVoiceStateChange?.('idle');
          resolve();
        },
      });
    });
  }
}

export const smartCalcOrchestrator = new SmartCalcOrchestrator();
