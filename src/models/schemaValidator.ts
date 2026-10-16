/**
 * Strict Schema Validator for AI Structured JSON Responses
 *
 * Ensures the frontend and calculation engine NEVER depend on unvalidated
 * free-form text or malformed JSON from an LLM.
 */

import {
  IntentType,
  MathOperationType,
  StructuredAIIntent,
} from './types';

const VALID_INTENTS: Set<IntentType> = new Set([
  'calculate',
  'percentage',
  'everyday',
  'conversion',
  'unit_conversion',
  'currency',
  'currency_conversion',
  'clarification',
  'context_reset',
  'unsupported',
]);

const VALID_OPERATIONS: Set<MathOperationType> = new Set([
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'expression',
  'percentage_of',
  'percentage_add',
  'percentage_subtract',
  'gst_inclusive',
  'gst_amount',
  'discount',
  'discount_amount',
  'tip',
  'tip_total',
  'split_bill',
  'item_total',
  'remaining_balance',
  'square_root',
  'cube_root',
  'power',
  'factorial',
  'logarithm',
  'natural_log',
  'exponential',
  'absolute',
  'trigonometry',
  'unit_conversion',
  'currency_conversion',
  'unknown',
]);

export interface ValidationResult {
  valid: boolean;
  data?: StructuredAIIntent;
  error?: string;
}

/**
 * Extracts a JSON object from raw LLM text (handling optional markdown code blocks)
 * and strictly validates all fields.
 *
 * CRITICAL SECURITY & DETERMINISM RULE (Section 3):
 * Any AI-generated result fields (`answer`, `result`, `final_answer`, `solution`, `output`)
 * are explicitly ignored and never included in the returned StructuredAIIntent.
 */
export function parseAndValidateAIResponse(raw: string | unknown): ValidationResult {
  let parsed: unknown;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { valid: false, error: 'Empty AI response.' };
    }

    // Strip markdown ```json ... ``` wrapper if present
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    let jsonCandidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

    // If there is surrounding prose, extract the first outermost JSON object
    if (!jsonCandidate.startsWith('{')) {
      const firstBrace = jsonCandidate.indexOf('{');
      const lastBrace = jsonCandidate.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonCandidate = jsonCandidate.slice(firstBrace, lastBrace + 1);
      }
    }

    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      return {
        valid: false,
        error: 'Malformed JSON returned by AI interpretation layer.',
      };
    }
  } else if (typeof raw === 'object' && raw !== null) {
    parsed = raw;
  } else {
    return { valid: false, error: 'AI response must be a JSON object.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { valid: false, error: 'AI response root must be a JSON object.' };
  }

  const obj = { ...(parsed as Record<string, unknown>) };

  // Section 3 Enforcement: NEVER trust or propagate AI-generated answer fields
  delete obj.answer;
  delete obj.result;
  delete obj.final_answer;
  delete obj.calculated_value;
  delete obj.solution;
  delete obj.output;

  // Validate intent
  if (typeof obj.intent !== 'string' || !VALID_INTENTS.has(obj.intent as IntentType)) {
    return {
      valid: false,
      error: `Invalid or missing "intent" field: ${String(obj.intent)}`,
    };
  }
  const intent = obj.intent as IntentType;

  // Validate requires_clarification
  const requiresClarification = Boolean(obj.requires_clarification);

  // Validate operation if provided
  let operation: MathOperationType | undefined;
  if (obj.operation !== undefined && obj.operation !== null) {
    if (
      typeof obj.operation === 'string' &&
      VALID_OPERATIONS.has(obj.operation as MathOperationType)
    ) {
      operation = obj.operation as MathOperationType;
    } else {
      operation = 'unknown';
    }
  }

  // Validate numeric values array if provided (also accept `operands` as alias per Section 3)
  const rawValues = obj.values !== undefined && obj.values !== null ? obj.values : obj.operands;
  let values: number[] | undefined;
  if (rawValues !== undefined && rawValues !== null) {
    if (!Array.isArray(rawValues)) {
      return { valid: false, error: '"values" field must be an array of finite numbers.' };
    }
    const cleanValues: number[] = [];
    for (const v of rawValues) {
      const num = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(num)) {
        return { valid: false, error: '"values" contains non-finite number.' };
      }
      cleanValues.push(num);
    }
    values = cleanValues;
  }

  // Validate single numeric value if provided
  let value: number | null | undefined = null;
  if (obj.value !== undefined && obj.value !== null) {
    const num = typeof obj.value === 'number' ? obj.value : Number(obj.value);
    if (!Number.isFinite(num)) {
      return { valid: false, error: '"value" must be a finite number.' };
    }
    value = num;
  }

  const expression =
    typeof obj.expression === 'string' ? obj.expression.trim() : null;
  const fromUnit =
    typeof obj.from_unit === 'string'
      ? obj.from_unit.trim()
      : typeof obj.sourceUnit === 'string'
      ? obj.sourceUnit.trim()
      : null;
  const toUnit =
    typeof obj.to_unit === 'string'
      ? obj.to_unit.trim()
      : typeof obj.targetUnit === 'string'
      ? obj.targetUnit.trim()
      : null;
  const fromCurrency =
    typeof obj.from_currency === 'string' ? obj.from_currency.trim().toUpperCase() : null;
  const toCurrency =
    typeof obj.to_currency === 'string' ? obj.to_currency.trim().toUpperCase() : null;
  const unit = typeof obj.unit === 'string' ? obj.unit.trim() : null;
  const clarificationQuestion =
    typeof obj.clarification_question === 'string'
      ? obj.clarification_question.trim()
      : null;
  const rawResponseText =
    typeof obj.response_text === 'string' ? obj.response_text.trim() : null;

  // Section 2 & 3: For calculation/conversion intents, ignore AI prose answers in `response_text`
  const isClarificationOrUnsupported =
    intent === 'clarification' ||
    intent === 'unsupported' ||
    intent === 'context_reset' ||
    requiresClarification;
  const responseText = isClarificationOrUnsupported ? rawResponseText : null;

  // Intent-specific semantic requirements
  if (intent === 'clarification' || requiresClarification) {
    if (!clarificationQuestion && !rawResponseText) {
      return {
        valid: false,
        error: 'Clarification intent requires a "clarification_question".',
      };
    }
  }

  if ((intent === 'conversion' || intent === 'unit_conversion') && !requiresClarification) {
    if (value === null || !fromUnit || !toUnit) {
      return {
        valid: false,
        error: 'Unit conversion intent requires "value", "from_unit", and "to_unit".',
      };
    }
  }

  if ((intent === 'currency' || intent === 'currency_conversion') && !requiresClarification) {
    if (value === null || !fromCurrency || !toCurrency) {
      return {
        valid: false,
        error:
          'Currency conversion intent requires "value", "from_currency", and "to_currency".',
      };
    }
  }

  let pendingOperation: StructuredAIIntent['pending_operation'] = null;
  if (
    obj.pending_operation &&
    typeof obj.pending_operation === 'object' &&
    !Array.isArray(obj.pending_operation)
  ) {
    const po = obj.pending_operation as Record<string, unknown>;
    if (
      typeof po.operation === 'string' &&
      VALID_OPERATIONS.has(po.operation as MathOperationType) &&
      typeof po.first_operand === 'number' &&
      Number.isFinite(po.first_operand)
    ) {
      pendingOperation = {
        operation: po.operation as MathOperationType,
        first_operand: po.first_operand,
      };
    }
  }

  const trigFunction =
    typeof obj.trig_function === 'string' &&
    ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'].includes(obj.trig_function)
      ? (obj.trig_function as StructuredAIIntent['trig_function'])
      : null;

  const angleUnit =
    typeof obj.angle_unit === 'string' && ['deg', 'rad'].includes(obj.angle_unit)
      ? (obj.angle_unit as 'deg' | 'rad')
      : null;

  const validated: StructuredAIIntent = {
    intent,
    operation,
    expression,
    values,
    value,
    from_unit: fromUnit,
    to_unit: toUnit,
    from_currency: fromCurrency,
    to_currency: toCurrency,
    unit,
    trig_function: trigFunction,
    angle_unit: angleUnit,
    uses_previous_result: Boolean(obj.uses_previous_result),
    requires_clarification: requiresClarification || intent === 'clarification',
    clarification_question:
      clarificationQuestion ?? (requiresClarification ? rawResponseText : null),
    pending_operation: pendingOperation,
    response_text: responseText,
  };

  return { valid: true, data: validated };
}
