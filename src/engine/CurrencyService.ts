/**
 * Offline Currency Conversion Service (CurrencyService)
 *
 * 100% on-device: uses the exchange rates the user saved in Settings
 * ("1 USD = 83.20 INR"). The app never downloads rates and never invents them —
 * if a rate is missing, the user is told exactly which rate to set.
 */

import { CalculationOutput, StructuredAIIntent } from '../models/types';
import { calculationService } from './CalculationService';

/** Currencies offered in Settings. Rates are stored as "1 USD = X <code>". */
export const RATE_CURRENCIES: Array<{ code: string; label: string }> = [
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SAR', label: 'Saudi Riyal' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'CHF', label: 'Swiss Franc' },
];

export interface ExchangeRateQuote {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
}

export type ExchangeRateProviderFn = (
  fromCurrency: string,
  toCurrency: string
) => Promise<ExchangeRateQuote | null>;

const CURRENCY_ALIASES: Record<string, string> = {
  usd: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  'us dollar': 'USD',
  'us dollars': 'USD',
  '$': 'USD',
  inr: 'INR',
  rupee: 'INR',
  rupees: 'INR',
  rs: 'INR',
  'indian rupee': 'INR',
  'indian rupees': 'INR',
  '₹': 'INR',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  '€': 'EUR',
  gbp: 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  'british pound': 'GBP',
  'british pounds': 'GBP',
  sterling: 'GBP',
  '£': 'GBP',
  jpy: 'JPY',
  yen: 'JPY',
  'japanese yen': 'JPY',
  '¥': 'JPY',
  aud: 'AUD',
  'australian dollar': 'AUD',
  'australian dollars': 'AUD',
  cad: 'CAD',
  'canadian dollar': 'CAD',
  'canadian dollars': 'CAD',
  chf: 'CHF',
  franc: 'CHF',
  francs: 'CHF',
  'swiss franc': 'CHF',
  cny: 'CNY',
  yuan: 'CNY',
  renminbi: 'CNY',
  aed: 'AED',
  dirham: 'AED',
  dirhams: 'AED',
  sgd: 'SGD',
  'singapore dollar': 'SGD',
  'singapore dollars': 'SGD',
  sar: 'SAR',
  riyal: 'SAR',
  riyals: 'SAR',
  'saudi riyal': 'SAR',
  'saudi riyals': 'SAR',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  CHF: 'CHF ',
  CNY: '¥',
  AED: 'AED ',
  SGD: 'S$',
  SAR: 'SAR ',
};

export class CurrencyService {
  private customProvider: ExchangeRateProviderFn | null = null;
  /** "1 USD = rates[code] code"; USD is always 1. */
  private rates: Record<string, number> = {};

  /** Updates the user-saved offline rates (from Settings). */
  public setRates(rates: Record<string, number> | undefined | null): void {
    const clean: Record<string, number> = {};
    for (const [code, value] of Object.entries(rates || {})) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        clean[code.toUpperCase()] = value;
      }
    }
    this.rates = clean;
  }

  /** Allows tests or other on-device sources to supply rates. */
  public setCustomRateProvider(provider: ExchangeRateProviderFn | null): void {
    this.customProvider = provider;
  }

  public normalizeCurrencyCode(raw: string | null | undefined): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const cleaned = raw.trim().toLowerCase();
    if (CURRENCY_ALIASES[cleaned]) {
      return CURRENCY_ALIASES[cleaned];
    }
    if (/^[a-z]{3}$/i.test(cleaned)) {
      return cleaned.toUpperCase();
    }
    return null;
  }

  private usdRate(code: string): number | null {
    if (code === 'USD') return 1;
    const r = this.rates[code];
    return typeof r === 'number' && r > 0 ? r : null;
  }

  /** Returns the conversion rate from the saved offline rates (or a custom provider). */
  public async getRate(
    fromCode: string,
    toCode: string
  ): Promise<ExchangeRateQuote | null> {
    if (fromCode === toCode) {
      return { from: fromCode, to: toCode, rate: 1, timestamp: Date.now() };
    }
    if (this.customProvider) {
      return this.customProvider(fromCode, toCode);
    }
    const fromUsd = this.usdRate(fromCode);
    const toUsd = this.usdRate(toCode);
    if (fromUsd === null || toUsd === null) return null;
    return { from: fromCode, to: toCode, rate: toUsd / fromUsd, timestamp: Date.now() };
  }

  public async executeIntent(intent: StructuredAIIntent): Promise<CalculationOutput> {
    const amount = intent.value ?? intent.values?.[0];
    const fromCode = this.normalizeCurrencyCode(
      intent.from_currency || intent.from_unit
    );
    const toCode = this.normalizeCurrencyCode(
      intent.to_currency || intent.to_unit
    );

    if (amount === undefined || amount === null || !Number.isFinite(amount)) {
      const q = 'What amount would you like to convert?';
      return {
        success: false,
        formattedResult: '?',
        displayExpression: 'Currency conversion',
        spokenResponse: q,
        requiresClarification: true,
        clarificationQuestion: q,
        intent,
      };
    }

    if (!fromCode || !toCode) {
      const q = 'Which currencies would you like me to convert between?';
      return {
        success: false,
        formattedResult: '?',
        displayExpression: `Convert ${amount}`,
        spokenResponse: q,
        requiresClarification: true,
        clarificationQuestion: q,
        intent,
      };
    }

    const quote = await this.getRate(fromCode, toCode);
    if (!quote) {
      const missing = [fromCode, toCode].filter((c) => this.usdRate(c) === null);
      const unavailableMsg = `Set the ${missing.join(' and ')} exchange rate in Settings → Currency rates. Conversion works offline with your saved rates.`;
      return {
        success: false,
        formattedResult: 'Unavailable',
        displayExpression: `${amount} ${fromCode} → ${toCode}`,
        spokenResponse: unavailableMsg,
        errorCode: 'CURRENCY_UNAVAILABLE',
        errorMessage: unavailableMsg,
        intent,
      };
    }

    const converted = calculationService.sanitizeNumber(amount * quote.rate);
    const rounded = Number(converted.toFixed(2));
    const formattedAmount = calculationService.formatNumber(amount);
    const formattedConverted = calculationService.formatNumber(rounded);
    const symbol = CURRENCY_SYMBOLS[toCode] || '';

    return {
      success: true,
      resultNumber: rounded,
      formattedResult: `${symbol}${formattedConverted} ${toCode}`.trim(),
      displayExpression: `${formattedAmount} ${fromCode} → ${toCode}`,
      spokenResponse: `${formattedAmount} ${fromCode} is approximately ${formattedConverted} ${toCode}.`,
      unit: toCode,
      breakdown: `Your saved rate: 1 ${fromCode} = ${calculationService.formatNumber(Number(quote.rate.toPrecision(6)))} ${toCode}`,
      intent,
    };
  }
}

export const currencyService = new CurrencyService();
