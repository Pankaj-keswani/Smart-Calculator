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

      let targetLang = settings.language || ('en-US' as SupportedLanguage);
      let targetVoiceId = settings.ttsVoiceIdentifier || undefined;

      // Auto-detect Hindi / Devanagari text or common Hindi terms
      if (
        /[\u0900-\u097F]/.test(cleanText) ||
        /\b(uttar|hai|kitna|jodo|ghatao|karo|batao)\b/i.test(cleanText)
      ) {
        targetLang = 'hi-IN';
      }

      // Query native voices to ensure Android/iOS switches away from default English engine
      try {
        if (typeof Speech.getAvailableVoicesAsync === 'function') {
          const voices = await Speech.getAvailableVoicesAsync();
          if (Array.isArray(voices) && voices.length > 0) {
            const prefix = targetLang.split('-')[0].toLowerCase();
            const foundVoice = voices.find(
              (v: any) =>
                v.language?.toLowerCase() === targetLang.toLowerCase() ||
                v.language?.toLowerCase().startsWith(prefix) ||
                v.identifier?.toLowerCase().includes(prefix)
            );
            if (foundVoice) {
              targetVoiceId = foundVoice.identifier;
              targetLang = foundVoice.language;
            }
          }
        }
      } catch {
        // Fall back to targetLang tag
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
