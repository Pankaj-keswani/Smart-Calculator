/**
 * Deterministic Natural Language & Hinglish Mathematical Intent Parser
 * (Also serves as the isolated MockAIService when no external AI_API_KEY is configured
 * or when operating in offline mode.)
 *
 * Produces the exact same StructuredAIIntent JSON schema as the cloud LLM parser.
 */

import { conversionService } from '../engine/ConversionService';
import { currencyService } from '../engine/CurrencyService';
import { ConversationContext, StructuredAIIntent } from '../models/types';
import {
  canMergeCompoundNumbers,
  mergeCompoundSpokenNumbers,
  getTrailingZeros,
} from '../utils/compoundNumberParser';

export { canMergeCompoundNumbers, mergeCompoundSpokenNumbers, getTrailingZeros };

const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhah: 6,
  chhe: 6,
  che: 6,
  chhey: 6,
  saat: 7,
  sat: 7,
  aath: 8,
  ath: 8,
  nau: 9,
  das: 10,
  gyarah: 11,
  gyara: 11,
  barah: 12,
  bara: 12,
  terah: 13,
  tera: 13,
  chaudah: 14,
  pandrah: 15,
  pandra: 15,
  solah: 16,
  sola: 16,
  satrah: 17,
  satra: 17,
  atharah: 18,
  athara: 18,
  unnis: 19,
  bees: 20,
  tees: 30,
  chaalis: 40,
  chalis: 40,
  pachaas: 50,
  pachas: 50,
  sattar: 70,
  assi: 80,
  nabbe: 90,
  // Hindi Devanagari words
  'एक': 1,
  'दो': 2,
  'तीन': 3,
  'चार': 4,
  'पाँच': 5,
  'छह': 6,
  'सात': 7,
  'आठ': 8,
  'नौ': 9,
  'दस': 10,
  // Spanish number words
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  cien: 100,
  ciento: 100,
  // French number words
  un: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six_fr: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  vingt: 20,
  trente: 30,
  cent: 100,
};

const MAGNITUDE_WORDS: Record<string, number> = {
  hundred: 100,
  sau: 100,
  'सौ': 100,
  dozen: 12,
  dozens: 12,
  thousand: 1_000,
  hazaar: 1_000,
  hazar: 1_000,
  'हज़ार': 1_000,
  lakh: 100_000,
  lac: 100_000,
  lakhs: 100_000,
  'लाख': 100_000,
  crore: 10_000_000,
  crores: 10_000_000,
  'करोड़': 10_000_000,
  mil: 1_000,
  mille: 1_000,
  million: 1_000_000,
  millon: 1_000_000,
  billion: 1_000_000_000,
};

/**
 * Converts spoken English/Hinglish number words in a sentence into numeric digits.
 * Example: "what do I get if I add two and two" -> "what do I get if I add 2 and 2"
 * Example: "twenty five plus thirty" -> "25 plus 30"
 */
export function replaceSpokenNumbers(input: string): string {
  // Normalize common speech recognition homophones when adjacent to math operators / context:
  const preprocessed = input
    // "5 in 2 4" or "5 in to 4" -> "5 into 4"
    .replace(/(?<=\b\d+\s+)in\s+(?:2|to)\b/gi, 'into')
    .replace(/\bin\s+(?:2|to)(?=\s+\d+\b)/gi, 'into')
    // "divided buy" / "divide buy" -> "divided by"
    .replace(/\bdivide(?:d)?\s+buy\b/gi, 'divided by')
    // "upon" / "over" in arithmetic -> "divided by"
    .replace(/(?<=\b\d+\s+)upon(?=\s+\d+\b)/gi, 'divided by')
    // "add to and to" -> "add 2 and 2", "5 plus to" -> "5 plus 2", "to plus to" -> "2 plus 2"
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)to\b/gi, 'two')
    .replace(/\bto(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'two')
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)too\b/gi, 'two')
    .replace(/\btoo(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'two')
    // "plus for" -> "plus four", "for times" -> "four times"
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)for\b/gi, 'four')
    .replace(/\bfor(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'four')
    // "plus ate" -> "plus eight"
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)ate\b/gi, 'eight')
    .replace(/\bate(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'eight')
    // "won" -> "one"
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)won\b/gi, 'one')
    .replace(/\bwon(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'one')
    // "tree" adjacent to operator -> "three"
    .replace(/(?<=\b(?:add|plus|minus|times|into|divide|divided\s+by|\+|-|\*|\/)\s+)tree\b/gi, 'three')
    .replace(/\btree(?=\s+(?:and|plus|minus|times|into|\+|-|\*|\/)\b)/gi, 'three')
    // "k" suffix as thousand (e.g., "5k" -> "5000", "2.5k" -> "2500", "10k" -> "10000")
    .replace(/\b(\d+(?:\.\d+)?)\s*k\b/gi, (_match, num) => String(Number(num) * 1000))
    // Typo / stutter normalizations:
    .replace(/\bpluss+\b/gi, 'plus')
    .replace(/\baddd+\b/gi, 'add')
    .replace(/\bin\s+to\b/gi, 'into')
    .replace(/\bdevide(?:d)?\b/gi, 'divide');

  // Replace hyphenated compound numbers like "twenty-five" -> "twenty five"
  const dehyphenated = preprocessed.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    '$1 $2'
  );

  // Protect "do" when used as auxiliary verb ("what do I", "how do I", "do you")
  const tokens = dehyphenated.split(/(\s+|[?,!();])/);
  const result: string[] = [];

  let currentTotal = 0;
  let currentGroup = 0;
  let inNumberSequence = false;

  const flushNumber = () => {
    if (inNumberSequence) {
      const value = currentTotal + currentGroup;
      result.push(
        Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
      );
      currentTotal = 0;
      currentGroup = 0;
      inNumberSequence = false;
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const rawToken = tokens[i];
    if (!rawToken || /^\s+$/.test(rawToken)) {
      if (!inNumberSequence) {
        result.push(rawToken);
      }
      continue;
    }

    const lower = rawToken.toLowerCase();

    // Look ahead / behind to the nearest non-space tokens
    let nextToken: string | null = null;
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j]?.trim();
      if (t) {
        nextToken = t.toLowerCase();
        break;
      }
    }
    let prevToken: string | null = null;
    for (let j = result.length - 1; j >= 0; j--) {
      const t = result[j]?.trim();
      if (t) {
        prevToken = t.toLowerCase();
        break;
      }
    }

    // Avoid treating English auxiliary verb "do" as Hindi "2" unless it is in a
    // numeric position ("do sau", "do plus teen", "5 guna do") or Hindi context.
    const MATH_NEIGHBOUR =
      /^(?:\d+(?:\.\d+)?|[+\-*/^x×÷]|plus|minus|times|into|guna|bhag|jodo|jod|ghatao|aur|ka|ko|se|lakh|lac|lakhs|crore|crores|hazar|hazaar|hundred|thousand|sau|percent)$/;
    const isEnglishVerbDo =
      lower === 'do' &&
      !/kitna|karo|jodo|ghatao|\baur\b/i.test(input) &&
      !(nextToken !== null && MATH_NEIGHBOUR.test(nextToken)) &&
      !(prevToken !== null && /^(?:[+\-*/^x×÷]|plus|minus|times|into|guna|bhag|aur)$/.test(prevToken));

    // A digit (or decimal) directly followed by a magnitude word starts a spoken
    // number: "2 lakh" -> 200000, "1.5 crore" -> 15000000, "3 hundred" -> 300
    if (
      /^\d+(?:\.\d+)?$/.test(rawToken) &&
      nextToken !== null &&
      Object.prototype.hasOwnProperty.call(MAGNITUDE_WORDS, nextToken)
    ) {
      const val = parseFloat(rawToken);
      if (!inNumberSequence) {
        inNumberSequence = true;
        currentGroup = val;
        continue;
      }
      const currentAccum = currentTotal + currentGroup;
      if (Number.isInteger(val) && canMergeCompoundNumbers(currentAccum, val)) {
        currentGroup += val;
        continue;
      }
    }

    if (!isEnglishVerbDo && Object.prototype.hasOwnProperty.call(SMALL_NUMBER_WORDS, lower)) {
      const val = SMALL_NUMBER_WORDS[lower];
      if (inNumberSequence) {
        currentGroup += val;
      } else {
        inNumberSequence = true;
        currentGroup = val;
      }
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(MAGNITUDE_WORDS, lower)) {
      const mag = MAGNITUDE_WORDS[lower];
      if (!inNumberSequence) {
        inNumberSequence = true;
        currentGroup = 1;
      }
      if (mag === 100) {
        currentGroup = (currentGroup === 0 ? 1 : currentGroup) * 100;
      } else {
        currentTotal += (currentGroup === 0 ? 1 : currentGroup) * mag;
        currentGroup = 0;
      }
      continue;
    }

    // Handle "and" / "aur" within a spoken number sequence (e.g. "three hundred and ten", "two thousand and fifty")
    if (inNumberSequence && (lower === 'and' || lower === 'aur')) {
      let nextWord: string | null = null;
      for (let j = i + 1; j < tokens.length; j++) {
        const t = tokens[j]?.trim();
        if (t) {
          nextWord = t.toLowerCase();
          break;
        }
      }
      if (nextWord) {
        let nextVal: number | null = null;
        if (Object.prototype.hasOwnProperty.call(SMALL_NUMBER_WORDS, nextWord)) {
          nextVal = SMALL_NUMBER_WORDS[nextWord];
        } else if (Object.prototype.hasOwnProperty.call(MAGNITUDE_WORDS, nextWord)) {
          nextVal = MAGNITUDE_WORDS[nextWord];
        } else if (/^\d+$/.test(nextWord)) {
          nextVal = parseInt(nextWord, 10);
        }
        const currentAccum = currentTotal + currentGroup;
        if (
          nextVal !== null &&
          (canMergeCompoundNumbers(currentAccum, nextVal) ||
            Object.prototype.hasOwnProperty.call(MAGNITUDE_WORDS, nextWord))
        ) {
          continue;
        }
      }
    }

    // Handle numeric digits adjacent to/within a spoken sequence (e.g. "three hundred 10" or "300 ten")
    if (/^\d+$/.test(rawToken)) {
      const val = parseInt(rawToken, 10);
      if (inNumberSequence) {
        const currentAccum = currentTotal + currentGroup;
        if (canMergeCompoundNumbers(currentAccum, val)) {
          currentGroup += val;
          continue;
        }
      }
    }

    if (inNumberSequence) {
      flushNumber();
      result.push(' ');
    }
    result.push(rawToken);
  }

  flushNumber();
  const rawJoined = result.join('').replace(/\s+/g, ' ').trim();
  return mergeCompoundSpokenNumbers(rawJoined);
}

export class NLFallbackParser {
  /**
   * Parses natural language voice/text command into a validated StructuredAIIntent.
   */
  public parse(
    rawCommand: string,
    context: ConversationContext
  ): StructuredAIIntent {
    if (!rawCommand || !rawCommand.trim()) {
      return {
        intent: 'clarification',
        requires_clarification: true,
        clarification_question:
          "I didn't catch that. What would you like me to calculate?",
      };
    }

    const cleanedRaw = rawCommand.trim();

    // Check for context reset commands
    if (
      /^(?:clear|reset|start over|clear context|new calculation|cancel)$/i.test(
        cleanedRaw
      )
    ) {
      return {
        intent: 'context_reset',
        requires_clarification: false,
        response_text: 'Calculation context cleared.',
      };
    }

    // Normalize spoken numbers and Hinglish phrases
    const normalizedText = this.normalizeHinglishAndWords(cleanedRaw);

    // Voice Control Commands (Clear, Undo, Copy, Repeat, Memory slots)
    const voiceControlIntent = this.tryParseVoiceControl(
      cleanedRaw,
      context
    );
    if (voiceControlIntent) {
      return voiceControlIntent;
    }

    // 0. Check if resolving a pending clarification from the previous turn
    if (context.pendingClarification) {
      const resolved = this.tryResolveClarification(
        normalizedText,
        context.pendingClarification
      );
      if (resolved) {
        return resolved;
      }
    }

    // 1. Check Currency Conversion first (so "100 dollars to rupees" doesn't collide with unit conversion)
    const currencyIntent = this.tryParseCurrency(normalizedText);
    if (currencyIntent) {
      return currencyIntent;
    }

    // 2. Check Unit Conversion ("Convert 5 kilometers to meters", "How many grams are in 2 kilograms?", "Convert 10 Mbps to MB per second")
    const unitIntent = this.tryParseUnitConversion(normalizedText);
    if (unitIntent) {
      return unitIntent;
    }

    // 3. Check Smart Everyday Calculations (GST, Discount, Tip, Split bill, Spend/Remaining, Bought items)
    const everydayIntent = this.tryParseEverydayMath(normalizedText, context);
    if (everydayIntent) {
      return everydayIntent;
    }

    // 4. Check Percentages ("What is 15 percent of 800?", "Add 10% to 500")
    const percentageIntent = this.tryParsePercentage(normalizedText, context);
    if (percentageIntent) {
      return percentageIntent;
    }

    // 5. Check Ambiguous / Incomplete single-operand commands ("Calculate 20", "Divide 10", "Multiply 5")
    const ambiguityIntent = this.tryDetectAmbiguity(normalizedText, context);
    if (ambiguityIntent) {
      return ambiguityIntent;
    }

    // 6. Check Contextual Follow-ups ("Now add 50", "Multiply that by 3", "Divide the answer by 2")
    const contextIntent = this.tryParseContextualFollowUp(
      normalizedText,
      context
    );
    if (contextIntent) {
      return contextIntent;
    }

    // 7. Check Advanced Single/Binary Functions (Square root, Cube root, Power, Factorial, Log, Ln, Abs, Trig)
    const advancedIntent = this.tryParseAdvancedMath(normalizedText, context);
    if (advancedIntent) {
      return advancedIntent;
    }

    // 8. Check Natural Language Phrased Arithmetic ("Add 25 and 30", "Subtract 35 from 100", "Take 35 away from 100", "12 into 8", "100 over 4")
    const naturalBasicIntent = this.tryParseNaturalArithmetic(normalizedText);
    if (naturalBasicIntent) {
      return naturalBasicIntent;
    }

    // 9. Check General Mathematical Expression (with brackets, order of operations, multiple operators)
    const exprIntent = this.tryParseGeneralExpression(normalizedText, context);
    if (exprIntent) {
      return exprIntent;
    }

    return {
      intent: 'unsupported',
      operation: 'unknown',
      requires_clarification: false,
      response_text: "I couldn't understand that calculation.",
    };
  }

  private normalizeHinglishAndWords(text: string): string {
    // 1. Clean speech recognition punctuation artifacts (commas, trailing symbols, equals)
    let sanitized = text
      .replace(/,/g, ' ')
      .replace(/[?!;:=]+$/g, '')
      .replace(/\s*(=|equals?)\s*$/gi, '')
      .trim();

    // 2. Normalize spoken decimals: "2 point 5" -> "2.5", "दशमलव" -> "."
    sanitized = sanitized.replace(
      /(\d+)\s*(?:point|dot|dashamlav|दशमलव)\s*(\d+)/gi,
      '$1.$2'
    );

    let s = replaceSpokenNumbers(sanitized);

    // Strip conversational greetings, filler words, polite requests, etc.
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
      'um', 'uh', 'hmm', 'ah', 'oh', 'like', 'actually', 'basically', 'literally', 'so', 'well', 'anyway', 'then',
      'bro', 'bhai', 'dude', 'man', 'boss', 'sir', 'madam', 'buddy', 'friend', 'mate',
      'arre', 'suno', 'bata', 'batao', 'yaar', 'haan', 'nahi', 'acha', 'thik', 'theek',
      'wait', 'hold', 'stop',
    ];

    for (const word of NOISE_WORDS) {
      s = s.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
    }

    s = s.replace(/\s+/g, ' ').trim();

    // 3. Normalize Hindi percentages & everyday operations
    // "1500 pe 20% discount lagao" -> "20 percent discount on 1500"
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:pe|par|mein|me|on)?\s*(-?\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|प्रतिशत)\s*(?:discount|off)(?:\s+(?:lagao|karo|nikaalo|nikalo|hatao|ghatao))?/gi,
      '$2 percent discount on $1'
    );
    // "1000 par 18% gst" / "1000 mein 18 percent GST add karo" -> "18 percent gst on 1000"
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:pe|par|mein|me|on)?\s*(-?\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|प्रतिशत)\s*gst(?:\s+(?:add\s*karo|lagao|jodo|karo|nikaalo|nikalo))?/gi,
      '$2 percent gst on $1'
    );
    // "500 ka 10 percent" / "500 ka 10%" -> "10 percent of 500"
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ka\s+(-?\d+(?:\.\d+)?)\s*(?:percent|pratishat|प्रतिशत|%)/gi,
      '$2 percent of $1'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:par|pe)\s+(-?\d+(?:\.\d+)?)\s*(?:percent|pratishat|प्रतिशत|%)(?!\s*(?:discount|off|gst))/gi,
      '$2 percent of $1'
    );

    // Hinglish contextual follow-ups:
    // "jo answer aya usme 50 add karo" / "usme 50 jodo" -> "add 50 to that"
    s = s.replace(
      /(?:jo\s+(?:answer|uttar|result)\s+(?:aya|aaya)\s+(?:hai\s+)?)?(?:usme|usmein|isme|ismein)\s+(-?\d+(?:\.\d+)?)\s+(?:add\s*karo|plus\s*karo|jodo|jod\s*do|add)/gi,
      'add $1 to that'
    );
    // "jo answer aya usme se 50 minus karo" / "usme se 50 ghatao" -> "subtract 50 from that"
    s = s.replace(
      /(?:jo\s+(?:answer|uttar|result)\s+(?:aya|aaya)\s+(?:hai\s+)?)?(?:usme|usmein|isme|ismein)\s+se\s+(-?\d+(?:\.\d+)?)\s+(?:minus\s*karo|subtract\s*karo|ghatao|kam\s*karo|minus)/gi,
      'subtract $1 from that'
    );
    // "jo answer aya usko 3 se multiply karo" -> "multiply that by 3"
    s = s.replace(
      /(?:jo\s+(?:answer|uttar|result)\s+(?:aya|aaya)\s+(?:hai\s+)?)?(?:usko|isko)\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:multiply\s*karo|guna\s*karo|multiply|guna)/gi,
      'multiply that by $1'
    );
    // "jo answer aya usko 2 se divide karo" -> "divide that by 2"
    s = s.replace(
      /(?:jo\s+(?:answer|uttar|result)\s+(?:aya|aaya)\s+(?:hai\s+)?)?(?:usko|isko)\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:divide\s*karo|bhaag\s*karo|bhag\s*karo|divide|bhaag)/gi,
      'divide that by $1'
    );

    // 4. Powers & roots variations
    s = s.replace(/(?:square\s+of)\s+(-?\d+(?:\.\d+)?)/gi, '$1 squared');
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+square/gi, '$1 squared');
    s = s.replace(/(?:cube\s+of)\s+(-?\d+(?:\.\d+)?)/gi, '$1 cubed');
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+cube/gi, '$1 cubed');
    s = s.replace(/(?:cube\s+root)\s+(?:of\s+)?(-?\d+(?:\.\d+)?)/gi, 'cbrt $1');
    s = s.replace(
      /(?<!\bcube\s+)(?:under\s*root|\broot)\s+(?:of\s+)?(-?\d+(?:\.\d+)?)/gi,
      'sqrt $1'
    );

    // 5. Fractions / multipliers: half, double, triple
    s = s.replace(
      /(?:half\s+of|aadha\s+of)\s+(-?\d+(?:\.\d+)?)/gi,
      'divide $1 by 2'
    );
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+aadha/gi, 'divide $1 by 2');
    s = s.replace(
      /(?:double\s+of|twice\s+of)\s+(-?\d+(?:\.\d+)?)/gi,
      'multiply $1 by 2'
    );
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+double/gi, 'multiply $1 by 2');
    s = s.replace(
      /(?:triple\s+of|thrice\s+of)\s+(-?\d+(?:\.\d+)?)/gi,
      'multiply $1 by 3'
    );
    s = s.replace(/(-?\d+(?:\.\d+)?)\s+ka\s+triple/gi, 'multiply $1 by 3');

    // 6. Hinglish arithmetic phrasing patterns
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ko\s+(-?\d+(?:\.\d+)?)\s+se\s+divide\s*(?:karo)?/gi,
      'divide $1 by $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ko\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:bhaag|bhag)\s*(?:karo|do)?/gi,
      'divide $1 by $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+ko\s+(-?\d+(?:\.\d+)?)\s+se\s+(?:multiply|guna)\s*(?:karo)?/gi,
      'multiply $1 by $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+mein\s+se\s+(-?\d+(?:\.\d+)?)\s+(?:minus|subtract|ghatao|kam)\s*(?:karo)?/gi,
      '$1 minus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+me\s+se\s+(-?\d+(?:\.\d+)?)\s*(?:ghatao|minus|kam\s*karo)?/gi,
      '$1 minus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+mein\s+(-?\d+(?:\.\d+)?)\s+(?:add|plus|jodo)\s*(?:karo)?/gi,
      '$1 plus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+me\s+(-?\d+(?:\.\d+)?)\s+(?:jodo|add\s*karo)/gi,
      '$1 plus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:aur|or|tatha)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 plus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:jod|jodo)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 plus $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:guna|gune)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 times $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:bhaag|bhag|bata|batte)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 divided by $2'
    );
    s = s.replace(
      /(-?\d+(?:\.\d+)?)\s+(?:ghata|ghatao)\s+(-?\d+(?:\.\d+)?)/gi,
      '$1 minus $2'
    );

    // Strip common conversational Hindi/Hinglish suffixes & prefixes
    s = s
      .replace(/\bkitna\s+hota\s+hai\b/gi, '')
      .replace(/\bkitne\s+hote\s+hain\b/gi, '')
      .replace(/\bkitna\s+hai\b/gi, '')
      .replace(/\bkitna\s+hoga\b/gi, '')
      .replace(/\bcalculate\s+karo\b/gi, '')
      .replace(/\blagao\b/gi, '')
      .replace(/\bbatao\b/gi, '')
      .replace(/\bkya\s+hai\b/gi, '');

    // Multilingual operational phrases:
    // Spanish
    s = s
      .replace(/\bpor\s+ciento\s+de\b/gi, 'percent of')
      .replace(/\bpor\s+ciento\b/gi, 'percent')
      .replace(/\bcuanto\s+es\b/gi, '')
      .replace(/\bcuánto\s+es\b/gi, '')
      .replace(/\bsuma\b/gi, 'add')
      .replace(/\bresta\b/gi, 'subtract')
      .replace(/\bmás\b/gi, 'plus')
      .replace(/\bmas\b/gi, 'plus')
      .replace(/\bmenos\b/gi, 'minus')
      .replace(/\bentre\b/gi, 'divided by')
      .replace(/\bconvierte\b/gi, 'convert')
      .replace(/\bkilometros\b/gi, 'kilometers')
      .replace(/\bkilómetros\b/gi, 'kilometers');

    // French
    s = s
      .replace(/\bpour\s+cent\s+de\b/gi, 'percent of')
      .replace(/\bpour\s+cent\b/gi, 'percent')
      .replace(/\bcombien\s+fait\b/gi, '')
      .replace(/\bajoute\b/gi, 'add')
      .replace(/\bdivisé\s+par\b/gi, 'divided by')
      .replace(/\bdivise\s+par\b/gi, 'divided by')
      .replace(/\bfois\b/gi, 'times')
      .replace(/\bmoins\b/gi, 'minus');

    // Hindi Devanagari operations
    s = s
      .replace(/\bजोड़ो\b/gi, 'plus')
      .replace(/\bघटाओ\b/gi, 'minus')
      .replace(/\bगुणा\b/gi, 'multiply')
      .replace(/\bभाग\b/gi, 'divide');

    return s.replace(/[?.!]+$/g, '').replace(/\s+/g, ' ').trim();
  }

  private tryParseVoiceControl(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    const trimmed = text.trim();

    // 1. Clear / Reset
    if (
      /^(?:clear|reset|start over|clear context|clear all|ac|all clear|hatao|saaf karo|cancel)$/i.test(
        trimmed
      )
    ) {
      return {
        intent: 'voice_control',
        voice_action: 'clear',
        requires_clarification: false,
        response_text: 'Cleared.',
      };
    }

    // 2. Undo
    if (
      /^(?:undo|cancel last|go back|revert|previous step|wapas lo|wapas)$/i.test(
        trimmed
      )
    ) {
      return {
        intent: 'voice_control',
        voice_action: 'undo',
        requires_clarification: false,
        response_text: 'Undone.',
      };
    }

    // 3. Copy
    if (
      /^(?:copy|copy that|copy result|copy answer|copy this)$/i.test(trimmed)
    ) {
      return {
        intent: 'voice_control',
        voice_action: 'copy',
        requires_clarification: false,
        response_text: context.lastFormattedResult
          ? `Copied ${context.lastFormattedResult} to clipboard.`
          : 'Nothing to copy.',
      };
    }

    // 4. Repeat
    if (
      /^(?:repeat|say again|say that again|what was the answer|speak again|tell me again)$/i.test(
        trimmed
      )
    ) {
      return {
        intent: 'voice_control',
        voice_action: 'repeat',
        requires_clarification: false,
        response_text: context.lastFormattedResult
          ? `The answer is ${context.lastFormattedResult}.`
          : 'No previous calculation.',
      };
    }

    // 5. Memory Save: "save this as rent", "store 5000 as rent", "remember 1200 as groceries"
    const memSave = trimmed.match(
      /^(?:save|store|remember)\s+(-?\d+(?:\.\d+)?|this|that|answer)\s+(?:as|in|to)\s+([a-zA-Z0-9_]+)$/i
    );
    if (memSave) {
      const targetValStr = memSave[1].toLowerCase();
      const key = memSave[2].toLowerCase();
      const val =
        targetValStr === 'this' ||
        targetValStr === 'that' ||
        targetValStr === 'answer'
          ? context.lastResult
          : Number(targetValStr);

      if (val === null || !Number.isFinite(val)) {
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What value would you like to save as ${key}?`,
        };
      }

      return {
        intent: 'voice_control',
        voice_action: 'memory_save',
        memory_key: key,
        value: val,
        requires_clarification: false,
        response_text: `Saved ${val} as ${key}.`,
      };
    }

    // 6. Memory Recall: "recall rent", "what is rent"
    const memRecall = trimmed.match(
      /^(?:recall|what is|get)\s+([a-zA-Z0-9_]+)$/i
    );
    if (memRecall) {
      const key = memRecall[1].toLowerCase();
      const val = context.memoryVariables?.[key];
      if (typeof val === 'number') {
        return {
          intent: 'voice_control',
          voice_action: 'memory_recall',
          memory_key: key,
          value: val,
          expression: String(val),
          requires_clarification: false,
          response_text: `${key} is ${val}.`,
        };
      }
    }

    return null;
  }

  private tryResolveClarification(
    text: string,
    pending: NonNullable<ConversationContext['pendingClarification']>
  ): StructuredAIIntent | null {
    // Match a reply like "2", "by 2", "with 5", "plus 10", "to meters"
    const singleNumMatch = text.match(
      /^(?:by|with|and|to|from)?\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (
      singleNumMatch &&
      pending.operation &&
      typeof pending.firstOperand === 'number'
    ) {
      const secondOperand = Number(singleNumMatch[1]);
      const first = pending.firstOperand;
      const op = pending.operation;
      const symbolMap: Record<string, string> = {
        addition: '+',
        subtraction: '-',
        multiplication: '*',
        division: '/',
        power: '^',
      };
      const sym = symbolMap[op] || '+';
      return {
        intent: 'calculate',
        operation: op,
        values: [first, secondOperand],
        expression: `${first} ${sym} ${secondOperand}`,
        requires_clarification: false,
      };
    }

    // If pending clarification was "What would you like me to calculate with 20?" and user says "multiply by 5" or "add 10"
    if (typeof pending.firstOperand === 'number') {
      const followUpOnPending = this.tryParseContextualFollowUp(text, {
        lastResult: pending.firstOperand,
        lastFormattedResult: String(pending.firstOperand),
        lastExpression: String(pending.firstOperand),
        lastUnit: null,
        pendingClarification: null,
        recentTurns: [],
      });
      if (followUpOnPending) {
        return followUpOnPending;
      }
    }

    return null;
  }

  private tryParseCurrency(text: string): StructuredAIIntent | null {
    // Patterns:
    // "Convert 100 dollars to rupees"
    // "How much is 50 euros in INR"
    // "100 USD to INR"
    const patterns = [
      /(?:convert|change)?\s*(-?\d+(?:\.\d+)?)\s+([a-zA-Z$€£¥₹]+(?:\s+dollars?|\s+rupees?|\s+pounds?)?)\s+(?:to|in|into)\s+([a-zA-Z$€£¥₹]+(?:\s+dollars?|\s+rupees?|\s+pounds?)?)$/i,
      /how\s+(?:much|many)\s+([a-zA-Z$€£¥₹]+)\s+(?:is|are|in)\s+(-?\d+(?:\.\d+)?)\s+([a-zA-Z$€£¥₹]+)$/i,
    ];

    const m1 = text.match(patterns[0]);
    if (m1) {
      const val = Number(m1[1]);
      const fromCode = currencyService.normalizeCurrencyCode(m1[2]);
      const toCode = currencyService.normalizeCurrencyCode(m1[3]);
      if (fromCode && toCode) {
        return {
          intent: 'currency',
          operation: 'currency_conversion',
          value: val,
          from_currency: fromCode,
          to_currency: toCode,
          requires_clarification: false,
        };
      }
    }

    const m2 = text.match(patterns[1]);
    if (m2) {
      const toCode = currencyService.normalizeCurrencyCode(m2[1]);
      const val = Number(m2[2]);
      const fromCode = currencyService.normalizeCurrencyCode(m2[3]);
      if (fromCode && toCode) {
        return {
          intent: 'currency',
          operation: 'currency_conversion',
          value: val,
          from_currency: fromCode,
          to_currency: toCode,
          requires_clarification: false,
        };
      }
    }

    return null;
  }

  private tryParseUnitConversion(text: string): StructuredAIIntent | null {
    // Pattern A: "Convert 5 kilometers to meters" / "10 Mbps to MB per second" / "100 Fahrenheit to Celsius"
    const directMatch = text.match(
      /^(?:convert|change|what\s+is)?\s*(-?\d+(?:\.\d+)?)\s*(?:degrees?\s+)?([a-zA-Z°²³\/]+(?:\s+per\s+[a-zA-Z]+|\s+miles?|\s+meters?|\s+ounces?|\s+tons?)?)\s+(?:to|in|into)\s+(?:degrees?\s+)?([a-zA-Z°²³\/]+(?:\s+per\s+[a-zA-Z]+|\s+miles?|\s+meters?|\s+ounces?|\s+tons?)?)$/i
    );
    if (directMatch) {
      const val = Number(directMatch[1]);
      const rawFrom = directMatch[2].trim();
      const rawTo = directMatch[3].trim();
      const fromDef = conversionService.resolveUnit(rawFrom);
      const toDef = conversionService.resolveUnit(rawTo);
      if (fromDef && toDef) {
        return {
          intent: 'conversion',
          operation: 'unit_conversion',
          value: val,
          from_unit: rawFrom,
          to_unit: rawTo,
          requires_clarification: false,
        };
      }
    }

    // Pattern B: "How many grams are in 2 kilograms?" / "How many liters are 5000 milliliters?" / "How many seconds are in 3 hours?"
    const howManyMatch = text.match(
      /^how\s+many\s+([a-zA-Z°²³\/]+(?:\s+per\s+[a-zA-Z]+)?)\s+(?:are\s+in|are\s+there\s+in|is\s+in|are|in)\s+(-?\d+(?:\.\d+)?)\s*([a-zA-Z°²³\/]+(?:\s+per\s+[a-zA-Z]+)?)$/i
    );
    if (howManyMatch) {
      const rawTo = howManyMatch[1].trim();
      const val = Number(howManyMatch[2]);
      const rawFrom = howManyMatch[3].trim();
      const fromDef = conversionService.resolveUnit(rawFrom);
      const toDef = conversionService.resolveUnit(rawTo);
      if (fromDef && toDef) {
        return {
          intent: 'conversion',
          operation: 'unit_conversion',
          value: val,
          from_unit: rawFrom,
          to_unit: rawTo,
          requires_clarification: false,
        };
      }
    }

    // Ambiguous unit conversion: "Convert 5 kilometers" (missing target unit)
    const incompleteConv = text.match(
      /^convert\s+(-?\d+(?:\.\d+)?)\s+([a-zA-Z]+)$/i
    );
    if (incompleteConv) {
      const val = Number(incompleteConv[1]);
      const rawFrom = incompleteConv[2];
      if (
        conversionService.resolveUnit(rawFrom) ||
        currencyService.normalizeCurrencyCode(rawFrom)
      ) {
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What unit would you like me to convert ${val} ${rawFrom} into?`,
        };
      }
    }

    return null;
  }

  private tryParseEverydayMath(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    // 1. GST:
    // "What is 18 percent GST on 2500?" / "18 percent GST on 1000" / "Add 18 percent GST to 2500"
    // Note: Section 27 specifies: Input: "18 percent GST on 1000" -> Expected: 1180
    const gstMatch = text.match(
      /(?:what\s+is|add|calculate)?\s*(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s*gst\s*(?:on|to|for|of)\s*(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)/i
    );
    if (gstMatch) {
      const rate = Number(gstMatch[1]);
      const base = Number(gstMatch[2]);
      const onlyTaxAmount = /\bgst\s+amount\s+only\b/i.test(text);
      return {
        intent: 'everyday',
        operation: onlyTaxAmount ? 'gst_amount' : 'gst_inclusive',
        values: [rate, base],
        expression: onlyTaxAmount
          ? `${rate} / 100 * ${base}`
          : `${base} + (${rate} / 100 * ${base})`,
        requires_clarification: false,
      };
    }

    // 2. Discount:
    // "20 percent discount on 1500"
    // "What is the final price after 20 percent discount on 1500?"
    // "What is the final price after 20 percent discount?" (uses context.lastResult)
    const discountMatch = text.match(
      /(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s*(?:discount|off)\s*(?:on|from|of)?\s*(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)?/i
    );
    if (discountMatch) {
      const pct = Number(discountMatch[1]);
      const explicitBase =
        discountMatch[2] !== undefined ? Number(discountMatch[2]) : null;
      const base = explicitBase ?? context.lastResult;
      if (base === null) {
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What is the original price to apply the ${pct} percent discount to?`,
        };
      }
      return {
        intent: 'everyday',
        operation: 'discount',
        values: [pct, base],
        expression: `${base} - (${pct} / 100 * ${base})`,
        uses_previous_result: explicitBase === null,
        requires_clarification: false,
      };
    }

    // 3. Tip:
    // "What is a 15 percent tip on 1200?" / "Add 15 percent tip to 1200"
    const tipMatch = text.match(
      /(?:(add)\s+)?(?:what\s+is\s+)?(?:a\s+)?(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s*tip\s*(?:on|to|for)\s*(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)/i
    );
    if (tipMatch) {
      const isAddTotal = Boolean(tipMatch[1]) || /total\s+with\s+tip/i.test(text);
      const pct = Number(tipMatch[2]);
      const bill = Number(tipMatch[3]);
      return {
        intent: 'everyday',
        operation: isAddTotal ? 'tip_total' : 'tip',
        values: [pct, bill],
        expression: isAddTotal
          ? `${bill} + (${pct} / 100 * ${bill})`
          : `${pct} / 100 * ${bill}`,
        requires_clarification: false,
      };
    }

    // 4. Split bill:
    // "Split 2500 between 5 people" / "Split 2500 among 5"
    const splitMatch = text.match(
      /split\s+(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)\s+(?:between|among|into|for|by)\s+(-?\d+(?:\.\d+)?)(?:\s+people|\s+persons|\s+friends|\s+ways)?/i
    );
    if (splitMatch) {
      const total = Number(splitMatch[1]);
      const count = Number(splitMatch[2]);
      return {
        intent: 'everyday',
        operation: 'split_bill',
        values: [total, count],
        expression: `${total} / ${count}`,
        requires_clarification: false,
      };
    }

    // 5. Spending / Remaining balance:
    // "If I have 1000 and spend 275, how much is left?" / "I have 1000 and spend 275"
    const spendMatch = text.match(
      /(?:if\s+)?i\s+have\s+(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)\s+and\s+(?:i\s+)?(?:spend|spent|pay|paid|use|give)\s+(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)/i
    );
    if (spendMatch) {
      const initial = Number(spendMatch[1]);
      const spent = Number(spendMatch[2]);
      return {
        intent: 'everyday',
        operation: 'remaining_balance',
        values: [initial, spent],
        expression: `${initial} - ${spent}`,
        requires_clarification: false,
      };
    }

    // 6. Multi-item purchase:
    // "I bought 3 items for 250 each, what's the total?"
    const itemsMatch = text.match(
      /(?:bought|buy|purchased|got)\s+(-?\d+(?:\.\d+)?)\s+[a-zA-Z]+\s+(?:for|at)\s+(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?)\s+each/i
    );
    if (itemsMatch) {
      const count = Number(itemsMatch[1]);
      const price = Number(itemsMatch[2]);
      return {
        intent: 'everyday',
        operation: 'item_total',
        values: [count, price],
        expression: `${count} * ${price}`,
        requires_clarification: false,
      };
    }

    return null;
  }

  private tryParsePercentage(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    // "What is 15 percent of 800?" / "25% of 800" / "15 percent of that"
    const pctOfMatch = text.match(
      /(?:what\s+is|what's|calculate|find)?\s*(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s+of\s+(?:rs\.?|₹|\$)?\s*(-?\d+(?:\.\d+)?|that|it|the\s+answer|previous\s+result)$/i
    );
    if (pctOfMatch) {
      const pct = Number(pctOfMatch[1]);
      const targetRaw = pctOfMatch[2].toLowerCase();
      const isContextual = /that|it|answer|previous/.test(targetRaw);
      const base = isContextual ? context.lastResult : Number(targetRaw);

      if (base === null || !Number.isFinite(base)) {
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What number would you like me to find ${pct} percent of?`,
        };
      }

      return {
        intent: 'percentage',
        operation: 'percentage_of',
        values: [pct, base],
        expression: `${pct} / 100 * ${base}`,
        uses_previous_result: isContextual,
        requires_clarification: false,
      };
    }

    // Direct arithmetic percentage patterns: "500 + 10%", "500 plus 10 percent", "500 - 20%", "500 minus 20 percent"
    const directAddPct = text.match(
      /(-?\d+(?:\.\d+)?)\s*(?:\+|\bplus\b)\s*(-?\d+(?:\.\d+)?)\s*(?:%|\bpercent\b|\bpercentage\b)/i
    );
    if (directAddPct) {
      const base = Number(directAddPct[1]);
      const pct = Number(directAddPct[2]);
      return {
        intent: 'percentage',
        operation: 'percentage_add',
        values: [pct, base],
        expression: `${base} + (${pct} / 100 * ${base})`,
        requires_clarification: false,
      };
    }

    const directSubPct = text.match(
      /(-?\d+(?:\.\d+)?)\s*(?:-|\bminus\b)\s*(-?\d+(?:\.\d+)?)\s*(?:%|\bpercent\b|\bpercentage\b)/i
    );
    if (directSubPct) {
      const base = Number(directSubPct[1]);
      const pct = Number(directSubPct[2]);
      return {
        intent: 'percentage',
        operation: 'percentage_subtract',
        values: [pct, base],
        expression: `${base} - (${pct} / 100 * ${base})`,
        requires_clarification: false,
      };
    }

    // Contextual percentage chaining: "plus 10 percent", "+ 10%", "minus 20%", "less 20 percent"
    const contextualAddPct = text.match(
      /^(?:\+|\bplus\b|\badd\b)\s*(-?\d+(?:\.\d+)?)\s*(?:%|\bpercent\b|\bpercentage\b)(?:\s+(?:to\s+that|to\s+it))?$/i
    );
    if (contextualAddPct && context.lastResult !== null) {
      const base = context.lastResult;
      const pct = Number(contextualAddPct[1]);
      return {
        intent: 'percentage',
        operation: 'percentage_add',
        values: [pct, base],
        expression: `${base} + (${pct} / 100 * ${base})`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const contextualSubPct = text.match(
      /^(?:-|\bminus\b|\bsubtract\b|\bless\b)\s*(-?\d+(?:\.\d+)?)\s*(?:%|\bpercent\b|\bpercentage\b)(?:\s+(?:from\s+that|from\s+it))?$/i
    );
    if (contextualSubPct && context.lastResult !== null) {
      const base = context.lastResult;
      const pct = Number(contextualSubPct[1]);
      return {
        intent: 'percentage',
        operation: 'percentage_subtract',
        values: [pct, base],
        expression: `${base} - (${pct} / 100 * ${base})`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    // "Add 15 percent to 800" / "Increase 800 by 15 percent"
    const addPctMatch =
      text.match(
        /add\s+(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s+to\s+(-?\d+(?:\.\d+)?)/i
      ) ||
      text.match(
        /increase\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)/i
      );
    if (addPctMatch) {
      const isIncreaseFirst = /^increase/i.test(text);
      const pct = Number(isIncreaseFirst ? addPctMatch[2] : addPctMatch[1]);
      const base = Number(isIncreaseFirst ? addPctMatch[1] : addPctMatch[2]);
      return {
        intent: 'percentage',
        operation: 'percentage_add',
        values: [pct, base],
        expression: `${base} + (${pct} / 100 * ${base})`,
        requires_clarification: false,
      };
    }

    // "Reduce 800 by 15 percent" / "Subtract 15 percent from 800"
    const subPctMatch =
      text.match(
        /subtract\s+(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)\s+from\s+(-?\d+(?:\.\d+)?)/i
      ) ||
      text.match(
        /(?:reduce|decrease)\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)\s*(?:%|percent|percentage)/i
      );
    if (subPctMatch) {
      const isReduceFirst = /^(?:reduce|decrease)/i.test(text);
      const pct = Number(isReduceFirst ? subPctMatch[2] : subPctMatch[1]);
      const base = Number(isReduceFirst ? subPctMatch[1] : subPctMatch[2]);
      return {
        intent: 'percentage',
        operation: 'percentage_subtract',
        values: [pct, base],
        expression: `${base} - (${pct} / 100 * ${base})`,
        requires_clarification: false,
      };
    }

    return null;
  }

  private tryDetectAmbiguity(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    // "Calculate 20" or "What is 20" (just a single number with no operation)
    const singleNumberCalc = text.match(
      /^(?:calculate|compute|solve|evaluate)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (singleNumberCalc) {
      const num = Number(singleNumberCalc[1]);
      return {
        intent: 'clarification',
        requires_clarification: true,
        clarification_question: `What would you like me to calculate with ${num}?`,
        pending_operation: {
          operation: 'unknown',
          first_operand: num,
        },
      };
    }

    // "Divide 10" / "10 divided by"
    const incompleteDivide = text.match(
      /^(?:divide\s+(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)\s+divided\s+by)$/i
    );
    if (incompleteDivide) {
      const num = Number(incompleteDivide[1] ?? incompleteDivide[2]);
      return {
        intent: 'clarification',
        requires_clarification: true,
        clarification_question: `What number should I divide ${num} by?`,
        pending_operation: {
          operation: 'division',
          first_operand: num,
        },
      };
    }

    // "Multiply 10" / "10 multiplied by" / "10 times"
    const incompleteMultiply = text.match(
      /^(?:multiply\s+(-?\d+(?:\.\d+)?)|(-?\d+(?:\.\d+)?)\s+(?:multiplied\s+by|times))$/i
    );
    if (incompleteMultiply) {
      const num = Number(incompleteMultiply[1] ?? incompleteMultiply[2]);
      return {
        intent: 'clarification',
        requires_clarification: true,
        clarification_question: `What number should I multiply ${num} by?`,
        pending_operation: {
          operation: 'multiplication',
          first_operand: num,
        },
      };
    }

    // "Percent of 500" / "What percent of 500" (missing percentage rate)
    const incompletePercentOf = text.match(
      /^(?:what\s+is\s+)?(?:%|percent|percentage)\s+of\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (incompletePercentOf) {
      const base = Number(incompletePercentOf[1]);
      return {
        intent: 'clarification',
        requires_clarification: true,
        clarification_question: `What percentage of ${base} would you like to calculate?`,
        pending_operation: {
          operation: 'percentage_of',
          first_operand: base,
        },
      };
    }

    // "Add 50" / "Subtract 20" / "Multiply by 3" / "Divide by 3" ONLY when there is NO previous result in context
    if (context.lastResult === null) {
      const incompleteMultBy = text.match(
        /^(?:now\s+|then\s+)?(?:multiply|multiplied|times)\s+by\s+(-?\d+(?:\.\d+)?)$/i
      );
      if (incompleteMultBy) {
        const num = Number(incompleteMultBy[1]);
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What number should I multiply by ${num}?`,
          pending_operation: {
            operation: 'multiplication',
            first_operand: num,
          },
        };
      }

      const incompleteDivBy = text.match(
        /^(?:now\s+|then\s+)?(?:divide|divided)\s+by\s+(-?\d+(?:\.\d+)?)$/i
      );
      if (incompleteDivBy) {
        const num = Number(incompleteDivBy[1]);
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What number should I divide by ${num}?`,
          pending_operation: {
            operation: 'division',
            first_operand: num,
          },
        };
      }

      const incompleteAdd = text.match(
        /^(?:now\s+|then\s+)?(?:add|plus)\s+(-?\d+(?:\.\d+)?)$/i
      );
      if (incompleteAdd) {
        const num = Number(incompleteAdd[1]);
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What number should I add ${num} to?`,
          pending_operation: {
            operation: 'addition',
            first_operand: num,
          },
        };
      }

      const incompleteSub = text.match(
        /^(?:now\s+|then\s+)?(?:subtract|minus|take\s+away)\s+(-?\d+(?:\.\d+)?)$/i
      );
      if (incompleteSub) {
        const num = Number(incompleteSub[1]);
        return {
          intent: 'clarification',
          requires_clarification: true,
          clarification_question: `What number should I subtract ${num} from?`,
          pending_operation: {
            operation: 'subtraction',
            first_operand: num,
          },
        };
      }
    }

    return null;
  }

  private tryParseContextualFollowUp(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    if (context.lastResult === null) return null;
    const prev = context.lastResult;

    // 1. Explicit pronoun references:
    // "multiply that by 3", "divide it by 2", "add 50 to that", "subtract 10 from the answer"
    const multThat = text.match(
      /^(?:now\s+|then\s+)?(?:multiply|times)\s+(?:that|it|the\s+answer|previous\s+result)\s+(?:by|with)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (multThat) {
      const b = Number(multThat[1]);
      return {
        intent: 'calculate',
        operation: 'multiplication',
        values: [prev, b],
        expression: `${prev} * ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const divThat = text.match(
      /^(?:now\s+|then\s+)?divide\s+(?:that|it|the\s+answer|previous\s+result)\s+by\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (divThat) {
      const b = Number(divThat[1]);
      return {
        intent: 'calculate',
        operation: 'division',
        values: [prev, b],
        expression: `${prev} / ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const addToThat = text.match(
      /^(?:now\s+|then\s+)?add\s+(-?\d+(?:\.\d+)?)\s+to\s+(?:that|it|the\s+answer|previous\s+result)$/i
    );
    if (addToThat) {
      const b = Number(addToThat[1]);
      return {
        intent: 'calculate',
        operation: 'addition',
        values: [prev, b],
        expression: `${prev} + ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const subFromThat = text.match(
      /^(?:now\s+|then\s+)?(?:subtract|take\s+away|minus)\s+(-?\d+(?:\.\d+)?)\s+from\s+(?:that|it|the\s+answer|previous\s+result)$/i
    );
    if (subFromThat) {
      const b = Number(subFromThat[1]);
      return {
        intent: 'calculate',
        operation: 'subtraction',
        values: [prev, b],
        expression: `${prev} - ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    // 2. Leading operator follow-ups:
    // "Now add 50", "Plus 50", "Minus 20", "Subtract 20", "Multiply by 3", "Times 3", "Divide by 4", "Divided by 4"
    const leadingAdd = text.match(
      /^(?:now\s+|then\s+|and\s+)?(?:add|plus|\+|increase\s+by)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (leadingAdd) {
      const b = Number(leadingAdd[1]);
      return {
        intent: 'calculate',
        operation: 'addition',
        values: [prev, b],
        expression: `${prev} + ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const leadingSub = text.match(
      /^(?:now\s+|then\s+|and\s+)?(?:subtract|minus|-|take\s+away|reduce\s+by)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (leadingSub) {
      const b = Number(leadingSub[1]);
      return {
        intent: 'calculate',
        operation: 'subtraction',
        values: [prev, b],
        expression: `${prev} - ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const leadingMult = text.match(
      /^(?:now\s+|then\s+|and\s+)?(?:multiply(?:\s+by)?|multiplied\s+by|times|\*|×|into)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (leadingMult) {
      const b = Number(leadingMult[1]);
      return {
        intent: 'calculate',
        operation: 'multiplication',
        values: [prev, b],
        expression: `${prev} * ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    const leadingDiv = text.match(
      /^(?:now\s+|then\s+|and\s+)?(?:divide\s+by|divided\s+by|\/|÷|over)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (leadingDiv) {
      const b = Number(leadingDiv[1]);
      return {
        intent: 'calculate',
        operation: 'division',
        values: [prev, b],
        expression: `${prev} / ${b}`,
        uses_previous_result: true,
        requires_clarification: false,
      };
    }

    return null;
  }

  private tryParseAdvancedMath(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    const resolveOperand = (raw: string): number | null => {
      if (/^(?:that|it|the\s+answer|previous\s+result)$/i.test(raw.trim())) {
        return context.lastResult;
      }
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };

    // Square root: "Square root of 144" / "sqrt 144"
    const sqrtMatch = text.match(
      /(?:what\s+is\s+)?(?:the\s+)?(?:square\s+root\s+(?:of\s+)?|sqrt\s*\(?|√\s*\(?)(-?\d+(?:\.\d+)?|that|it)\)?$/i
    );
    if (sqrtMatch) {
      const val = resolveOperand(sqrtMatch[1]);
      if (val !== null) {
        return {
          intent: 'calculate',
          operation: 'square_root',
          values: [val],
          value: val,
          expression: `sqrt(${val})`,
          requires_clarification: false,
        };
      }
    }

    // Cube root: "Cube root of 27" / "cbrt 27"
    const cbrtMatch = text.match(
      /(?:what\s+is\s+)?(?:the\s+)?(?:cube\s+root\s+(?:of\s+)?|cbrt\s*\(?|∛\s*\(?)(-?\d+(?:\.\d+)?|that|it)\)?$/i
    );
    if (cbrtMatch) {
      const val = resolveOperand(cbrtMatch[1]);
      if (val !== null) {
        return {
          intent: 'calculate',
          operation: 'cube_root',
          values: [val],
          value: val,
          expression: `cbrt(${val})`,
          requires_clarification: false,
        };
      }
    }

    // Powers: "2 to the power of 10", "2 raised to the power of 10", "2 raised to 10", "2 power 10"
    const powerMatch = text.match(
      /(?:what\s+is\s+|calculate\s+)?(-?\d+(?:\.\d+)?|that|it)\s+(?:raised\s+to\s+the\s+power\s+of|to\s+the\s+power\s+of|raised\s+to\s+power|to\s+the\s+power|raised\s+to|power\s+of|power|\^)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (powerMatch) {
      const base = resolveOperand(powerMatch[1]);
      const exp = Number(powerMatch[2]);
      if (base !== null && Number.isFinite(exp)) {
        return {
          intent: 'calculate',
          operation: 'power',
          values: [base, exp],
          expression: `${base}^${exp}`,
          requires_clarification: false,
        };
      }
    }

    // Squared / Cubed: "12 squared", "5 cubed"
    const sqCubeMatch = text.match(
      /(?:what\s+is\s+|calculate\s+)?(-?\d+(?:\.\d+)?|that|it)\s+(squared|cubed)$/i
    );
    if (sqCubeMatch) {
      const base = resolveOperand(sqCubeMatch[1]);
      const exp = sqCubeMatch[2].toLowerCase() === 'squared' ? 2 : 3;
      if (base !== null) {
        return {
          intent: 'calculate',
          operation: 'power',
          values: [base, exp],
          expression: `${base}^${exp}`,
          requires_clarification: false,
        };
      }
    }

    // Factorial: "5 factorial" / "factorial of 5" / "5!"
    const factMatch =
      text.match(
        /(?:what\s+is\s+|calculate\s+)?(-?\d+(?:\.\d+)?)\s*(?:factorial|!)$/i
      ) ||
      text.match(
        /(?:what\s+is\s+|calculate\s+)?factorial\s+of\s+(-?\d+(?:\.\d+)?)$/i
      );
    if (factMatch) {
      const val = Number(factMatch[1]);
      return {
        intent: 'calculate',
        operation: 'factorial',
        values: [val],
        value: val,
        expression: `${val}!`,
        requires_clarification: false,
      };
    }

    // Absolute value: "absolute value of -25" / "abs of -25"
    const absMatch = text.match(
      /(?:what\s+is\s+)?(?:the\s+)?(?:absolute\s+value\s+of|abs\s+of|abs)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (absMatch) {
      const val = Number(absMatch[1]);
      return {
        intent: 'calculate',
        operation: 'absolute',
        values: [val],
        value: val,
        expression: `abs(${val})`,
        requires_clarification: false,
      };
    }

    // Logarithm: "log of 100", "log 100", "log base 2 of 8"
    const logBaseMatch = text.match(
      /(?:what\s+is\s+)?log(?:arithm)?\s+base\s+(\d+(?:\.\d+)?)\s+of\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (logBaseMatch) {
      const base = Number(logBaseMatch[1]);
      const target = Number(logBaseMatch[2]);
      return {
        intent: 'calculate',
        operation: 'logarithm',
        values: [target, base],
        value: target,
        expression: `log(${target}) / log(${base})`,
        requires_clarification: false,
      };
    }

    const logMatch = text.match(
      /(?:what\s+is\s+)?(?:the\s+)?(?:log10|log|logarithm)(?:\s+of)?\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (logMatch) {
      const target = Number(logMatch[1]);
      return {
        intent: 'calculate',
        operation: 'logarithm',
        values: [target, 10],
        value: target,
        expression: `log(${target})`,
        requires_clarification: false,
      };
    }

    const lnMatch = text.match(
      /(?:what\s+is\s+)?(?:the\s+)?(?:natural\s+log(?:arithm)?(?:\s+of)?|ln(?:\s+of)?)\s+(-?\d+(?:\.\d+)?)$/i
    );
    if (lnMatch) {
      const target = Number(lnMatch[1]);
      return {
        intent: 'calculate',
        operation: 'natural_log',
        values: [target],
        value: target,
        expression: `ln(${target})`,
        requires_clarification: false,
      };
    }

    // Trigonometry: "sin 90 degrees", "sine of 30 degrees", "cos 0", "tan 45 degrees", "sin 1.57 radians"
    const trigMatch = text.match(
      /(?:what\s+is\s+|calculate\s+)?(sin|sine|cos|cosine|tan|tangent|asin|acos|atan)\s*(?:of\s+)?\(?(-?\d+(?:\.\d+)?)\)?\s*(degrees?|deg|°|radians?|rad)?$/i
    );
    if (trigMatch) {
      const rawFn = trigMatch[1].toLowerCase();
      const fnMap: Record<
        string,
        'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan'
      > = {
        sin: 'sin',
        sine: 'sin',
        cos: 'cos',
        cosine: 'cos',
        tan: 'tan',
        tangent: 'tan',
        asin: 'asin',
        acos: 'acos',
        atan: 'atan',
      };
      const fn = fnMap[rawFn] || 'sin';
      const val = Number(trigMatch[2]);
      const rawUnit = (trigMatch[3] || 'deg').toLowerCase();
      const angleUnit: 'deg' | 'rad' = rawUnit.startsWith('rad')
        ? 'rad'
        : 'deg';
      return {
        intent: 'calculate',
        operation: 'trigonometry',
        values: [val],
        value: val,
        trig_function: fn,
        angle_unit: angleUnit,
        expression: `${fn}(${val})`,
        requires_clarification: false,
      };
    }

    return null;
  }

  private tryParseNaturalArithmetic(text: string): StructuredAIIntent | null {
    // Strip leading conversational filler like "what do I get if I", "what is", "calculate", "can you tell me"
    const stripped = text
      .replace(
        /^(?:what\s+do\s+i\s+get\s+if\s+i|what\s+is|what's|calculate|compute|find|tell\s+me|please)\s+/i,
        ''
      )
      .trim();

    // ==== ADDITION ====
    // "add 25 and 30", "add 25 30", "sum of 25 and 30", "total of 25 and 30", "combine 25 and 30", "add 25 to 30"
    const addVerbMatch = stripped.match(
      /^(?:the\s+)?(?:add|sum\s+of|total\s+of|combine)\s+(-?\d+(?:\.\d+)?)\s+(?:and|with|to|\+|\s)\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (addVerbMatch) {
      const a = Number(addVerbMatch[1]);
      const b = Number(addVerbMatch[2]);
      return {
        intent: 'calculate',
        operation: 'addition',
        values: [a, b],
        expression: `${a} + ${b}`,
        requires_clarification: false,
      };
    }

    // "25 plus 30", "25 add 30", "25 + 30", "25 and 30", "increase 25 by 30"
    const addInfixMatch =
      stripped.match(
        /^(-?\d+(?:\.\d+)?)\s*(?:\+|\bplus\b|\badded\s+to\b|\badd\b|\band\b)\s*(-?\d+(?:\.\d+)?)$/i
      ) ||
      stripped.match(
        /^increase\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)$/i
      );
    if (addInfixMatch) {
      const a = Number(addInfixMatch[1]);
      const b = Number(addInfixMatch[2]);
      return {
        intent: 'calculate',
        operation: 'addition',
        values: [a, b],
        expression: `${a} + ${b}`,
        requires_clarification: false,
      };
    }

    // ==== SUBTRACTION ====
    // Order-reversing: "subtract 35 from 100", "take 35 away from 100", "take away 35 from 100", "remove 35 from 100" -> 100 - 35
    const subReverseMatch =
      stripped.match(
        /^(?:subtract|take\s+away|remove)\s+(-?\d+(?:\.\d+)?)\s+(?:from|away\s+from)\s+(-?\d+(?:\.\d+)?)$/i
      ) ||
      stripped.match(
        /^take\s+(-?\d+(?:\.\d+)?)\s+away\s+from\s+(-?\d+(?:\.\d+)?)$/i
      );
    if (subReverseMatch) {
      const subtrahend = Number(subReverseMatch[1]);
      const minuend = Number(subReverseMatch[2]);
      return {
        intent: 'calculate',
        operation: 'subtraction',
        values: [minuend, subtrahend],
        expression: `${minuend} - ${subtrahend}`,
        requires_clarification: false,
      };
    }

    // Order-preserving subtraction: "100 minus 35", "100 - 35", "100 subtract 35", "100 take away 35", "difference between 100 and 35", "reduce 100 by 35"
    const subDirectMatch =
      stripped.match(
        /^(-?\d+(?:\.\d+)?)\s*(?:-|\bminus\b|\bsubtract\b|\btake\s+away\b|\bless\b)\s*(-?\d+(?:\.\d+)?)$/i
      ) ||
      stripped.match(
        /^(?:the\s+)?difference\s+(?:between|of)\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)$/i
      ) ||
      stripped.match(
        /^reduce\s+(-?\d+(?:\.\d+)?)\s+by\s+(-?\d+(?:\.\d+)?)$/i
      );
    if (subDirectMatch) {
      const a = Number(subDirectMatch[1]);
      const b = Number(subDirectMatch[2]);
      return {
        intent: 'calculate',
        operation: 'subtraction',
        values: [a, b],
        expression: `${a} - ${b}`,
        requires_clarification: false,
      };
    }

    // ==== MULTIPLICATION ====
    // "multiply 12 by 8", "multiply 12 and 8", "multiply 12 8", "product of 12 and 8"
    const multVerbMatch = stripped.match(
      /^(?:the\s+)?(?:multiply|product\s+of)\s+(-?\d+(?:\.\d+)?)\s+(?:by|and|with|into|\*|\s)\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (multVerbMatch) {
      const a = Number(multVerbMatch[1]);
      const b = Number(multVerbMatch[2]);
      return {
        intent: 'calculate',
        operation: 'multiplication',
        values: [a, b],
        expression: `${a} * ${b}`,
        requires_clarification: false,
      };
    }

    // "12 times 8", "12 * 8", "12 multiplied by 8", "12 multiply 8", "12 into 8", "12 x 8"
    const multInfixMatch = stripped.match(
      /^(-?\d+(?:\.\d+)?)\s*(?:\*|×|x|\btimes\b|\bmultiplied\s+by\b|\bmultiply\s+by\b|\bmultiply\b|\binto\b)\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (multInfixMatch) {
      const a = Number(multInfixMatch[1]);
      const b = Number(multInfixMatch[2]);
      return {
        intent: 'calculate',
        operation: 'multiplication',
        values: [a, b],
        expression: `${a} * ${b}`,
        requires_clarification: false,
      };
    }

    // ==== DIVISION ====
    // "divide 100 by 4", "divide 100 4", "quotient of 100 and 4"
    const divVerbMatch = stripped.match(
      /^(?:the\s+)?(?:divide|quotient\s+of)\s+(-?\d+(?:\.\d+)?)\s+(?:by|and|with|\/|\s)\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (divVerbMatch) {
      const a = Number(divVerbMatch[1]);
      const b = Number(divVerbMatch[2]);
      return {
        intent: 'calculate',
        operation: 'division',
        values: [a, b],
        expression: `${a} / ${b}`,
        requires_clarification: false,
      };
    }

    // "100 divided by 4", "100 / 4", "100 divide by 4", "100 divide 4", "100 over 4"
    const divInfixMatch = stripped.match(
      /^(-?\d+(?:\.\d+)?)\s*(?:\/|÷|\bdivided\s+by\b|\bdivide\s+by\b|\bdivide\b|\bover\b)\s*(-?\d+(?:\.\d+)?)$/i
    );
    if (divInfixMatch) {
      const a = Number(divInfixMatch[1]);
      const b = Number(divInfixMatch[2]);
      return {
        intent: 'calculate',
        operation: 'division',
        values: [a, b],
        expression: `${a} / ${b}`,
        requires_clarification: false,
      };
    }

    return null;
  }

  private tryParseGeneralExpression(
    text: string,
    context: ConversationContext
  ): StructuredAIIntent | null {
    let expr = text
      .replace(
        /^(?:what\s+is|what's|calculate|compute|evaluate|solve)\s+/i,
        ''
      )
      .trim();

    // Substitute contextual pronouns if present
    let usesPrevious = false;
    if (context.lastResult !== null) {
      if (/\b(?:that|it|the\s+answer|previous\s+result)\b/i.test(expr)) {
        expr = expr.replace(
          /\b(?:that|it|the\s+answer|previous\s+result)\b/gi,
          String(context.lastResult)
        );
        usesPrevious = true;
      }
    }

    // Replace word operators in compound expressions
    expr = expr
      .replace(/\bmultiplied\s+by\b/gi, '*')
      .replace(/\bdivided\s+by\b/gi, '/')
      .replace(/\bdivide\s+by\b/gi, '/')
      .replace(/\bto\s+the\s+power\s+of\b/gi, '^')
      .replace(/\braised\s+to\b/gi, '^')
      .replace(/\bsquare\s+root\s+of\s+(-?\d+(?:\.\d+)?)/gi, 'sqrt($1)')
      .replace(/\bcube\s+root\s+of\s+(-?\d+(?:\.\d+)?)/gi, 'cbrt($1)')
      .replace(/\bplus\b/gi, '+')
      .replace(/\bminus\b/gi, '-')
      .replace(/\btimes\b/gi, '*')
      .replace(/\binto\b/gi, '*')
      .replace(/\bover\b/gi, '/')
      .replace(/(\d)\s+x\s+(\d)/gi, '$1 * $2')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .trim();

    // Check if the remaining expression consists only of valid math tokens
    const validMathRegex =
      /^[0-9+\-*/^().!%\s]|sqrt|cbrt|sin|cos|tan|asin|acos|atan|log|ln|exp|factorial|fact|abs|pi|e$/i;
    const strippedIdentifiers = expr.replace(
      /\b(sqrt|cbrt|sin|cos|tan|asin|acos|atan|log10|log2|log|ln|exp|factorial|fact|abs|pi|e)\b/gi,
      ''
    );

    if (
      /[0-9]/.test(expr) &&
      (/[\+\-\*\/\^!%]/.test(expr) || /\b(sqrt|cbrt|sin|cos|tan|log|ln|exp|factorial|fact|abs)\b/i.test(expr)) &&
      /^[0-9+\-*/^().!%\s]+$/.test(strippedIdentifiers) &&
      validMathRegex.test(expr[0])
    ) {
      return {
        intent: 'calculate',
        operation: 'expression',
        expression: expr,
        uses_previous_result: usesPrevious,
        requires_clarification: false,
      };
    }

    return null;
  }
}

export const nlFallbackParser = new NLFallbackParser();
