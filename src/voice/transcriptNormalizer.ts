/**
 * Spoken-Math Transcript Normalizer
 *
 * Android / iOS speech recognizers return math in many surface forms:
 *   "1,00,000 + 50,000"   "₹500 + ₹250"   "10 − 3"   "2 lakh / 4"
 *   "7 times 8 is"        "पांच प्लस तीन"   "100 aur 200 jodo"
 *   "open bracket 10 + 20 close bracket into 3"
 *
 * This module rewrites all of those into one canonical, parser-friendly form
 * BEFORE the MathStreamFilter / NLFallbackParser see them. It is pure,
 * deterministic and idempotent (normalizing twice gives the same output).
 */

import { replaceSpokenNumbers } from '../parser/nlParser';

const NUM = String.raw`-?\d+(?:\.\d+)?`;

/* ------------------------------------------------------------------ */
/* Devanagari (hi-IN recognizer output) -> Hinglish / English tokens   */
/* ------------------------------------------------------------------ */

const DEVANAGARI_WORDS: Record<string, string> = {
  // operators
  'प्लस': 'plus',
  'माइनस': 'minus',
  'मायनस': 'minus',
  'मल्टीप्लाई': 'multiply',
  'मल्टीप्लाइड': 'multiplied',
  'डिवाइड': 'divide',
  'डिवाइडेड': 'divided',
  'टाइम्स': 'times',
  'इनटू': 'into',
  'इंटू': 'into',
  'बाय': 'by',
  'गुणा': 'guna',
  'गुणे': 'guna',
  'भाग': 'bhag',
  'जोड़ो': 'jodo',
  'जोड़': 'jod',
  'जोड़िए': 'jodo',
  'जोड़ें': 'jodo',
  'जोड़कर': 'jodo',
  'घटाओ': 'ghatao',
  'घटा': 'ghatao',
  'घटाइए': 'ghatao',
  'घटाएं': 'ghatao',
  'और': 'aur',
  'का': 'ka',
  'की': 'ka',
  'के': 'ka',
  'को': 'ko',
  'से': 'se',
  'में': 'mein',
  'मे': 'mein',
  'प्रतिशत': 'percent',
  'परसेंट': 'percent',
  'पर्सेंट': 'percent',
  'फीसदी': 'percent',
  'वर्गमूल': 'square root of',
  'स्क्वायर': 'square',
  'स्क्वेयर': 'square',
  'क्यूब': 'cube',
  'रूट': 'root',
  'आधा': 'half of',
  'दोगुना': 'double of',
  'बराबर': 'equals',
  'पॉइंट': 'point',
  'प्वाइंट': 'point',
  'दशमलव': 'point',
  'कितना': 'kitna',
  'कितने': 'kitna',
  'होता': 'hota',
  'होते': 'hota',
  'है': 'hai',
  'हैं': 'hai',
  'हुआ': 'hua',
  'होगा': 'hoga',
  'क्या': 'kya',
  'करो': 'karo',
  'कीजिए': 'karo',
  'बताओ': 'batao',
  'डिस्काउंट': 'discount',
  'छूट': 'discount',
  'जीएसटी': 'gst',
  'टिप': 'tip',
  // magnitudes
  'सौ': 'hundred',
  'हज़ार': 'thousand',
  'हजार': 'thousand',
  'लाख': 'lakh',
  'करोड़': 'crore',
  // numbers 0-20 and tens (Hindi 21-99 are irregular; recognizers emit digits for those)
  'शून्य': '0',
  'एक': '1',
  'दो': '2',
  'तीन': '3',
  'चार': '4',
  'पांच': '5',
  'पाँच': '5',
  'छह': '6',
  'छः': '6',
  'छे': '6',
  'सात': '7',
  'आठ': '8',
  'नौ': '9',
  'दस': '10',
  'ग्यारह': '11',
  'बारह': '12',
  'तेरह': '13',
  'चौदह': '14',
  'पंद्रह': '15',
  'पन्द्रह': '15',
  'सोलह': '16',
  'सत्रह': '17',
  'अठारह': '18',
  'उन्नीस': '19',
  'बीस': '20',
  'पच्चीस': '25',
  'तीस': '30',
  'चालीस': '40',
  'पचास': '50',
  'साठ': '60',
  'सत्तर': '70',
  'अस्सी': '80',
  'नब्बे': '90',
};

// Normalize keys to NFC + "nukta-less" so both spellings of ड़ / ज़ match.
const stripNukta = (w: string) => w.normalize('NFC').replace(/़/g, '');
const DEVANAGARI_LOOKUP: Record<string, string> = Object.fromEntries(
  Object.entries(DEVANAGARI_WORDS).map(([k, v]) => [stripNukta(k), v])
);

function transliterateDevanagari(input: string): string {
  if (!/[ऀ-ॿ]/.test(input)) return input;
  // Devanagari digits ०-९ -> 0-9
  let s = input.replace(/[०-९]/g, (d) =>
    String(d.charCodeAt(0) - 0x0966)
  );
  s = s.replace(/[।॥]/g, ' ');
  // `\b` does not work for Devanagari in JS, so map token-by-token.
  return s
    .split(/(\s+)/)
    .map((tok) => {
      if (!/[ऀ-ॿ]/.test(tok)) return tok;
      const mapped = DEVANAGARI_LOOKUP[stripNukta(tok)];
      return mapped !== undefined ? mapped : tok;
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/* Currency                                                            */
/* ------------------------------------------------------------------ */

const CURRENCY_SYMBOLS: Array<[RegExp, string]> = [
  [/₹|\bRs\.?(?=\s*\d)|\bINR(?=\s*\d)/gi, 'INR'],
  [/\$/g, 'USD'],
  [/€/g, 'EUR'],
  [/£/g, 'GBP'],
  [/¥/g, 'JPY'],
];

const CURRENCY_WORD =
  /\b(?:inr|usd|eur|gbp|jpy|aed|cad|aud|sgd|rupees?|rupaye|rupaiya|rs|dollars?|bucks|euros?|pounds?\s+sterling|yen|dirhams?|riyals?)\b/gi;

function normalizeCurrency(input: string): string {
  // Count currency mentions (symbols + words) to tell arithmetic from conversion.
  const symbolCount = (input.match(/[₹$€£¥]|\bRs\.?(?=\s*\d)/gi) || []).length;
  const wordCount = (input.match(CURRENCY_WORD) || []).length;
  const isConversion =
    symbolCount + wordCount >= 2 &&
    /\b(?:to|in|into|convert|kitne|how\s+many|how\s+much)\b/i.test(input) &&
    !/[+*/×÷]|\b(?:plus|minus|times|divided)\b/i.test(input);

  if (isConversion) {
    // "$100 to INR" -> "100 USD to INR"
    let s = input;
    for (const [re, code] of CURRENCY_SYMBOLS) {
      s = s.replace(new RegExp(`(?:${re.source})\\s*(${NUM})`, re.flags), `$1 ${code}`);
    }
    return s;
  }

  // Plain arithmetic on money: "₹500 + ₹250" / "500 rupees plus 200 rupees" -> "500 + 250"
  let s = input.replace(/[₹$€£¥]|\bRs\.?(?=\s*\d)/gi, ' ');
  if (/\d/.test(s)) {
    s = s.replace(/\b(?:rupees?|rupaye|rupaiya|rs|dollars?|bucks|euros?|paise|cents?)\b/gi, ' ');
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Main normalizer                                                     */
/* ------------------------------------------------------------------ */

export function normalizeTranscript(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFC');

  // 1. Hindi script -> Hinglish tokens
  s = transliterateDevanagari(s);

  // 2. Unicode operators and look-alikes produced by recognizers / keyboards
  s = s
    .replace(/[−‒–—﹣－]/g, '-') // − ‒ – — ﹣ －
    .replace(/[×✕✖⨯✕×]/g, ' * ')
    .replace(/[÷]/g, ' / ')
    .replace(/[⁄∕]/g, '/') // ⁄ ∕
    .replace(/[“”"]/g, ' ');

  // 3. Thousand-separator commas: "1,00,000" / "1,000,000" / "12,500.50"
  s = s.replace(/\d{1,3}(?:,\d{2,3})+(?:\.\d+)?/g, (m) =>
    /^\d{1,3}(?:,\d{2,3})*,\d{3}(?:\.\d+)?$/.test(m) ? m.replace(/,/g, '') : m
  );

  // 4. Currency symbols / words
  s = normalizeCurrency(s);

  // 5. Hinglish multi-word arithmetic phrasing (before generic number parsing)
  s = s
    // "100 aur 200 jodo" / "100 aur 200 ka jod" / "100 aur 200 add karo"
    .replace(
      new RegExp(`(${NUM}|\\b[a-z]+)\\s+(?:aur|and)\\s+(${NUM}|[a-z]+)\\s+(?:ka\\s+)?(?:jodo|jod(?:\\s+do)?|jodna|add\\s*karo|sum|total|yog)\\b`, 'gi'),
      '$1 plus $2'
    )
    // "6 aur 7 ka guna" / "6 aur 7 ko multiply karo"
    .replace(
      new RegExp(`(${NUM}|\\b[a-z]+)\\s+(?:aur|and)\\s+(${NUM}|[a-z]+)\\s+(?:ka|ko)\\s+(?:guna(?:a)?|multiply|product)(?:\\s+karo)?\\b`, 'gi'),
      '$1 times $2'
    )
    // "100 aur 30 ka antar" / "difference"
    .replace(
      new RegExp(`(${NUM}|\\b[a-z]+)\\s+(?:aur|and)\\s+(${NUM}|[a-z]+)\\s+(?:ka\\s+)?(?:antar|difference)\\b`, 'gi'),
      '$1 minus $2'
    )
    // "100 mein se 30 ghatao" / "100 me se 30 minus karo"
    .replace(
      new RegExp(`(${NUM}|\\b[a-z]+)\\s+(?:mein|me|main)\\s+se\\s+(${NUM}|[a-z]+)\\s+(?:ghatao|ghata\\s+do|minus(?:\\s+karo)?|kam\\s+karo|nikalo|nikaalo|subtract(?:\\s+karo)?)\\b`, 'gi'),
      '$1 minus $2'
    );

  // 6. Spoken number words -> digits (also "2 lakh" -> 200000, "do sau" -> 200)
  s = replaceSpokenNumbers(s);

  // 7. Spoken decimals: "2 point 5" -> "2.5", "point 5" -> "0.5"
  s = s
    .replace(/(\d+)\s*(?:point|dot|dashamlav)\s*(\d+)/gi, '$1.$2')
    .replace(/(^|[^\d.])\s*\b(?:point|dot)\s+(\d+)/gi, '$1 0.$2');

  // 7a. "negative 5" -> "minus 5"; "1 and a half" -> 1.5; "2 and a quarter" -> 2.25
  s = s
    .replace(/\bnegative\b/gi, 'minus')
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+and\\s+(?:a\\s+)?half\\b`, 'gi'), (_m, n) =>
      String(Number(n) + 0.5)
    )
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+and\\s+(?:a|1)\\s+quarter\\b`, 'gi'), (_m, n) =>
      String(Number(n) + 0.25)
    )
    .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s+and\\s+(?:three|3)\\s+quarters\\b`, 'gi'), (_m, n) =>
      String(Number(n) + 0.75)
    );

  // 7a2. Operations on the previous answer: "double it", "half of that", "square it"
  const PREV = String.raw`(?:it|that|this|the\s+(?:answer|result|total|value))`;
  s = s
    .replace(new RegExp(`\\b(?:double|twice)\\s+(?:of\\s+)?${PREV}`, 'gi'), ' * 2 ')
    .replace(new RegExp(`\\b(?:triple|thrice)\\s+(?:of\\s+)?${PREV}`, 'gi'), ' * 3 ')
    .replace(new RegExp(`\\bhalf\\s+(?:of\\s+)?${PREV}`, 'gi'), ' / 2 ')
    .replace(new RegExp(`\\b(?:square\\s+root|under\\s*root|root)\\s+(?:of\\s+)?${PREV}`, 'gi'), ' ^ 0.5 ')
    .replace(new RegExp(`\\bsquare\\s+${PREV}|${PREV}\\s+squared\\b`, 'gi'), ' ^ 2 ')
    .replace(new RegExp(`\\bcube\\s+${PREV}|${PREV}\\s+cubed\\b`, 'gi'), ' ^ 3 ');

  // 7a3. Fractions of a quantity: "a quarter of 100", "two thirds of 90", "three fourths of 80"
  const FRACTION: Record<string, number> = { half: 2, third: 3, thirds: 3, quarter: 4, quarters: 4, fourth: 4, fourths: 4, fifth: 5, fifths: 5, tenth: 10, tenths: 10 };
  s = s.replace(
    new RegExp(`\\b(?:(a|an|one|\\d+)\\s+)(half|thirds?|quarters?|fourths?|fifths?|tenths?)\\s+of\\s+(${NUM})`, 'gi'),
    (_m, count: string, frac: string, n: string) => {
      const k = /^\d+$/.test(count) ? count : '1';
      return `( ${n} * ${k} / ${FRACTION[frac.toLowerCase()]} )`;
    }
  );

  // 7b. "double 45" / "half 250" / "triple 9" (without "of") -> parser's "... of N" form
  s = s.replace(
    new RegExp(`\\b(double|twice|triple|thrice|half)\\s+(?!of\\b)(${NUM})`, 'gi'),
    '$1 of $2'
  );

  // 7c. Average / mean of a list: "average of 10, 20 and 30" -> "( 10 + 20 + 30 ) / 3"
  s = s.replace(
    new RegExp(
      `\\b(?:the\\s+)?(?:average|mean|avg|ausat)\\s+(?:of\\s+)?(${NUM}(?:\\s*(?:,|and|&|aur)?\\s*${NUM})+)`,
      'gi'
    ),
    (_m, list: string) => {
      const nums = list.match(/-?\d+(?:\.\d+)?/g) || [];
      return nums.length >= 2 ? `( ${nums.join(' + ')} ) / ${nums.length}` : _m;
    }
  );

  // 8. Spoken brackets
  s = s
    .replace(/\b(?:open(?:ing)?|left|start)\s+(?:bracket|brackets|parenthesis|parentheses|paren)\b/gi, ' ( ')
    .replace(/\b(?:bracket|brackets|parenthesis)\s+(?:open|start)\b/gi, ' ( ')
    .replace(/\b(?:close[ds]?|closing|right|end)\s+(?:bracket|brackets|parenthesis|parentheses|paren)\b/gi, ' ) ')
    .replace(/\b(?:bracket|brackets|parenthesis)\s+(?:close[ds]?|end)\b/gi, ' ) ');

  // 9. Powers: "2 raised to 10" / "2 to the power 10" / "2 power 10" -> "2 ^ 10"
  s = s.replace(
    new RegExp(`(${NUM}|\\))\\s+(?:raised?\\s+to(?:\\s+the)?(?:\\s+power)?(?:\\s+of)?|to\\s+the\\s+power(?:\\s+of)?|to\\s+power(?:\\s+of)?|power(?:\\s+of)?|ki\\s+power)\\s+(${NUM})`, 'gi'),
    '$1 ^ $2'
  );
  // Indian English "5 square" / "5 cube" (but not "5 square meters")
  s = s
    .replace(new RegExp(`(${NUM})\\s+square(?!\\s*(?:root|met|feet|foot|km|kilo|cm|mm|inch|yard|mile|unit))\\b`, 'gi'), '$1 squared')
    .replace(new RegExp(`(${NUM})\\s+cube(?!\\s*(?:root|met|feet|foot|cm|mm|inch|unit))\\b`, 'gi'), '$1 cubed');

  // Powers & roots as symbols so they work inside longer sums ("9 squared plus 1")
  s = s
    .replace(new RegExp(`(${NUM}|\\))\\s*squared\\b`, 'gi'), '$1 ^ 2')
    .replace(new RegExp(`(${NUM}|\\))\\s*cubed\\b`, 'gi'), '$1 ^ 3')
    .replace(new RegExp(`\\bsquare\\s+of\\s+(${NUM})`, 'gi'), '$1 ^ 2')
    .replace(new RegExp(`\\bcube\\s+of\\s+(${NUM})`, 'gi'), '$1 ^ 3')
    .replace(new RegExp(`\\bcube\\s+root\\s+(?:of\\s+)?(${NUM})`, 'gi'), 'cbrt($1)')
    .replace(new RegExp(`\\b(?:square\\s+root|under\\s*root|root)\\s+(?:of\\s+)?(${NUM})`, 'gi'), 'sqrt($1)');

  // 10. Fractions of a quantity: "3/4 of 100" -> "( 3 / 4 ) * 100"
  s = s.replace(
    new RegExp(`(\\d+)\\s*/\\s*(\\d+)\\s+of\\s+(${NUM})`, 'gi'),
    '( $1 / $2 ) * $3'
  );

  // 11. "x" between numbers ("12 x 8", "12x8") -> multiplication
  s = s.replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1 * ');

  // 12. "multiplied with" / "divided with"
  s = s
    .replace(/\bmultipl(?:y|ied)\s+with\b/gi, 'multiplied by')
    .replace(/\bdivided?\s+with\b/gi, 'divided by');

  // 13. Indian English "100 by 4" means divide — unless a verb already owns "by"
  if (!/\b(?:multipl|divid|increas|decreas|reduc|rais|split|shar|grow|incr|decr|mark|up|down)\w*/i.test(s)) {
    s = s.replace(/(\d)\s+by\s+(?=-?\d)/gi, '$1 divided by ');
  }

  // 14. Trailing "is / equals / equal to / =" and Hinglish "kitna hua / kya hai / batao"
  const TRAILING =
    /(?:\s|^)(?:=+|is|equals?(?:\s+to)?|equal\s+to|kitna\s+(?:hua|hai|hota\s+hai|hoga)|kya\s+(?:hai|hoga|hua)|hota\s+hai|hoga|batao|bata\s+do|karo|kar\s+do|please)\s*[?.!]*\s*$/i;
  for (let i = 0; i < 4 && TRAILING.test(s) && /\d/.test(s); i++) {
    s = s.replace(TRAILING, '');
  }
  // Leading "=" and trailing sentence punctuation (keep decimals intact)
  s = s.replace(/^\s*=+\s*/, '').replace(/(?<!\d)[.?!]+\s*$/, '').replace(/[?!]+\s*$/, '');
  s = s.replace(/(\d)\.\s*$/, '$1');

  return s.replace(/\s+/g, ' ').trim();
}

/**
 * True when a transcript contains vocabulary that only the full natural-language
 * parser understands (functions, everyday finance, unit/currency conversion,
 * fractions, splits). For such phrases the token-only stream filter would
 * destroy meaning ("5 squared" -> "5").
 */
export function hasRichMathKeywords(text: string): boolean {
  return /\b(?:squared?|cubed?|power|factorial|fact|sin|cos|tan|sine|cosine|tangent|log|ln|logarithm|exp|abs|absolute|root|sqrt|cbrt|half|double|twice|triple|thrice|quarter|third|split|share|between|each|per|average|mean|percent|percentage|pratishat|discount|off|gst|vat|tax|tip|interest|emi|profit|loss|convert|conversion|km|kmph|mph|knots?|mbps|kbps|gbps|tons?|tonnes?|quintals?|cups?|pints?|quarts?|tablespoons?|teaspoons?|kilomet\w*|met(?:er|re)s?|cm|mm|miles?|feet|foot|inch(?:es)?|yards?|kg|kilos?|grams?|pounds?|lbs?|ounces?|oz|lit(?:er|re)s?|ml|gallons?|celsius|fahrenheit|kelvin|degrees?|hours?|minutes?|seconds?|days?|weeks?|months?|years?|bytes?|kb|mb|gb|tb|acres?|hectares?|usd|inr|eur|gbp|jpy|rupees?|dollars?|euros?|that|it|previous|last|answer|result|usme|usmein|usko|isme|isko|remaining|left|spent|bought|change|total|save|store|recall|memory)\b|\^|%|\(/i.test(
    text
  );
}
