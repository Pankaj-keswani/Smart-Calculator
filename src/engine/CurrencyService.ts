/**
 * Modular Currency Conversion Service (CurrencyService)
 *
 * CRITICAL GUARANTEE:
 * - Never invents or hardcodes static exchange rates.
 * - Queries a configurable external exchange-rate API (or custom injected provider).
 * - If live exchange-rate data is unavailable (offline, API unreachable, or disabled),
 *   clearly informs the user that current live conversion data is unavailable.
 */

import { CurrencyApiConfig, getDefaultCurrencyApiConfig } from '../config/env';
import { CalculationOutput, StructuredAIIntent } from '../models/types';
import { calculationService } from './CalculationService';

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
};

export class CurrencyService {
  private config: CurrencyApiConfig;
  private customProvider: ExchangeRateProviderFn | null = null;
  private allowLiveNetworkFetch = true;

  constructor(config?: CurrencyApiConfig) {
    this.config = config || getDefaultCurrencyApiConfig();
  }

  public updateConfig(config: Partial<CurrencyApiConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Allows plugging in a custom exchange rate provider or disabling live network calls in offline/test environments.
   */
  public setCustomRateProvider(provider: ExchangeRateProviderFn | null): void {
    this.customProvider = provider;
  }

  public setAllowLiveNetworkFetch(allow: boolean): void {
    this.allowLiveNetworkFetch = allow;
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

  public async fetchLiveRate(
    fromCode: string,
    toCode: string
  ): Promise<ExchangeRateQuote | null> {
    if (fromCode === toCode) {
      return { from: fromCode, to: toCode, rate: 1, timestamp: Date.now() };
    }

    if (this.customProvider) {
      return this.customProvider(fromCode, toCode);
    }

    if (!this.allowLiveNetworkFetch || !this.config.apiUrl) {
      return null;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const baseUrl = this.config.apiUrl.replace(/\/+$/, '');
      const url = `${baseUrl}/${encodeURIComponent(fromCode)}`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.config.apiKey) {
        headers.Authorization = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const rates = (data.rates || data.conversion_rates) as
        | Record<string, number>
        | undefined;
      if (!rates || typeof rates[toCode] !== 'number' || !Number.isFinite(rates[toCode])) {
        return null;
      }

      return {
        from: fromCode,
        to: toCode,
        rate: rates[toCode],
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
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

    const quote = await this.fetchLiveRate(fromCode, toCode);
    if (!quote) {
      const unavailableMsg = "Current exchange-rate data isn't available.";
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
      breakdown: `Live rate: 1 ${fromCode} = ${calculationService.formatNumber(quote.rate)} ${toCode}`,
      intent,
    };
  }
}

export const currencyService = new CurrencyService();
