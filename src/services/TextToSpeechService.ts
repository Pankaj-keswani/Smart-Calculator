/**
 * Text-to-Speech Service (TextToSpeechService)
 *
 * Automatically speaks calculation results, conversions, percentages,
 * clarifications, and human-friendly error messages.
 * Supports rate, pitch, language, voice selection, and enable/disable controls.
 */

import { SupportedLanguage } from '../models/types';
import { settingsService } from './SettingsService';

export interface VoiceOption {
  identifier: string;
  name: string;
  language: string;
}

export interface SpeakCallbacks {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (err: unknown) => void;
}

export class TextToSpeechService {
  private lastSpokenText: string = '';
  private speaking = false;
  private mockSpeakHandler:
    | ((text: string, callbacks?: SpeakCallbacks) => Promise<void>)
    | null = null;

  /**
   * Allows integration tests to observe spoken output deterministically without native audio hardware.
   */
  public setMockSpeakHandler(
    handler:
      | ((text: string, callbacks?: SpeakCallbacks) => Promise<void>)
      | null
  ): void {
    this.mockSpeakHandler = handler;
  }

  public getLastSpokenText(): string {
    return this.lastSpokenText;
  }

  public isSpeaking(): boolean {
    return this.speaking;
  }

  public async speak(text: string, callbacks?: SpeakCallbacks): Promise<void> {
    if (!text || !text.trim()) {
      callbacks?.onDone?.();
      return;
    }

    const cleanText = text.trim();
    this.lastSpokenText = cleanText;

    const settings = settingsService.getSettings();
    if (!settings.ttsEnabled) {
      callbacks?.onDone?.();
      return;
    }

    if (this.mockSpeakHandler) {
      this.speaking = true;
      callbacks?.onStart?.();
      try {
        await this.mockSpeakHandler(cleanText, callbacks);
      } finally {
        this.speaking = false;
        callbacks?.onDone?.();
      }
      return;
    }

    try {
      // Dynamically require expo-speech when running on Android/iOS/Web
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Speech = require('expo-speech');
      await Speech.stop();

      let targetLang: string = settings.language || ('en-US' as SupportedLanguage);

      // Auto-detect Hindi / Devanagari text or common Hindi terms
      if (
        /[\u0900-\u097F]/.test(cleanText) ||
        /\b(uttar|hai|kitna|jodo|ghatao|karo|batao)\b/i.test(cleanText)
      ) {
        targetLang = /[\u0900-\u097F]/.test(cleanText) ? 'hi-IN' : 'en-IN';
      }

      let targetVoiceId: string | undefined;
      try {
        const voice = this.pickVoice(
          await this.getNativeVoicesCached(Speech),
          targetLang,
          settings.ttsVoiceIdentifier
        );
        if (voice) {
          targetVoiceId = voice.identifier;
          targetLang = voice.language || targetLang;
        }
      } catch {
        // Fall back to the language tag only
      }

      this.speaking = true;
      callbacks?.onStart?.();

      Speech.speak(cleanText, {
        language: targetLang,
        rate: settings.ttsRate || 1.0,
        pitch: settings.ttsPitch || 1.0,
        voice: targetVoiceId,
        onDone: () => {
          this.speaking = false;
          callbacks?.onDone?.();
        },
        onStopped: () => {
          this.speaking = false;
          callbacks?.onDone?.();
        },
        onError: (err: unknown) => {
          this.speaking = false;
          callbacks?.onError?.(err);
          callbacks?.onDone?.();
        },
      });
    } catch {
      this.speaking = false;
      callbacks?.onDone?.();
    }
  }

  private nativeVoicesCache: Array<Record<string, any>> | null = null;

  private async getNativeVoicesCached(Speech: any): Promise<Array<Record<string, any>>> {
    if (this.nativeVoicesCache && this.nativeVoicesCache.length > 0) {
      return this.nativeVoicesCache;
    }
    if (typeof Speech.getAvailableVoicesAsync !== 'function') return [];
    const voices = await Speech.getAvailableVoicesAsync();
    this.nativeVoicesCache = Array.isArray(voices) ? voices : [];
    return this.nativeVoicesCache;
  }

  /**
   * Chooses a voice: the user's chosen voice if it speaks the target language family,
   * otherwise an exact locale match (en-IN before en-US/en-AU...), preferring
   * on-device voices over network ones (which may need a download and stay silent).
   */
  private pickVoice(
    voices: Array<Record<string, any>>,
    targetLang: string,
    preferredId?: string
  ): Record<string, any> | null {
    if (!voices.length) return null;
    const norm = (l?: string) => (l || '').replace('_', '-').toLowerCase();
    const target = norm(targetLang);
    const family = target.split('-')[0];

    if (preferredId) {
      const chosen = voices.find((v) => v.identifier === preferredId);
      if (chosen && norm(chosen.language).split('-')[0] === family) return chosen;
    }

    const exact = voices.filter((v) => norm(v.language) === target);
    const pool = exact.length
      ? exact
      : voices.filter((v) => norm(v.language).split('-')[0] === family);
    if (!pool.length) return null;

    const score = (v: Record<string, any>) =>
      (/network/i.test(String(v.identifier)) ? 0 : 2) +
      (String(v.quality).toLowerCase() === 'enhanced' ? 1 : 0);
    return [...pool].sort((a, b) => score(b) - score(a))[0];
  }

  public async stop(): Promise<void> {
    this.speaking = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Speech = require('expo-speech');
      await Speech.stop();
    } catch {
      // Ignore in non-native environment
    }
  }

  public async getAvailableVoices(): Promise<VoiceOption[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Speech = require('expo-speech');
      const voices = await Speech.getAvailableVoicesAsync();
      if (Array.isArray(voices)) {
        return voices.map((v: Record<string, string>) => ({
          identifier: v.identifier || v.name,
          name: v.name || v.identifier,
          language: v.language || 'en-US',
        }));
      }
    } catch {
      // Fallback default voices list
    }
    return [
      { identifier: 'default-en-US', name: 'English (US) Default', language: 'en-US' },
      { identifier: 'default-en-IN', name: 'English (India) / Hinglish', language: 'en-IN' },
      { identifier: 'default-hi-IN', name: 'Hindi (India)', language: 'hi-IN' },
    ];
  }
}

export const textToSpeechService = new TextToSpeechService();
