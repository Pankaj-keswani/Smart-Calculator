/**
 * Local JEV-Based Deterministic Calculation Engine (JevCalculationEngine)
 *
 * ARCHITECTURE & GUARANTEES:
 * 1. Runs 100% locally on Android, iOS, and Web with zero remote dependencies.
 * 2. Never uses `eval()`, `Function()`, or dynamic code execution.
 * 3. Strictly enforces a whitelist of mathematical operators and supported JEV functions.
 * 4. Normalizes percentages, discounts, and GST into explicit mathematical expressions:
 *    - 15% of 800           -> 15 / 100 * 800
 *    - 20% discount on 1500 -> 1500 - (20 / 100 * 1500)
 *    - 18% GST on 1000      -> 1000 + (18 / 100 * 1000)
 * 5. Uses decimal-safe scaled integer arithmetic for financial/decimal operations
 *    so `0.1 + 0.2` evaluates to `0.3` (never `0.30000000000000004`) without blindly
 *    rounding calculations to 2 decimal places.
 * 6. Includes an Independent Deterministic Validator (Recursive-Descent AST evaluator)
 *    that cross-verifies JEV's Shunting-Yard RPN result before returning any answer.
 */

import {
  CalculationOutput,
  ErrorCode,
  StructuredAIIntent,
} from '../models/types';
import { debugLogger } from '../services/DebugLogger';
import { mergeCompoundSpokenNumbers } from '../utils/compoundNumberParser';

const MAX_SAFE_MAGNITUDE = 1e150;
const MIN_NON_ZERO_MAGNITUDE = 1e-300;
const MAX_FACTORIAL_INPUT = 170;
const VALIDATION_TOLERANCE = 1e-9;

export type TokenType =
  | 'NUMBER'
  | 'OPERATOR'
  | 'FUNCTION'
  | 'LPAREN'
  | 'RPAREN'
  | 'POSTFIX';

export interface JevToken {
  type: TokenType;
  value: string;
  numericValue?: number;
}

export const JEV_SUPPORTED_OPERATORS = new Set([
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '(',
  ')',
  '!',
]);

export const JEV_SUPPORTED_FUNCTIONS = new Set([
  'sqrt',
  'cbrt',
  'abs',
  'sin',
  'cos',
  'tan',
  'sind',
  'cosd',
  'tand',
  'asin',
  'acos',
  'atan',
  'log',
  'log10',
  'log2',
  'ln',
  'exp',
  'factorial',
  'fact',
  'floor',
  'ceil',
  'round',
]);

/** Patterns that indicate executable code or injection attempts */
const FORBIDDEN_CODE_PATTERNS: RegExp[] = [
  /\beval\b/i,
  /\bFunction\b/,
  /\b(?:window|global|globalThis|process|require|import|export|return|var|let|const|class|new|delete|typeof|void)\b/,
  /=>/,
  /[;{}[\]`$'"\\]/,
  /==|!=|<=|>=|<|>/,
];

export interface IndependentValidationReport {
  valid: boolean;
  jevResult: number;
  independentResult: number;
  discrepancy: number;
}

export type CustomIndependentValidatorFn = (
  expression: string,
  angleUnit: 'deg' | 'rad'
) => number;

export class CalcDomainError extends Error {
  public readonly code: ErrorCode;
  public readonly friendlyMessage: string;

  constructor(code: ErrorCode, friendlyMessage: string) {
    super(friendlyMessage);
    this.name = 'CalcDomainError';
    this.code = code;
    this.friendlyMessage = friendlyMessage;
  }
}

export class JevCalculationEngine {
  private customIndependentValidator: CustomIndependentValidatorFn | null = null;
  private validationEnabled = true;

  /**
   * Allows enabling/disabling or overriding the independent validator in tests.
   */
  public setValidationEnabled(enabled: boolean): void {
    this.validationEnabled = enabled;
  }

  public setCustomIndependentValidator(
    fn: CustomIndependentValidatorFn | null
  ): void {
    this.customIndependentValidator = fn;
  }

  /**
   * Returns the list of whitelisted operators and functions supported by JEV.
   */
  public getCapabilities() {
    return {
      operators: Array.from(JEV_SUPPORTED_OPERATORS),
      functions: Array.from(JEV_SUPPORTED_FUNCTIONS),
      runsLocallyOnMobile: true,
    };
  }

  /**
   * Decimal-safe binary arithmetic helper for exact financial/decimal math (e.g. 0.1 + 0.2 = 0.3).
   * Scales finite decimals with <= 8 fractional digits to exact integers before computing.
   */
  public decimalSafeArithmetic(
    a: number,
    b: number,
    op: '+' | '-' | '*' | '/'
  ): number {
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new CalcDomainError(
        'INVALID_NUMBER',
        "I couldn't compute a valid number for that calculation."
      );
    }

    if (op === '/' && b === 0) {
      throw new CalcDomainError(
        'DIVISION_BY_ZERO',
        "I can't divide a number by zero."
      );
    }

    const getDecimals = (n: number): number => {
      const s = String(n);
      if (s.includes('e') || s.includes('E')) return -1;
      const dotIdx = s.indexOf('.');
      return dotIdx === -1 ? 0 : s.length - dotIdx - 1;
    };

    const decA = getDecimals(a);
    const decB = getDecimals(b);

    if (decA >= 0 && decB >= 0 && decA <= 8 && decB <= 8) {
      const scaleExp = Math.max(decA, decB);
      const factor = Math.pow(10, scaleExp);
      const scaledA = Math.round(a * factor);
      const scaledB = Math.round(b * factor);

      if (
        Math.abs(scaledA) < Number.MAX_SAFE_INTEGER / 100 &&
        Math.abs(scaledB) < Number.MAX_SAFE_INTEGER / 100
      ) {
        if (op === '+') {
          return (scaledA + scaledB) / factor;
        }
        if (op === '-') {
          return (scaledA - scaledB) / factor;
        }
        if (op === '*' && scaleExp <= 6) {
          const factorA = Math.pow(10, decA);
          const factorB = Math.pow(10, decB);
          const intA = Math.round(a * factorA);
          const intB = Math.round(b * factorB);
          const prod = intA * intB;
          if (Math.abs(prod) < Number.MAX_SAFE_INTEGER) {
            return prod / (factorA * factorB);
          }
        }
        if (op === '/' && scaledB !== 0) {
          return scaledA / scaledB;
        }
      }
    }

    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return a / b;
    }
  }

  /**
   * Normalizes floating-point precision artifacts (e.g. 0.1 + 0.2 -> 0.3)
   * and validates that the value is finite and within safe bounds.
   */
  public sanitizeNumber(val: number): number {
    if (typeof val !== 'number' || Number.isNaN(val)) {
      throw new CalcDomainError(
        'INVALID_NUMBER',
        "I couldn't compute a valid number for that calculation."
      );
    }
    if (!Number.isFinite(val) || Math.abs(val) > MAX_SAFE_MAGNITUDE) {
      throw new CalcDomainError(
        'OVERFLOW',
        'That number is too large to calculate accurately.'
      );
    }
    if (val !== 0 && Math.abs(val) < MIN_NON_ZERO_MAGNITUDE) {
      throw new CalcDomainError(
        'UNDERFLOW',
        'That number is too small to represent accurately.'
      );
    }
    if (Math.abs(val) < 1e-12 && val !== 0) {
      // Only snap near-zero trigonometric residuals when extremely close to 0 (e.g. 6.12e-17)
      if (Math.abs(val) < 1e-14) {
        return 0;
      }
    }
    // Round to 12 significant digits to eliminate IEEE-754 noise like 0.30000000000000004
    const rounded = Number(val.toPrecision(12));
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  /**
   * Formats a number for clean visual display.
   * Never outputs NaN, Infinity, undefined, or null.
   * Preserves precision without blindly rounding to 2 decimal places.
   */
  public formatResult(val: number): string {
    const clean = this.sanitizeNumber(val);
    // Whole numbers up to 15 digits are shown in full (e.g. 121932631113000000 is
    // too big, but 999999999999999 is fine); beyond that use 10 significant digits.
    if (
      Math.abs(clean) >= 1e15 ||
      (Math.abs(clean) > 0 && Math.abs(clean) < 1e-9)
    ) {
      return clean
        .toExponential(9)
        .replace(/\.?0+e/, 'e')
        .replace('e+', 'e');
    }
    const fixed = Number(clean.toFixed(10));
    // Avoid JS's own exponent form for small decimals like 1e-7
    if (Math.abs(fixed) > 0 && Math.abs(fixed) < 1e-6) {
      return fixed.toFixed(10).replace(/0+$/, '');
    }
    return String(fixed);
  }

  /**
   * Alias for formatResult for backward compatibility with CalculationService.
   */
  public formatNumber(val: number): string {
    return this.formatResult(val);
  }

  /**
   * Computes exact integer factorial with domain validation.
   */
  public factorial(n: number): number {
    if (!Number.isInteger(n) || n < 0) {
      throw new CalcDomainError(
        'INVALID_FACTORIAL',
        'Factorial is only defined for whole numbers zero or greater.'
      );
    }
    if (n > MAX_FACTORIAL_INPUT) {
      throw new CalcDomainError(
        'OVERFLOW',
        'That number is too large for a factorial calculation.'
      );
    }
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return this.sanitizeNumber(result);
  }

  /**
   * Explicitly normalizes percentage calculations into standard deterministic expressions
   * and evaluates them through JEV (Section 7).
   */
  public calculatePercentage(
    percent: number,
    base: number,
    mode: 'of' | 'add' | 'subtract' | 'discount' | 'gst' = 'of'
  ): { normalizedExpression: string; result: number } {
    const p = this.sanitizeNumber(percent);
    const b = this.sanitizeNumber(base);

    let normalizedExpression: string;
    switch (mode) {
      case 'discount':
      case 'subtract':
        normalizedExpression = `${b} - (${p} / 100 * ${b})`;
        break;
      case 'gst':
      case 'add':
        normalizedExpression = `${b} + (${p} / 100 * ${b})`;
        break;
      case 'of':
      default:
        normalizedExpression = `${p} / 100 * ${b}`;
        break;
    }

    const result = this.evaluateExpression(normalizedExpression);
    return { normalizedExpression, result };
  }

  /**
   * Calculates base^exponent deterministically via JEV.
   */
  public calculatePower(base: number, exponent: number): number {
    const b = this.sanitizeNumber(base);
    const e = this.sanitizeNumber(exponent);
    return this.evaluateExpression(`(${b}) ^ (${e})`);
  }

  /**
   * Calculates square root or cube root deterministically via JEV.
   */
  public calculateRoot(value: number, degree: 2 | 3 = 2): number {
    const v = this.sanitizeNumber(value);
    if (degree === 2) {
      if (v < 0) {
        throw new CalcDomainError(
          'NEGATIVE_ROOT',
          "I can't calculate the real square root of a negative number."
        );
      }
      return this.evaluateExpression(`sqrt(${v})`);
    }
    return this.evaluateExpression(`cbrt(${v})`);
  }

  /**
   * Calculates a whitelisted scientific function deterministically via JEV.
   */
  public calculateScientificFunction(
    fn: string,
    value: number,
    angleUnit: 'deg' | 'rad' = 'deg'
  ): number {
    const lowerFn = fn.trim().toLowerCase();
    if (!JEV_SUPPORTED_FUNCTIONS.has(lowerFn)) {
      throw new CalcDomainError(
        'UNSUPPORTED_JEV_FUNCTION',
        `Unsupported function "${fn}".`
      );
    }
    const v = this.sanitizeNumber(value);
    return this.evaluateExpression(`${lowerFn}(${v})`, angleUnit);
  }

  /**
   * Validates that an expression string contains ONLY allowed mathematical tokens
   * and zero executable code constructs (Section 4 & Section 5).
   */
  public validateExpression(rawExpression: string): {
     normalized: string;
    tokens: JevToken[];
  } {
    if (!rawExpression || typeof rawExpression !== 'string') {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        "I couldn't understand that mathematical expression."
      );
    }

    for (const pattern of FORBIDDEN_CODE_PATTERNS) {
      if (pattern.test(rawExpression)) {
        throw new CalcDomainError(
          'INVALID_EXPRESSION',
          'Expression contains unsupported or unsafe characters.'
        );
      }
    }

    const normalized = this.normalizeSymbols(rawExpression);
    if (!normalized) {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        "I couldn't understand that mathematical expression."
      );
    }

    const tokens = this.tokenize(normalized);
    if (tokens.length === 0) {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        "I couldn't understand that mathematical expression."
      );
    }

    return { normalized, tokens };
  }

  /**
   * Evaluates a mathematical expression string deterministically using JEV's
   * lexical tokenizer, Shunting-Yard parser, and RPN evaluator (zero eval).
   */
  public evaluateExpression(
    rawExpression: string,
    defaultAngleUnit: 'deg' | 'rad' = 'deg'
  ): number {
    const { tokens } = this.validateExpression(rawExpression);
    const rpn = this.shuntingYard(tokens);
    const result = this.evaluateRPN(rpn, defaultAngleUnit);
    return this.sanitizeNumber(result);
  }

  /**
   * Independent Deterministic Validator (Section 9).
   * Re-evaluates the normalized expression using an independent Recursive-Descent AST
   * parser & evaluator to cross-verify JEV's Shunting-Yard RPN result.
   */
  public validateResult(
    normalizedExpression: string,
    jevResult: number,
    angleUnit: 'deg' | 'rad' = 'deg'
  ): IndependentValidationReport {
    if (!this.validationEnabled) {
      return {
        valid: true,
        jevResult,
        independentResult: jevResult,
        discrepancy: 0,
      };
    }

    try {
      const independentRaw = this.customIndependentValidator
        ? this.customIndependentValidator(normalizedExpression, angleUnit)
        : this.evaluateWithRecursiveDescentAST(normalizedExpression, angleUnit);
      const independentResult = this.sanitizeNumber(independentRaw);

      const scale = Math.max(
        1,
        Math.abs(jevResult),
        Math.abs(independentResult)
      );
      const discrepancy = Math.abs(jevResult - independentResult);
      const valid = discrepancy <= VALIDATION_TOLERANCE * scale;

      if (!valid) {
        debugLogger.logDiscrepancy(
          normalizedExpression,
          jevResult,
          independentResult
        );
      }

      return {
        valid,
        jevResult,
        independentResult,
        discrepancy,
      };
    } catch {
      debugLogger.logDiscrepancy(normalizedExpression, jevResult, NaN);
      return {
        valid: false,
        jevResult,
        independentResult: NaN,
        discrepancy: Infinity,
      };
    }
  }

  /**
   * Converts a StructuredAIIntent into a normalized expression string for JEV.
   * Ensures percentages, discounts, and GST use explicit formulas (Section 7).
   */
  public normalizeIntentToExpression(intent: StructuredAIIntent): string {
    const op = intent.operation || 'expression';
    const vals = intent.values || [];
    const singleVal = vals[0] ?? intent.value;

    switch (op) {
      case 'addition':
        if (vals.length >= 2) {
          return vals.join(' + ');
        }
        break;
      case 'subtraction':
      case 'remaining_balance':
        if (vals.length >= 2) {
          return vals.join(' - ');
        }
        break;
      case 'multiplication':
      case 'item_total':
        if (vals.length >= 2) {
          return vals.join(' * ');
        }
        break;
      case 'division':
      case 'split_bill':
        if (vals.length >= 2) {
          return `${vals[0]} / ${vals[1]}`;
        }
        break;
      case 'percentage_of':
      case 'gst_amount':
      case 'tip':
      case 'discount_amount':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          return `${percent} / 100 * ${base}`;
        }
        break;
      case 'discount':
      case 'percentage_subtract':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          return `${base} - (${percent} / 100 * ${base})`;
        }
        break;
      case 'gst_inclusive':
      case 'percentage_add':
      case 'tip_total':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          return `${base} + (${percent} / 100 * ${base})`;
        }
        break;
      case 'square_root':
        if (typeof singleVal === 'number') {
          return `sqrt(${singleVal})`;
        }
        break;
      case 'cube_root':
        if (typeof singleVal === 'number') {
          return `cbrt(${singleVal})`;
        }
        break;
      case 'power':
        if (vals.length >= 2) {
          return `(${vals[0]}) ^ (${vals[1]})`;
        }
        break;
      case 'factorial':
        if (typeof singleVal === 'number') {
          return `factorial(${singleVal})`;
        }
        break;
      case 'logarithm':
        if (typeof singleVal === 'number') {
          const base = vals.length >= 2 ? vals[1] : 10;
          if (base <= 0 || base === 1) {
            throw new CalcDomainError(
              'INVALID_LOGARITHM',
              'Logarithm base must be positive and not equal to 1.'
            );
          }
          return base === 10
            ? `log(${singleVal})`
            : `ln(${singleVal}) / ln(${base})`;
        }
        break;
      case 'natural_log':
        if (typeof singleVal === 'number') {
          return `ln(${singleVal})`;
        }
        break;
      case 'exponential':
        if (typeof singleVal === 'number') {
          return `exp(${singleVal})`;
        }
        break;
      case 'absolute':
        if (typeof singleVal === 'number') {
          return `abs(${singleVal})`;
        }
        break;
      case 'trigonometry':
        if (typeof singleVal === 'number') {
          const fn = intent.trig_function || 'sin';
          return `${fn}(${singleVal})`;
        }
        break;
      default:
        break;
    }

    if (intent.expression) {
      return this.normalizeSymbols(intent.expression);
    }

    throw new CalcDomainError(
      'INVALID_EXPRESSION',
      "I couldn't understand that calculation."
    );
  }

  /**
   * Executes a validated StructuredAIIntent through the full JEV pipeline:
   * Intent Normalization -> Token Validation -> JEV Evaluation -> Independent Validation -> Result Formatting -> Debug Trace.
   */
  public executeIntent(
    intent: StructuredAIIntent,
    voiceInput: string = ''
  ): CalculationOutput {
    try {
      if (intent.requires_clarification || intent.intent === 'clarification') {
        const question =
          intent.clarification_question ||
          'Could you please clarify what you would like me to calculate?';
        return {
          success: false,
          formattedResult: '?',
          displayExpression: intent.expression || 'Clarification needed',
          spokenResponse: question,
          requiresClarification: true,
          clarificationQuestion: question,
          intent,
        };
      }

      if (intent.intent === 'unsupported') {
        const msg =
          intent.response_text ||
          "I'm sorry, that operation isn't supported yet.";
        return {
          success: false,
          formattedResult: '—',
          displayExpression: 'Unsupported operation',
          spokenResponse: msg,
          errorCode: 'UNSUPPORTED_OPERATION',
          errorMessage: msg,
          intent,
        };
      }

      const op = intent.operation || 'expression';
      const vals = intent.values || [];
      const angleUnit = intent.angle_unit || 'deg';

      // Domain pre-checks for specific operations
      if (
        (op === 'division' || op === 'split_bill') &&
        vals.length >= 2 &&
        vals[1] === 0
      ) {
        throw new CalcDomainError(
          'DIVISION_BY_ZERO',
          "I can't divide a number by zero."
        );
      }
      if (op === 'square_root') {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number' && target < 0) {
          throw new CalcDomainError(
            'NEGATIVE_ROOT',
            "I can't calculate the real square root of a negative number."
          );
        }
      }

      // 1. Normalize structured intent into canonical mathematical expression
      const normalizedExpression = this.normalizeIntentToExpression(intent);

      // 2. Evaluate deterministically via JEV
      const jevResult = this.evaluateExpression(
        normalizedExpression,
        angleUnit
      );

      // 3. Run Independent Deterministic Validator (Section 9)
      const validationReport = this.validateResult(
        normalizedExpression,
        jevResult,
        angleUnit
      );

      if (!validationReport.valid) {
        const mismatchMsg =
          'Something went wrong while calculating that. Please try again.';
        const failTrace = debugLogger.recordTrace({
          voiceInput: voiceInput || intent.expression || normalizedExpression,
          aiNormalizedIntent: op,
          normalizedExpression,
          jevResult: String(jevResult),
          validationStatus: 'FAIL',
          finalResult: 'Error (Validation Mismatch)',
        });
        return {
          success: false,
          formattedResult: 'Error',
          displayExpression: this.prettifyExpression(normalizedExpression),
          normalizedExpression,
          spokenResponse: mismatchMsg,
          errorCode: 'VALIDATION_MISMATCH',
          errorMessage: mismatchMsg,
          validationPassed: false,
          debugTrace: failTrace,
          intent,
        };
      }

      const formatted = this.formatResult(jevResult);
      const displayMeta = this.buildDisplayAndSpokenMetadata(
        op,
        vals,
        intent,
        normalizedExpression,
        jevResult,
        formatted
      );

      const passTrace = debugLogger.recordTrace({
        voiceInput:
          voiceInput ||
          intent.expression ||
          displayMeta.displayExpression ||
          normalizedExpression,
        aiNormalizedIntent: op,
        normalizedExpression,
        jevResult: formatted,
        validationStatus: 'PASS',
        finalResult: formatted,
      });

      return {
        success: true,
        resultNumber: jevResult,
        formattedResult: formatted,
        displayExpression: displayMeta.displayExpression,
        normalizedExpression,
        spokenResponse: displayMeta.spokenResponse,
        breakdown: displayMeta.breakdown,
        validationPassed: true,
        debugTrace: passTrace,
        intent,
      };
    } catch (err) {
      if (err instanceof CalcDomainError) {
        return {
          success: false,
          formattedResult: 'Error',
          displayExpression: intent.expression || 'Invalid calculation',
          spokenResponse: err.friendlyMessage,
          errorCode: err.code,
          errorMessage: err.friendlyMessage,
          intent,
        };
      }
      return {
        success: false,
        formattedResult: 'Error',
        displayExpression: intent.expression || 'Calculation error',
        spokenResponse: "I couldn't understand that calculation.",
        errorCode: 'INVALID_EXPRESSION',
        errorMessage: "I couldn't understand that calculation.",
        intent,
      };
    }
  }

  private buildDisplayAndSpokenMetadata(
    op: string,
    vals: number[],
    intent: StructuredAIIntent,
    normalizedExpression: string,
    resultNumber: number,
    formatted: string
  ): {
    displayExpression: string;
    spokenResponse: string;
    breakdown?: string;
  } {
    switch (op) {
      case 'addition':
        if (vals.length >= 2) {
          return {
            displayExpression: vals.map((v) => this.formatResult(v)).join(' + '),
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      case 'subtraction':
      case 'remaining_balance':
        if (vals.length >= 2) {
          return {
            displayExpression: vals.map((v) => this.formatResult(v)).join(' - '),
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      case 'multiplication':
      case 'item_total':
        if (vals.length >= 2) {
          return {
            displayExpression: vals.map((v) => this.formatResult(v)).join(' × '),
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      case 'division':
      case 'split_bill':
        if (vals.length >= 2) {
          const nStr = this.formatResult(vals[0]);
          const dStr = this.formatResult(vals[1]);
          return {
            displayExpression: `${nStr} ÷ ${dStr}`,
            spokenResponse:
              op === 'split_bill'
                ? `Splitting ${nStr} between ${dStr} comes to ${formatted} each.`
                : `The answer is ${formatted}.`,
          };
        }
        break;
      case 'percentage_of':
        if (vals.length >= 2) {
          const pStr = this.formatResult(vals[0]);
          const bStr = this.formatResult(vals[1]);
          return {
            displayExpression: `${pStr}% of ${bStr}`,
            spokenResponse: `${pStr} percent of ${bStr} is ${formatted}.`,
          };
        }
        break;
      case 'percentage_add':
      case 'gst_inclusive':
      case 'tip_total':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          const delta = this.evaluateExpression(`${percent} / 100 * ${base}`);
          const deltaStr = this.formatResult(delta);
          const pStr = this.formatResult(percent);
          const bStr = this.formatResult(base);
          const label =
            op === 'gst_inclusive' ? 'GST' : op === 'tip_total' ? 'Tip' : '';
          return {
            displayExpression: label
              ? `${bStr} + ${pStr}% ${label}`
              : `${bStr} + ${pStr}%`,
            spokenResponse:
              op === 'gst_inclusive'
                ? `With ${pStr} percent GST on ${bStr}, the total is ${formatted} (GST amount is ${deltaStr}).`
                : `The answer is ${formatted}.`,
            breakdown: label
              ? `Base: ${bStr} | ${label} (${pStr}%): +${deltaStr} | Total: ${formatted}`
              : `${bStr} + ${deltaStr} = ${formatted}`,
          };
        }
        break;
      case 'gst_amount':
      case 'tip':
      case 'discount_amount':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          const pStr = this.formatResult(percent);
          const bStr = this.formatResult(base);
          const label =
            op === 'gst_amount'
              ? 'GST'
              : op === 'tip'
              ? 'tip'
              : 'discount';
          const totalAfter =
            op === 'discount_amount'
              ? this.formatResult(this.sanitizeNumber(base - resultNumber))
              : this.formatResult(this.sanitizeNumber(base + resultNumber));
          return {
            displayExpression: `${pStr}% ${label} on ${bStr}`,
            spokenResponse: `A ${pStr} percent ${label} on ${bStr} is ${formatted}.`,
            breakdown: `${label.toUpperCase()}: ${formatted} | Total with ${label}: ${totalAfter}`,
          };
        }
        break;
      case 'discount':
      case 'percentage_subtract':
        if (vals.length >= 2) {
          const [percent, base] = vals;
          const savings = this.evaluateExpression(`${percent} / 100 * ${base}`);
          const savingsStr = this.formatResult(savings);
          const pStr = this.formatResult(percent);
          const bStr = this.formatResult(base);
          return {
            displayExpression: `${bStr} - ${pStr}% discount`,
            spokenResponse: `After a ${pStr} percent discount on ${bStr}, the final price is ${formatted}.`,
            breakdown: `Original: ${bStr} | Discount (${pStr}%): -${savingsStr} | Final: ${formatted}`,
          };
        }
        break;
      case 'square_root': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `√(${tStr})`,
            spokenResponse: `The square root of ${tStr} is ${formatted}.`,
          };
        }
        break;
      }
      case 'cube_root': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `∛(${tStr})`,
            spokenResponse: `The cube root of ${tStr} is ${formatted}.`,
          };
        }
        break;
      }
      case 'power':
        if (vals.length >= 2) {
          return {
            displayExpression: `${this.formatResult(vals[0])}^${this.formatResult(vals[1])}`,
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      case 'factorial': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `${tStr}!`,
            spokenResponse: `${tStr} factorial is ${formatted}.`,
          };
        }
        break;
      }
      case 'logarithm': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const base = vals.length >= 2 ? vals[1] : 10;
          const tStr = this.formatResult(target);
          return {
            displayExpression:
              base === 10 ? `log(${tStr})` : `log_${base}(${tStr})`,
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      }
      case 'natural_log': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `ln(${tStr})`,
            spokenResponse: `The natural log of ${tStr} is ${formatted}.`,
          };
        }
        break;
      }
      case 'exponential': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `exp(${tStr})`,
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      }
      case 'absolute': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const tStr = this.formatResult(target);
          return {
            displayExpression: `|${tStr}|`,
            spokenResponse: `The absolute value of ${tStr} is ${formatted}.`,
          };
        }
        break;
      }
      case 'trigonometry': {
        const target = vals[0] ?? intent.value;
        if (typeof target === 'number') {
          const fn = intent.trig_function || 'sin';
          const angleUnit = intent.angle_unit || 'deg';
          const tStr = this.formatResult(target);
          const unitSymbol = angleUnit === 'deg' ? '°' : ' rad';
          return {
            displayExpression: `${fn}(${tStr}${unitSymbol})`,
            spokenResponse: `The answer is ${formatted}.`,
          };
        }
        break;
      }
      default:
        break;
    }

    return {
      displayExpression: this.prettifyExpression(
        intent.expression || normalizedExpression
      ),
      spokenResponse: `The answer is ${formatted}.`,
    };
  }

  public evaluateTrig(
    fn: 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan',
    val: number,
    angleUnit: 'deg' | 'rad'
  ): number {
    if (fn === 'sin' || fn === 'cos' || fn === 'tan') {
      const rad = angleUnit === 'deg' ? (val * Math.PI) / 180 : val;
      if (fn === 'tan' && angleUnit === 'deg') {
        const mod180 = Math.abs(val % 180);
        if (Math.abs(mod180 - 90) < 1e-9) {
          throw new CalcDomainError(
            'INVALID_EXPRESSION',
            `Tangent of ${val} degrees is undefined.`
          );
        }
      }
      const raw =
        fn === 'sin'
          ? Math.sin(rad)
          : fn === 'cos'
          ? Math.cos(rad)
          : Math.tan(rad);
      return this.sanitizeNumber(raw);
    }

    if ((fn === 'asin' || fn === 'acos') && (val < -1 || val > 1)) {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        `Inverse ${fn === 'asin' ? 'sine' : 'cosine'} requires a value between -1 and 1.`
      );
    }
    const radResult =
      fn === 'asin'
        ? Math.asin(val)
        : fn === 'acos'
        ? Math.acos(val)
        : Math.atan(val);
    const out = angleUnit === 'deg' ? (radResult * 180) / Math.PI : radResult;
    return this.sanitizeNumber(out);
  }

  public prettifyExpression(expr: string): string {
    return expr
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/sqrt\(/g, '√(')
      .replace(/cbrt\(/g, '∛(')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public normalizeSymbols(expr: string): string {
    let s = expr
      .trim()
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/–/g, '-')
      .replace(/\*\*/g, '^')
      .replace(/π/g, 'pi')
      .replace(/√\s*\(/g, 'sqrt(')
      .replace(/√\s*([0-9.]+)/g, 'sqrt($1)')
      .replace(/∛\s*\(/g, 'cbrt(')
      .replace(/∛\s*([0-9.]+)/g, 'cbrt($1)');

    // Explicitly normalize percentage expressions if present in raw expression string
    // e.g. "15% of 800" -> "15 / 100 * 800", "15% * 800" -> "15 / 100 * 800"
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s*%\s*of\s*(-?\d+(?:\.\d+)?)/gi,
      '$1 / 100 * $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s*%\s*\*\s*(-?\d+(?:\.\d+)?)/gi,
      '$1 / 100 * $2'
    );
    // "1500 - 20% discount" or "1500 - 20%" -> "1500 - (20 / 100 * 1500)"
    s = s.replace(
      /^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)\s*%\s*(?:discount|off)?$/i,
      '$1 - ($2 / 100 * $1)'
    );
    // "1000 + 18% GST" or "1000 + 18%" -> "1000 + (18 / 100 * 1000)"
    s = s.replace(
      /^(-?\d+(?:\.\d+)?)\s*\+\s*(-?\d+(?:\.\d+)?)\s*%\s*(?:gst|tax|tip)?$/i,
      '$1 + ($2 / 100 * $1)'
    );

    s = mergeCompoundSpokenNumbers(s);

    return s;
  }

  private tokenize(expr: string): JevToken[] {
    const tokens: JevToken[] = [];
    let i = 0;
    const len = expr.length;

    while (i < len) {
      const ch = expr[i];

      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Check for unary minus or unary plus
      if (ch === '-' || ch === '+') {
        const prev = tokens[tokens.length - 1];
        const isUnary =
          !prev ||
          prev.type === 'OPERATOR' ||
          prev.type === 'LPAREN' ||
          prev.type === 'FUNCTION';

        if (isUnary) {
          if (ch === '+') {
            i++;
            continue;
          }
          tokens.push({ type: 'FUNCTION', value: 'neg' });
          i++;
          continue;
        }
      }

      // Numbers (including decimals and scientific notation like 1.5e-3)
      if (/[0-9.]/.test(ch)) {
        let numStr = '';
        let dotCount = 0;
        while (i < len && /[0-9.]/.test(expr[i])) {
          if (expr[i] === '.') dotCount++;
          if (dotCount > 1) {
            throw new CalcDomainError(
              'INVALID_NUMBER',
              'Invalid number format with multiple decimal points.'
            );
          }
          numStr += expr[i];
          i++;
        }
        // Scientific notation exponent
        if (i < len && (expr[i] === 'e' || expr[i] === 'E')) {
          const nextCh = expr[i + 1];
          const afterNext = expr[i + 2];
          if (
            /[0-9]/.test(nextCh || '') ||
            ((nextCh === '+' || nextCh === '-') && /[0-9]/.test(afterNext || ''))
          ) {
            numStr += expr[i];
            i++;
            if (expr[i] === '+' || expr[i] === '-') {
              numStr += expr[i];
              i++;
            }
            while (i < len && /[0-9]/.test(expr[i])) {
              numStr += expr[i];
              i++;
            }
          }
        }

        if (numStr === '.') {
          throw new CalcDomainError(
            'INVALID_NUMBER',
            'Invalid decimal point without digits.'
          );
        }

        const numericValue = Number(numStr);
        if (Number.isNaN(numericValue)) {
          throw new CalcDomainError(
            'INVALID_NUMBER',
            `Invalid number "${numStr}" in expression.`
          );
        }
        if (!Number.isFinite(numericValue) || Math.abs(numericValue) > MAX_SAFE_MAGNITUDE) {
          throw new CalcDomainError(
            'OVERFLOW',
            'That number is too large to calculate accurately.'
          );
        }

        const prev = tokens[tokens.length - 1];
        if (prev && (prev.type === 'RPAREN' || prev.type === 'POSTFIX')) {
          tokens.push({ type: 'OPERATOR', value: '*' });
        }

        tokens.push({ type: 'NUMBER', value: numStr, numericValue });
        continue;
      }

      // Identifiers (functions or constants pi, e)
      if (/[a-zA-Z]/.test(ch)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_]/.test(expr[i])) {
          ident += expr[i];
          i++;
        }
        const lower = ident.toLowerCase();

        const prev = tokens[tokens.length - 1];
        if (
          prev &&
          (prev.type === 'NUMBER' ||
            prev.type === 'RPAREN' ||
            prev.type === 'POSTFIX')
        ) {
          tokens.push({ type: 'OPERATOR', value: '*' });
        }

        if (lower === 'pi') {
          tokens.push({
            type: 'NUMBER',
            value: 'pi',
            numericValue: Math.PI,
          });
        } else if (lower === 'e') {
          tokens.push({
            type: 'NUMBER',
            value: 'e',
            numericValue: Math.E,
          });
        } else if (JEV_SUPPORTED_FUNCTIONS.has(lower)) {
          tokens.push({ type: 'FUNCTION', value: lower });
        } else {
          throw new CalcDomainError(
            'UNSUPPORTED_JEV_FUNCTION',
            `Unsupported function or symbol "${ident}".`
          );
        }
        continue;
      }

      if (ch === '(') {
        const prev = tokens[tokens.length - 1];
        if (
          prev &&
          (prev.type === 'NUMBER' ||
            prev.type === 'RPAREN' ||
            prev.type === 'POSTFIX')
        ) {
          tokens.push({ type: 'OPERATOR', value: '*' });
        }
        tokens.push({ type: 'LPAREN', value: '(' });
        i++;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'RPAREN', value: ')' });
        i++;
        continue;
      }

      if (ch === '!' || ch === '%') {
        tokens.push({ type: 'POSTFIX', value: ch });
        i++;
        continue;
      }

      if (['+', '-', '*', '/', '^'].includes(ch)) {
        tokens.push({ type: 'OPERATOR', value: ch });
        i++;
        continue;
      }

      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        `Unexpected character "${ch}" in calculation.`
      );
    }

    return tokens;
  }

  private getPrecedence(op: string): number {
    switch (op) {
      case '+':
      case '-':
        return 1;
      case '*':
      case '/':
        return 2;
      case '^':
        return 3;
      default:
        return 0;
    }
  }

  private isRightAssociative(op: string): boolean {
    return op === '^';
  }

  private shuntingYard(tokens: JevToken[]): JevToken[] {
    const output: JevToken[] = [];
    const stack: JevToken[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      switch (token.type) {
        case 'NUMBER':
        case 'POSTFIX':
          output.push(token);
          break;

        case 'FUNCTION':
          stack.push(token);
          break;

        case 'OPERATOR': {
          while (stack.length > 0) {
            const top = stack[stack.length - 1];
            if (top.type === 'FUNCTION') {
              output.push(stack.pop()!);
            } else if (top.type === 'OPERATOR') {
              const p1 = this.getPrecedence(token.value);
              const p2 = this.getPrecedence(top.value);
              if (
                p2 > p1 ||
                (p2 === p1 && !this.isRightAssociative(token.value))
              ) {
                output.push(stack.pop()!);
              } else {
                break;
              }
            } else {
              break;
            }
          }
          stack.push(token);
          break;
        }

        case 'LPAREN':
          stack.push(token);
          break;

        case 'RPAREN': {
          let foundParen = false;
          while (stack.length > 0) {
            const top = stack.pop()!;
            if (top.type === 'LPAREN') {
              foundParen = true;
              break;
            }
            output.push(top);
          }
          if (!foundParen) {
            throw new CalcDomainError(
              'INVALID_EXPRESSION',
              'Mismatched parentheses in expression.'
            );
          }
          if (stack.length > 0 && stack[stack.length - 1].type === 'FUNCTION') {
            output.push(stack.pop()!);
          }
          break;
        }
      }
    }

    while (stack.length > 0) {
      const top = stack.pop()!;
      if (top.type === 'LPAREN' || top.type === 'RPAREN') {
        throw new CalcDomainError(
          'INVALID_EXPRESSION',
          'Mismatched parentheses in expression.'
        );
      }
      output.push(top);
    }

    return output;
  }

  private evaluateRPN(rpn: JevToken[], angleUnit: 'deg' | 'rad'): number {
    const stack: number[] = [];

    for (const token of rpn) {
      if (token.type === 'NUMBER') {
        stack.push(token.numericValue!);
        continue;
      }

      if (token.type === 'POSTFIX') {
        if (stack.length < 1) {
          throw new CalcDomainError(
            'INVALID_EXPRESSION',
            'Invalid expression syntax.'
          );
        }
        const val = stack.pop()!;
        if (token.value === '!') {
          stack.push(this.factorial(val));
        } else if (token.value === '%') {
          stack.push(this.decimalSafeArithmetic(val, 100, '/'));
        }
        continue;
      }

      if (token.type === 'FUNCTION') {
        if (stack.length < 1) {
          throw new CalcDomainError(
            'INVALID_EXPRESSION',
            `Missing argument for ${token.value}.`
          );
        }
        const a = stack.pop()!;
        stack.push(this.applyFunction(token.value, a, angleUnit));
        continue;
      }

      if (token.type === 'OPERATOR') {
        if (stack.length < 2) {
          throw new CalcDomainError(
            'INVALID_EXPRESSION',
            'Incomplete mathematical expression.'
          );
        }
        const b = stack.pop()!;
        const a = stack.pop()!;

        switch (token.value) {
          case '+':
            stack.push(this.decimalSafeArithmetic(a, b, '+'));
            break;
          case '-':
            stack.push(this.decimalSafeArithmetic(a, b, '-'));
            break;
          case '*':
            stack.push(this.decimalSafeArithmetic(a, b, '*'));
            break;
          case '/':
            stack.push(this.decimalSafeArithmetic(a, b, '/'));
            break;
          case '^':
            stack.push(Math.pow(a, b));
            break;
          default:
            throw new CalcDomainError(
              'UNSUPPORTED_OPERATION',
              `Unsupported operator "${token.value}".`
            );
        }
      }
    }

    if (stack.length !== 1) {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        "I couldn't evaluate that expression completely."
      );
    }

    return stack[0];
  }

  private applyFunction(
    fn: string,
    a: number,
    angleUnit: 'deg' | 'rad'
  ): number {
    switch (fn) {
      case 'neg':
        return -a;
      case 'sqrt':
        if (a < 0) {
          throw new CalcDomainError(
            'NEGATIVE_ROOT',
            "I can't calculate the real square root of a negative number."
          );
        }
        return Math.sqrt(a);
      case 'cbrt':
        return Math.cbrt(a);
      case 'abs':
        return Math.abs(a);
      case 'fact':
      case 'factorial':
        return this.factorial(a);
      case 'exp':
        return Math.exp(a);
      case 'log':
      case 'log10':
        if (a <= 0) {
          throw new CalcDomainError(
            'INVALID_LOGARITHM',
            'Logarithm is only defined for positive numbers greater than zero.'
          );
        }
        return Math.log10(a);
      case 'log2':
        if (a <= 0) {
          throw new CalcDomainError(
            'INVALID_LOGARITHM',
            'Logarithm is only defined for positive numbers greater than zero.'
          );
        }
        return Math.log2(a);
      case 'ln':
        if (a <= 0) {
          throw new CalcDomainError(
            'INVALID_LOGARITHM',
            'Natural logarithm is only defined for positive numbers greater than zero.'
          );
        }
        return Math.log(a);
      case 'sin':
      case 'cos':
      case 'tan':
      case 'asin':
      case 'acos':
      case 'atan':
        return this.evaluateTrig(fn, a, angleUnit);
      case 'sind':
        return this.evaluateTrig('sin', a, 'deg');
      case 'cosd':
        return this.evaluateTrig('cos', a, 'deg');
      case 'tand':
        return this.evaluateTrig('tan', a, 'deg');
      case 'floor':
        return Math.floor(a);
      case 'ceil':
        return Math.ceil(a);
      case 'round':
        return Math.round(a);
      default:
        throw new CalcDomainError(
          'UNSUPPORTED_JEV_FUNCTION',
          `Unsupported function "${fn}".`
        );
    }
  }

  /**
   * Independent Recursive-Descent AST Evaluator (Section 9 Double Validation).
   * Uses a top-down recursive grammar completely separate from Shunting-Yard RPN:
   *   Expr    -> Term (( '+' | '-' ) Term)*
   *   Term    -> Power (( '*' | '/' ) Power)*
   *   Power   -> Unary ( '^' Power )?
   *   Unary   -> ('-' | '+' | Function) Unary | Postfix
   *   Postfix -> Primary ( '!' | '%' )*
   *   Primary -> NUMBER | '(' Expr ')'
   */
  private evaluateWithRecursiveDescentAST(
    rawExpression: string,
    angleUnit: 'deg' | 'rad'
  ): number {
    const normalized = this.normalizeSymbols(rawExpression);
    const tokens = this.tokenize(normalized);
    let pos = 0;

    const peek = (): JevToken | undefined => tokens[pos];
    const consume = (): JevToken => tokens[pos++];

    const parseExpr = (): number => {
      let left = parseTerm();
      while (
        peek()?.type === 'OPERATOR' &&
        (peek()!.value === '+' || peek()!.value === '-')
      ) {
        const op = consume().value;
        const right = parseTerm();
        left = op === '+' ? left + right : left - right;
      }
      return left;
    };

    const parseTerm = (): number => {
      let left = parsePower();
      while (
        peek()?.type === 'OPERATOR' &&
        (peek()!.value === '*' || peek()!.value === '/')
      ) {
        const op = consume().value;
        const right = parsePower();
        if (op === '/') {
          if (right === 0) {
            throw new CalcDomainError(
              'DIVISION_BY_ZERO',
              "I can't divide a number by zero."
            );
          }
          left = left / right;
        } else {
          left = left * right;
        }
      }
      return left;
    };

    const parsePower = (): number => {
      const base = parseUnary();
      if (peek()?.type === 'OPERATOR' && peek()!.value === '^') {
        consume();
        const exponent = parsePower(); // right-associative
        return Math.pow(base, exponent);
      }
      return base;
    };

    const parseUnary = (): number => {
      const tok = peek();
      if (tok?.type === 'FUNCTION') {
        const fnToken = consume();
        const arg = parseUnary();
        return this.applyFunction(fnToken.value, arg, angleUnit);
      }
      return parsePostfix();
    };

    const parsePostfix = (): number => {
      let val = parsePrimary();
      while (peek()?.type === 'POSTFIX') {
        const pf = consume();
        if (pf.value === '!') {
          val = this.factorial(val);
        } else if (pf.value === '%') {
          val = val / 100;
        }
      }
      return val;
    };

    const parsePrimary = (): number => {
      const tok = peek();
      if (!tok) {
        throw new CalcDomainError(
          'INVALID_EXPRESSION',
          'Unexpected end of expression.'
        );
      }
      if (tok.type === 'NUMBER') {
        consume();
        return tok.numericValue!;
      }
      if (tok.type === 'LPAREN') {
        consume();
        const inner = parseExpr();
        if (peek()?.type !== 'RPAREN') {
          throw new CalcDomainError(
            'INVALID_EXPRESSION',
            'Mismatched parentheses in expression.'
          );
        }
        consume();
        return inner;
      }
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        `Unexpected token "${tok.value}".`
      );
    };

    const finalVal = parseExpr();
    if (pos !== tokens.length) {
      throw new CalcDomainError(
        'INVALID_EXPRESSION',
        'Incomplete mathematical expression.'
      );
    }
    return finalVal;
  }
}

export const jevCalculationEngine = new JevCalculationEngine();
