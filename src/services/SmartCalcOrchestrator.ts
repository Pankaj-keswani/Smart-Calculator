/**
 * SmartCalc End-to-End Pipeline Orchestrator (SmartCalcOrchestrator)
 *
 * Implements the full production pipeline required by Section 31:
 * VOICE INPUT -> SPEECH TO TEXT -> AI INTENT PARSER -> STRUCTURED JSON
 * -> VALIDATION -> SAFE CALCULATION ENGINE -> RESULT -> TEXT TO SPEECH -> HISTORY
 */

import { aiService, AIService, AIServiceError } from '../ai/AIService';
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
  StructuredAIIntent,
  VoiceInteractionState,
} from '../models/types';
import { HistoryService, historyService } from './HistoryService';
import { SpeechService, speechService } from './SpeechService';
import {
  TextToSpeechService,
  textToSpeechService,
} from './TextToSpeechService';
import { settingsService } from './SettingsService';
import { formatSpokenResult, getLocalizedErrorMessage } from '../localization/i18n';
import { mathStreamFilter } from '../ai/MathStreamFilter';
import { updateWidgetDisplay } from '../utils/floatingOverlay';
import { playConfirmationChime } from '../utils/sound';

export interface OrchestratorStateCallbacks {
  onVoiceStateChange?: (state: VoiceInteractionState) => void;
  onTranscriptUpdate?: (transcript: string, isFinal: boolean) => void;
  onResult?: (output: CalculationOutput) => void;
  onContextUpdate?: (context: ConversationContext) => void;
}

export class SmartCalcOrchestrator {
  private context: ConversationContext = {
    lastResult: null,
    lastFormattedResult: null,
    lastExpression: null,
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [],
  };

  private ai: AIService;
  private calc: CalculationService;
  private conv: ConversionService;
  private curr: CurrencyService;
  private speech: SpeechService;
  private tts: TextToSpeechService;
  private history: HistoryService;
  private partialEvalTimer: ReturnType<typeof setTimeout> | null = null;
  private lastProcessedTranscript = '';

  constructor(deps?: {
    ai?: AIService;
    calc?: CalculationService;
    conv?: ConversionService;
    curr?: CurrencyService;
    speech?: SpeechService;
    tts?: TextToSpeechService;
    history?: HistoryService;
  }) {
    this.ai = deps?.ai || aiService;
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
    options?: { isVoiceStream?: boolean; originalSpoken?: string }
  ): Promise<CalculationOutput> {
    const trimmed = spokenOrTypedCommand.trim();
    const displayCommand = options?.originalSpoken?.trim() || trimmed;
    callbacks?.onTranscriptUpdate?.(displayCommand, true);
    callbacks?.onVoiceStateChange?.('processing');

    const userLang = settingsService.getSettings().language || 'en-US';
    const isHindiText = /[\u0900-\u097F]|\b(?:jodo|ghatao|guna|bhaag|kitna|hota|hai|aur|karo|uttar|pratishat|bata)\b/i.test(trimmed);
    const effectiveLang = (isHindiText && (userLang === 'en-US' || userLang === 'en-IN')) ? 'hi-IN' : userLang;

    try {
      const rawIntent = await this.ai.interpretCommand(
        trimmed,
        this.context,
        effectiveLang
      );

      // Section 8: Local Context Resolver — inject previousResult strictly from local application state
      const intent = this.resolveContextFromLocalState(rawIntent);

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
          playConfirmationChime();
          callbacks?.onVoiceStateChange?.('listening');
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
          playConfirmationChime();
          this.speech.restartSession();
          callbacks?.onVoiceStateChange?.('listening');
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

      // Section 3: NEVER allow AI response_text to override deterministic mathematical results.
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

      callbacks?.onResult?.(output);
      if (output.formattedResult) {
        updateWidgetDisplay(output.formattedResult);
      }
      if (options?.isVoiceStream) {
        // Continuous hands-free voice mode: play pleasant confirmation chime and reset recognizer buffer for next phrase
        playConfirmationChime();
        this.speech.restartSession();
        callbacks?.onVoiceStateChange?.('listening');
      } else {
        await this.speakOutput(output.spokenResponse, callbacks);
      }
      return output;
    } catch (err) {
      const errorCode =
        err instanceof AIServiceError ? err.code : 'INVALID_EXPRESSION';
      const friendlyMessage =
        err instanceof AIServiceError
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
        callbacks?.onVoiceStateChange?.('listening');
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
   * Evaluates a spoken math transcript if it contains valid mathematical tokens
   * and hasn't already been evaluated in the current speech segment.
   */
  private async evaluateSpokenSegment(
    rawTranscript: string,
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    const normalizedKey = rawTranscript.trim().toLowerCase();
    if (!normalizedKey || normalizedKey === this.lastProcessedTranscript) {
      return;
    }

    const filterResult = mathStreamFilter.filter(rawTranscript, this.context);

    // If speech is 100% conversational noise with zero math (e.g. "hello", "arre suno"),
    // ignore it silently, do not show error, and keep listening!
    if (filterResult.isPureNoise || !filterResult.cleanMathText) {
      return;
    }

    const clean = filterResult.cleanMathText.trim();

    // Avoid evaluating an incomplete trailing operator or preposition while user is still speaking
    if (
      /(?:[+\-*/^×÷]|plus|minus|times|into|divide|divided|by|upon|over|percent|percentage|of|ka|pe|par)\s*$/i.test(
        clean
      )
    ) {
      return;
    }

    // Check for open unmatched parenthesis
    const openParenCount = (clean.match(/\(/g) || []).length;
    const closeParenCount = (clean.match(/\)/g) || []).length;
    if (openParenCount > closeParenCount) {
      return;
    }

    this.lastProcessedTranscript = normalizedKey;

    await this.processCommand(filterResult.cleanMathText, callbacks, {
      isVoiceStream: true,
      originalSpoken: rawTranscript,
    });
  }

  /**
   * Starts microphone listening in continuous hands-free mode.
   * Never auto-kills the microphone on a timer; stays ON continuously
   * until the user manually taps the Mic ON/OFF button.
   */
  public async startVoiceSession(
    callbacks?: OrchestratorStateCallbacks
  ): Promise<void> {
    await this.tts.stop();
    this.clearPartialEvalTimer();
    this.lastProcessedTranscript = '';

    await this.speech.startListening({
      onStart: () => {
        callbacks?.onVoiceStateChange?.('listening');
      },
      onPartialResult: (partial) => {
        callbacks?.onTranscriptUpdate?.(partial, false);
        this.clearPartialEvalTimer();

        // Allow natural human speech pauses (1800ms) before evaluating partial transcript stream
        this.partialEvalTimer = setTimeout(() => {
          void this.evaluateSpokenSegment(partial, callbacks);
        }, 1800);
      },
      onFinalResult: async (finalTranscript) => {
        this.clearPartialEvalTimer();
        await this.evaluateSpokenSegment(finalTranscript, callbacks);
        // Reset after final segment so user can repeat the same phrase later if desired
        this.lastProcessedTranscript = '';
      },
      onError: (code, friendlyMessage) => {
        // In continuous mode, never disrupt UI unless mic permission was explicitly denied
        if (code !== 'MIC_PERMISSION_DENIED' && this.speech.isListening()) {
          return;
        }
        this.clearPartialEvalTimer();
        const errorOutput: CalculationOutput = {
          success: false,
          formattedResult: '—',
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
