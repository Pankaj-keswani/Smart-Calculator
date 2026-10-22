/**
 * Display-only number formatting (digit grouping).
 *
 * Calculation results are stored and spoken as plain numbers ("150000"); the UI
 * shows them grouped for readability: "1,50,000" (Indian) or "150,000" (Western).
 */

import { SupportedLanguage } from '../models/types';

export type GroupingStyle = 'indian' | 'western';

export function groupingForLanguage(lang?: SupportedLanguage): GroupingStyle {
  return lang === 'en-IN' || lang === 'hi-IN' ? 'indian' : 'western';
}

function groupInteger(intPart: string, style: GroupingStyle): string {
  if (intPart.length <= 3) return intPart;
  if (style === 'western') {
    return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/**
 * Groups every run of 4+ integer digits in `text`, leaving decimals, exponents
 * ("1.2e17") and already-grouped numbers untouched.
 * "123456789×987654321" -> "123,456,789×987,654,321"
 */
export function groupDigits(text: string, style: GroupingStyle = 'western'): string {
  if (!text) return text;
  return text.replace(/(?<![\d.,eE])\d{4,}(?![\d,])/g, (digits) => groupInteger(digits, style));
}
