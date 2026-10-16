/**
 * Core Domain Models & Types for SmartCalc AI
 */

import { AIProviderType } from '../config/env';

export type IntentType =
  | 'calculate'
  | 'percentage'
  | 'everyday'
  | 'conversion'
  | 'unit_conversion'
  | 'currency'
  | 'currency_conversion'
  | 'clarification'
  | 'context_reset'
  | 'voice_control'
  | 'unsupported';

export type VoiceControlAction =
  | 'clear'
  | 'undo'
  | 'copy'
  | 'repeat'
  | 'memory_save'
  | 'memory_recall'
  | 'memory_clear';

export type MathOperationType =
  | 'addition'
  | 'subtraction'
  | 'multiplication'
  | 'division'
  | 'expression'
  | 'percentage_of'
  | 'percentage_add'
  | 'percentage_subtract'
  | 'gst_inclusive'
  | 'gst_amount'
  | 'discount'
  | 'discount_amount'
  | 'tip'
  | 'tip_total'
  | 'split_bill'
  | 'item_total'
  | 'remaining_balance'
  | 'square_root'
  | 'cube_root'
  | 'power'
  | 'factorial'
  | 'logarithm'
  | 'natural_log'
  | 'exponential'
  | 'absolute'
  | 'trigonometry'
  | 'unit_conversion'
  | 'currency_conversion'
  | 'unknown';

/**
 * Structured JSON schema returned by the AI Intent Parser.
 * Never trusted to perform arbitrary code execution or provide the final answer;
 * always validated and passed to the deterministic local JEV Calculation / Conversion / Currency engines.
 */
export interface StructuredAIIntent {
  intent: IntentType;
  operation?: MathOperationType;
  expression?: string | null;
  values?: number[];
  value?: number | null;
  from_unit?: string | null;
  to_unit?: string | null;
  from_currency?: string | null;
  to_currency?: string | null;
  unit?: string | null;
  trig_function?: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | null;
  angle_unit?: 'deg' | 'rad' | null;
  uses_previous_result?: boolean;
  requires_clarification: boolean;
  clarification_question?: string | null;
  pending_operation?: {
    operation: MathOperationType;
    first_operand: number;
  } | null;
  voice_action?: VoiceControlAction | null;
  memory_key?: string | null;
  response_text?: string | null;
}

export type VoiceInteractionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking';

export type AppMode = 'voice' | 'calculator';

export type SupportedLanguage =
  | 'en-US'
  | 'en-IN'
  | 'hi-IN'
  | 'es-ES'
  | 'fr-FR'
  | 'de-DE';

export type ErrorCode =
  | 'DIVISION_BY_ZERO'
  | 'INVALID_EXPRESSION'
  | 'INVALID_NUMBER'
  | 'OVERFLOW'
  | 'UNDERFLOW'
  | 'NEGATIVE_ROOT'
  | 'INVALID_FACTORIAL'
  | 'INVALID_LOGARITHM'
  | 'UNSUPPORTED_OPERATION'
  | 'UNSUPPORTED_JEV_FUNCTION'
  | 'JEV_ERROR'
  | 'PRECISION_ERROR'
  | 'VALIDATION_MISMATCH'
  | 'UNSUPPORTED_UNIT'
  | 'INCOMPATIBLE_UNITS'
  | 'CURRENCY_UNAVAILABLE'
  | 'MIC_PERMISSION_DENIED'
  | 'SPEECH_RECOGNITION_FAILED'
  | 'NO_INTERNET'
  | 'API_FAILURE'
  | 'API_TIMEOUT'
  | 'RATE_LIMIT'
  | 'MALFORMED_AI_RESPONSE';

export interface PipelineDebugTrace {
  voiceInput: string;
  aiNormalizedIntent: string;
  normalizedExpression: string;
  jevResult: string;
  validationStatus: 'PASS' | 'FAIL' | 'SKIPPED';
  finalResult: string;
  timestamp: number;
  formattedLog: string;
}

export interface CalculationOutput {
  success: boolean;
  resultNumber?: number;
  formattedResult: string;
  displayExpression: string;
  normalizedExpression?: string;
  spokenResponse: string;
  unit?: string | null;
  breakdown?: string | null;
  requiresClarification?: boolean;
  clarificationQuestion?: string;
  errorCode?: ErrorCode;
  errorMessage?: string;
  intent?: StructuredAIIntent;
  validationPassed?: boolean;
  debugTrace?: PipelineDebugTrace;
}

export interface ConversationContext {
  lastResult: number | null;
  lastFormattedResult: string | null;
  lastExpression: string | null;
  lastUnit: string | null;
  pendingClarification: {
    question: string;
    partialCommand: string;
    operation?: MathOperationType;
    firstOperand?: number;
    fromUnit?: string;
  } | null;
  recentTurns: Array<{
    userText: string;
    expression: string;
    result: number;
    timestamp: number;
  }>;
  memoryVariables?: Record<string, number>;
}

export interface CalculationHistoryItem {
  id: string;
  originalCommand: string;
  interpretedExpression: string;
  result: string;
  numericResult?: number;
  unit?: string | null;
  mode: AppMode;
  timestamp: number;
}

export type AccentColorTheme = 'gold' | 'emerald' | 'cyan' | 'orange' | 'rose';
export type SoundEffectTheme = 'modern' | 'mechanical' | 'bubble' | 'silent';

export interface AppSettings {
  aiProvider: AIProviderType;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  useCloudAIWhenAvailable: boolean;
  ttsEnabled: boolean;
  ttsRate: number;
  ttsPitch: number;
  ttsVoiceIdentifier?: string;
  language: SupportedLanguage;
  themeMode: 'system' | 'light' | 'dark';
  accentTheme: AccentColorTheme;
  soundTheme: SoundEffectTheme;
  hapticsEnabled: boolean;
  currencyApiUrl: string;
  currencyApiKey: string;
  debugModeEnabled?: boolean;
}
