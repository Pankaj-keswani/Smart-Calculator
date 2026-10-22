/**
 * On-Device Intent Service
 *
 * Turns a spoken or typed command into a validated StructuredAIIntent using the
 * deterministic rule-based parser (`nlParser.ts`). Everything runs on the phone:
 * no network, no API keys, no machine-learning model.
 */

import { parseAndValidateAIResponse } from '../models/schemaValidator';
import { ConversationContext, ErrorCode, StructuredAIIntent } from '../models/types';
import { nlFallbackParser } from './nlParser';

export class IntentError extends Error {
  public readonly code: ErrorCode;
  public readonly friendlyMessage: string;

  constructor(code: ErrorCode, friendlyMessage: string) {
    super(friendlyMessage);
    this.name = 'IntentError';
    this.code = code;
    this.friendlyMessage = friendlyMessage;
  }
}

export class IntentService {
  /** Parses a command into a validated intent. Throws IntentError if it cannot. */
  public interpret(
    command: string,
    context: ConversationContext
  ): StructuredAIIntent {
    const intent = nlFallbackParser.parse(command, context);
    const validation = parseAndValidateAIResponse(intent);
    if (!validation.valid || !validation.data) {
      throw new IntentError('INVALID_EXPRESSION', "I couldn't understand that calculation.");
    }
    return validation.data;
  }
}

export const intentService = new IntentService();
