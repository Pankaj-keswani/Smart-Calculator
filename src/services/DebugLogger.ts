/**
 * Developer Debug Mode & Pipeline Trace Logger (DebugLogger)
 *
 * Implements Section 16:
 * Records deterministic pipeline steps:
 *   Voice input -> AI normalized intent -> Normalized expression -> JEV result -> Validation -> Final result
 *
 * SECURITY GUARANTEE:
 * - Explicitly redacts API keys, Bearer tokens, and secrets so they are never exposed in logs.
 */

import { PipelineDebugTrace } from '../models/types';

const SECRET_PATTERNS: RegExp[] = [
  /\b(sk-[a-zA-Z0-9_-]{8,})\b/g,
  /\b(gsk_[a-zA-Z0-9_-]{8,})\b/g,
  /\b(AIza[a-zA-Z0-9_-]{10,})\b/g,
  /(Bearer\s+)[a-zA-Z0-9._-]+/gi,
  /("?(?:api[_-]?key|x-api-key|authorization)"?\s*:\s*"?)[^"\s,}]+/gi,
];

export class DebugLogger {
  private traces: PipelineDebugTrace[] = [];
  private discrepancies: Array<{
    expression: string;
    jevResult: number;
    validatorResult: number;
    timestamp: number;
  }> = [];
  private debugEnabled = false;

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Redacts any potential API keys or tokens from log strings.
   */
  public redactSecrets(input: string): string {
    if (!input) return '';
    let sanitized = input;
    for (const pattern of SECRET_PATTERNS) {
      sanitized = sanitized.replace(pattern, (_match, prefix) =>
        typeof prefix === 'string' &&
        (prefix.toLowerCase().startsWith('bearer') || prefix.includes(':'))
          ? `${prefix}[REDACTED]`
          : '[REDACTED_API_KEY]'
      );
    }
    return sanitized;
  }

  /**
   * Formats a pipeline trace in the canonical Section 16 Developer Debug Mode format.
   */
  public formatTrace(params: {
    voiceInput: string;
    aiNormalizedIntent: string;
    normalizedExpression: string;
    jevResult: string;
    validationStatus: 'PASS' | 'FAIL' | 'SKIPPED';
    finalResult: string;
  }): string {
    const cleanInput = this.redactSecrets(params.voiceInput);
    const cleanIntent = this.redactSecrets(params.aiNormalizedIntent);
    const cleanExpr = this.redactSecrets(params.normalizedExpression);
    const cleanJev = this.redactSecrets(params.jevResult);
    const cleanFinal = this.redactSecrets(params.finalResult);

    return [
      'Voice input:',
      `"${cleanInput}"`,
      '',
      'Parsed intent:',
      cleanIntent,
      '',
      'Normalized expression:',
      cleanExpr,
      '',
      'JEV result:',
      cleanJev,
      '',
      'Validation:',
      params.validationStatus,
      '',
      'Final result:',
      cleanFinal,
    ].join('\n');
  }

  public recordTrace(params: {
    voiceInput: string;
    aiNormalizedIntent: string;
    normalizedExpression: string;
    jevResult: string;
    validationStatus: 'PASS' | 'FAIL' | 'SKIPPED';
    finalResult: string;
  }): PipelineDebugTrace {
    const formattedLog = this.formatTrace(params);
    const trace: PipelineDebugTrace = {
      voiceInput: this.redactSecrets(params.voiceInput),
      aiNormalizedIntent: this.redactSecrets(params.aiNormalizedIntent),
      normalizedExpression: this.redactSecrets(params.normalizedExpression),
      jevResult: this.redactSecrets(params.jevResult),
      validationStatus: params.validationStatus,
      finalResult: this.redactSecrets(params.finalResult),
      timestamp: Date.now(),
      formattedLog,
    };

    this.traces = [trace, ...this.traces.slice(0, 49)];
    return trace;
  }

  public logDiscrepancy(
    expression: string,
    jevResult: number,
    validatorResult: number
  ): void {
    const cleanExpr = this.redactSecrets(expression);
    this.discrepancies.push({
      expression: cleanExpr,
      jevResult,
      validatorResult,
      timestamp: Date.now(),
    });
  }

  public getTraces(): PipelineDebugTrace[] {
    return [...this.traces];
  }

  public getLatestTrace(): PipelineDebugTrace | null {
    return this.traces[0] || null;
  }

  public getDiscrepancies() {
    return [...this.discrepancies];
  }

  public clear(): void {
    this.traces = [];
    this.discrepancies = [];
  }
}

export const debugLogger = new DebugLogger();
