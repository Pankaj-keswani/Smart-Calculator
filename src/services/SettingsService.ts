/**
 * Settings & API Configuration Service (SettingsService)
 *
 * Persists user preferences and runtime AI / Currency API configurations locally.
 * Synchronizes changes with AIService and CurrencyService immediately.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { aiService } from '../ai/AIService';
import {
  getDefaultAIConfig,
  getDefaultCurrencyApiConfig,
  PROVIDER_PRESETS,
} from '../config/env';
import { currencyService } from '../engine/CurrencyService';
import { AppSettings } from '../models/types';
import { debugLogger } from './DebugLogger';

const SETTINGS_STORAGE_KEY = '@smartcalc_ai_settings_v1';

export class SettingsService {
  private settings: AppSettings;
  private listeners: Set<(settings: AppSettings) => void> = new Set();

  constructor() {
    const defaultAI = getDefaultAIConfig();
    const defaultCurrency = getDefaultCurrencyApiConfig();

    this.settings = {
      aiProvider: defaultAI.provider,
      aiApiKey: defaultAI.apiKey,
      aiBaseUrl: defaultAI.baseUrl,
      aiModel: defaultAI.model,
      useCloudAIWhenAvailable: true,
      ttsEnabled: true,
      ttsRate: 1.0,
      ttsPitch: 1.0,
      language: 'en-US',
      themeMode: 'dark',
      accentTheme: 'gold',
      soundTheme: 'modern',
      hapticsEnabled: true,
      currencyApiUrl: defaultCurrency.apiUrl,
      currencyApiKey: defaultCurrency.apiKey,
      debugModeEnabled: false,
    };

    this.syncDownstreamServices();
  }

  public async load(): Promise<AppSettings> {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AppSettings>;
        this.settings = {
          ...this.settings,
          ...parsed,
        };
        this.syncDownstreamServices();
        this.notifyListeners();
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
    // If provider changed and baseUrl/model weren't explicitly overridden in this call, apply preset
    if (
      partial.aiProvider &&
      partial.aiProvider !== this.settings.aiProvider &&
      partial.aiProvider !== 'mock' &&
      partial.aiProvider !== 'custom'
    ) {
      const preset = PROVIDER_PRESETS[partial.aiProvider];
      if (!partial.aiBaseUrl) {
        partial.aiBaseUrl = preset.baseUrl;
      }
      if (!partial.aiModel) {
        partial.aiModel = preset.defaultModel;
      }
    }

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
    aiService.updateConfig({
      provider: this.settings.aiProvider,
      apiKey: this.settings.aiApiKey,
      baseUrl: this.settings.aiBaseUrl,
      model: this.settings.aiModel,
    });

    currencyService.updateConfig({
      apiUrl: this.settings.currencyApiUrl,
      apiKey: this.settings.currencyApiKey,
    });

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
