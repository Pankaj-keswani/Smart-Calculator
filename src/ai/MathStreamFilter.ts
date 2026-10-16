/**
 * Math Stream Filter & Pure Numerical/Operation Extractor
 *
 * Strictly extracts ONLY numbers, mathematical symbols, and valid operations.
 * Completely discards conversational fluff, greetings, random dialogue, and filler words.
 *
 * If a spoken utterance contains ZERO mathematical tokens, it is flagged as pure noise
 * so the calculator ignores it silently without error or interruption.
 */

import { ConversationContext } from '../models/types';
import { replaceSpokenNumbers, mergeCompoundSpokenNumbers } from './nlFallbackParser';

export interface FilteredMathStreamResult {
  isPureNoise: boolean;
  isChaining: boolean;
  cleanMathText: string | null;
  rawText: string;
}

export class MathStreamFilter {
  /**
   * Strictly extracts ONLY mathematical operations and numericals.
   * Filters out conversational noise words and detects chaining vs fresh operations.
   */
  public filter(
    rawTranscript: string,
    context: ConversationContext
  ): FilteredMathStreamResult {
    const raw = (rawTranscript || '').trim();
    if (!raw) {
      return {
        isPureNoise: true,
        isChaining: false,
        cleanMathText: null,
        rawText: raw,
      };
    }

    // Voice Control Shortcut Commands pass through cleanly
    if (
      /^(?:clear|reset|start over|cancel|undo|wapas|copy|copy that|copy result|copy answer|repeat|say again|say that again|save\s+(?:this|\d+)\s+as|store\s+\d+\s+as|remember\s+\d+\s+as|recall)\b/i.test(
        raw
      )
    ) {
      return {
        isPureNoise: false,
        isChaining: false,
        cleanMathText: raw,
        rawText: raw,
      };
    }

    // Step 1: Clean punctuation and normalize spoken number words to digits ("two" -> "2", "twenty five" -> "25", "do hazar" -> "2000")
    let s = raw.replace(/,/g, ' ').replace(/[?!;:=]+$/g, '');
    s = replaceSpokenNumbers(s);
    s = mergeCompoundSpokenNumbers(s);

    // Step 1.5: Strip conversational noise phrases and words BEFORE structural normalization
    const NOISE_PHRASES = [
      'what do i get if i',
      'can you please tell me',
      'can you please calculate',
      'can you tell me what is',
      'can you tell me',
      'could you tell me',
      'please tell me',
      'tell me what is',
      'tell me',
      'let me know',
      'give me',
      'show me',
      'find out',
      'how much is',
      'how much',
      'what is',
      "what's",
      'whats',
      'calculate for me',
      'please calculate',
      'just calculate',
      'calculate',
      'compute',
      'solve',
      'evaluate',
      'never mind',
      'forget it',
      'scratch that',
      'hold on',
    ];

    for (const phrase of NOISE_PHRASES) {
      s = s.replace(new RegExp(`\\b${phrase.replace(/'/g, "\\'")}\\b`, 'gi'), ' ');
    }

    const NOISE_WORDS = [
      'hey', 'hi', 'hello', 'hola', 'bonjour', 'namaste', 'namaskar',
      'please', 'pls', 'kindly', 'just', 'ok', 'okay', 'alright', 'right', 'sure', 'yeah', 'yes', 'no', 'yep', 'nope',
      'can', 'could', 'would', 'will', 'you',
      'answer', 'result',
      'um', 'uh', 'hmm', 'ah', 'oh', 'like', 'actually', 'basically', 'literally', 'so', 'well', 'anyway', 'then',
      'bro', 'bhai', 'dude', 'man', 'boss', 'sir', 'madam', 'buddy', 'friend', 'mate',
      'arre', 'suno', 'bata', 'batao', 'yaar', 'haan', 'nahi', 'acha', 'thik', 'theek',
      'wait', 'hold', 'stop',
    ];

    for (const word of NOISE_WORDS) {
      s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    }
    s = s.replace(/\s+/g, ' ').trim();

    // Step 2: Normalize spoken decimals ("2 point 5" -> "2.5", "point 5" -> "0.5")
    s = s.replace(/(\d+)\s*(?:point|dot|dashamlav|दशमलव)\s*(\d+)/gi, '$1.$2');
    s = s.replace(/(?:^|\s)(?:point|dot|dashamlav|दशमलव)\s*(\d+)/gi, ' 0.$1');

    // Step 3: Handle everyday math phrasing (percentages, GST, discounts, currency, units, Hinglish context)
    const isSpecialEveryday =
      /\b(?:percent|percentage|pratishat|प्रतिशत|discount|off|gst|tip|dollar|euro|rupee|inr|km|kilometer|meter|kg|gram|usme|usmein|usko)\b/i.test(
        s
      );

    if (isSpecialEveryday) {
      const cleanEveryday = s
        .replace(
          /^(?:can\s+you\s+(?:please\s+)?(?:calculate|tell\s+me|find|compute)?|please\s+(?:calculate|find)?|tell\s+me|what\s+is|what's|calculate|compute)\s+/i,
          ''
        )
        .replace(/\b(?:then|someone|came|hello|hi|hey|wait|bro|bhai|arre|suno)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        isPureNoise: false,
        isChaining: false,
        cleanMathText: cleanEveryday,
        rawText: raw,
      };
    }

    // Step 3.5: Normalize natural language prefix/Hinglish verb structures before token stripping
    // "add 2 and 3" -> "2 + 3"
    s = s.replace(
      /\b(?:add|sum\s+of|combine)\s+(-?\d+(?:\.\d+)?)\s+(?:and|to|with)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 + $2'
    );
    // "subtract 35 from 100" -> "100 - 35"
    s = s.replace(
      /\b(?:subtract|take\s+away|remove)\s+(-?\d+(?:\.\d+)?)\s+from\s+(-?\d+(?:\.\d+)?)/gi,
      '$2 - $1'
    );
    // "multiply 12 by 8" -> "12 * 8"
    s = s.replace(
      /\b(?:multiply|product\s+of)\s+(-?\d+(?:\.\d+)?)\s+(?:by|and|with)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 * $2'
    );
    // "divide 100 by 4" / "500 ko 5 se divide karo" -> "100 / 4"
    s = s.replace(
      /\b(?:divide|quotient\s+of)\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 / $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ko\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:divide|bhaag|bhag)(?:\s+karo)?/gi,
      '$1 / $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ko\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:multiply|guna)(?:\s+karo)?/gi,
      '$1 * $2'
    );

    // Step 4: Normalize powers and roots
    s = s.replace(
      /(?:square\s+root\s+of|under\s*root\s+of|root\s+of|under\s*root|\broot)\s+(-?\d+(?:\.\d+)?)/gi,
      'sqrt($1)'
    );
    s = s.replace(
      /(?:cube\s+root\s+of|cube\s+root)\s+(-?\d+(?:\.\d+)?)/gi,
      'cbrt($1)'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:raised\s+to\s+(?:the\s+)?power\s+(?:of\s+)?|to\s+the\s+power\s+of|power)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 ^ $2'
    );
    s = s.replace(/(?:square\s+of)\s+(-?\d+(?:\.\d+)?)/gi, '$1 ^ 2');
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+square/gi, '$1 ^ 2');
    s = s.replace(/(?:cube\s+of)\s+(-?\d+(?:\.\d+)?)/gi, '$1 ^ 3');
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+cube/gi, '$1 ^ 3');

    // Step 5: Normalize arithmetic operators
    // Multiplication
    s = s.replace(
      /\b(?:multiplied\s+by|multiply\s+by|multiply|times|into|in\s+to|in\s+2|guna\s+karo|guna)\b/gi,
      ' * '
    );
    s = s.replace(/(?<=\d)\s*[xX*×]\s*(?=\d)/gi, ' * ');

    // Division
    s = s.replace(
      /\b(?:divided\s+by|divide\s+by|divide|devide|bhaag\s+karo|bhaag\s+do|bhaag|bata|batte|over|upon)\b/gi,
      ' / '
    );
    s = s.replace(/(?<=\d)\s+by\s+(?=\d)/gi, ' / ');
    s = s.replace(/[÷\/]/g, ' / ');

    // Addition
    s = s.replace(/\b(?:plus|add\s+to|added\s+to|add|jodo|jod|aur)\b/gi, ' + ');

    // Subtraction
    s = s.replace(
      /\b(?:minus|subtract\s+from|subtract|subtracted\s+by|ghatao|kam\s+karo)\b/gi,
      ' - '
    );

    // Step 6: Detect chaining onto previous calculated result
    const hasPreviousResult =
      context.lastResult !== null && Number.isFinite(context.lastResult);
    const startsWithOpMatch = s.match(/^\s*([+\-*/^])/);
    const isChaining = Boolean(startsWithOpMatch && hasPreviousResult);

    // Step 7: Extract ONLY valid mathematical tokens (numbers, functions, math operators)
    const tokenRegex =
      /(?:-?\d+(?:\.\d+)?|[+\-*/^%()]|\b(?:sqrt|cbrt|sin|cos|tan|log|ln|exp|factorial|fact|abs)\b\s*\(\s*-?\d+(?:\.\d+)?\s*\)|\b(?:sqrt|cbrt)\s+-?\d+(?:\.\d+)?)/gi;

    const mathTokens: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(s)) !== null) {
      mathTokens.push(match[0].trim());
    }

    // If zero numbers or math operators are detected, it's pure conversational noise
    if (mathTokens.length === 0) {
      return {
        isPureNoise: true,
        isChaining: false,
        cleanMathText: null,
        rawText: raw,
      };
    }

    let assembled = mathTokens.join(' ');

    if (isChaining && hasPreviousResult) {
      // Prepend previous result so "plus 2 - 5" -> "4 + 2 - 5"
      assembled = `${context.lastResult} ${assembled}`;
    } else {
      // If not chaining, strip any dangling leading operator (e.g. "+ 5 + 10" -> "5 + 10")
      assembled = assembled.replace(/^[+*/^]\s*/, '');
    }

    // Clean up consecutive operators like "+ +"
    assembled = assembled
      .replace(/\+\s*\+/g, '+')
      .replace(/-\s*-/g, '+')
      .replace(/\s+/g, ' ')
      .trim();

    assembled = mergeCompoundSpokenNumbers(assembled);

    return {
      isPureNoise: false,
      isChaining,
      cleanMathText: assembled,
      rawText: raw,
    };
  }
}

export const mathStreamFilter = new MathStreamFilter();
