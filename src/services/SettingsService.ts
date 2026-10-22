/**
 * Settings Service
 *
 * Persists user preferences on the phone (AsyncStorage) and keeps the offline
 * currency rates in sync with the CurrencyService. No network, no API keys.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { currencyService } from '../engine/CurrencyService';
import { AppSettings, SupportedLanguage } from '../models/types';
import { debugLogger } from './DebugLogger';

const SETTINGS_STORAGE_KEY = '@smartcalc_ai_settings_v1';

/**
 * Picks the best recognition language for a first launch from the phone's locale.
 * Indian phones (en-IN / hi-IN / any *-IN) get "en-IN", whose recognizer understands
 * Indian accents, lakh / crore and Hinglish far better than "en-US".
 */
export function detectDeviceLanguage(): SupportedLanguage {
  try {
    const locale = (Intl.DateTimeFormat().resolvedOptions().locale || '')
      .replace('_', '-')
      .toLowerCase();
    if (locale.startsWith('hi') || /-in\b/.test(locale)) return 'en-IN';
    if (locale.startsWith('es')) return 'es-ES';
    if (locale.startsWith('fr')) return 'fr-FR';
    if (locale.startsWith('de')) return 'de-DE';
  } catch {
    // Intl unavailable
  }
  return 'en-US';
}

export class SettingsService {
  private settings: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  constructor() {
    this.settings = {
      ttsEnabled: true,
      ttsRate: 1.0,
      ttsPitch: 1.0,
      language: 'en-US',
      themeMode: 'dark',
      accentTheme: 'gold',
      soundTheme: 'modern',
      hapticsEnabled: true,
      exchangeRates: {},
      debugModeEnabled: false,
    };

    this.syncDownstreamServices();
  }

  public async load(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings> & Record<string, unknown>;
        // Drop fields from older versions (cloud AI provider / API keys / rate URLs)
        // so no secret stays stored on the phone.
        const LEGACY_KEYS = [
          'aiProvider',
          'aiApiKey',
          'aiBaseUrl',
          'aiModel',
          'useCloudAIWhenAvailable',
          'currencyApiUrl',
          'currencyApiKey',
        ];
        const hadLegacy = LEGACY_KEYS.some((k) => k in parsed);
        for (const k of LEGACY_KEYS) delete parsed[k];
        this.settings = {
          ...this.settings,
          ...parsed,
          exchangeRates: { ...(parsed.exchangeRates || {}) },
        };
        if (hadLegacy) {
          void AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
        }
        this.syncDownstreamServices();
        this.notifyListeners();
      } else {
        // First launch: match the recognizer language to the phone's locale
        const detected = detectDeviceLanguage();
        if (detected !== this.settings.language) {
          this.settings = { ...this.settings, language: detected };
          this.notifyListeners();
        }
      }
    } catch {
      // Fallback to in-memory defaults if storage is unavailable
    }
    return this.getSettings();
  }

  public getSettings(): AppSettings {
    return { ...this.settings };
  }

  public async updateSettings(
    partial: Partial<AppSettings>
  ): Promise<AppSettings> {
    this.settings = {
      ...this.settings,
      ...partial,
    };

    this.syncDownstreamServices();
    this.notifyListeners();

    try {
      await AsyncStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify(this.settings)
      );
    } catch {
      // Ignore storage write errors in non-persistent environments
    }

    return this.getSettings();
  }

  public subscribe(listener: (settings: AppSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private syncDownstreamServices(): void {
    currencyService.setRates(this.settings.exchangeRates);
    debugLogger.setDebugEnabled(Boolean(this.settings.debugModeEnabled));
  }

  private notifyListeners(): void {
    const snapshot = this.getSettings();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

export const settingsService = new SettingsService();
