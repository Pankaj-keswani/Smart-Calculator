/**
 * Speech Recognition Service (SpeechService)
 *
 * Provides cross-platform Speech-to-Text for Android, iOS, and Web,
 * powered by `expo-speech-recognition` on native mobile devices.
 *
 * Continuous Hands-Free Architecture:
 * - Never kills the microphone on transient Android SpeechRecognizer timeouts or segment ends.
 * - Uses a single debounced restart scheduler so `start()` is never called concurrently
 *   during `error` + `end` event sequences (preventing ERROR_RECOGNIZER_BUSY / ERROR_CLIENT).
 * - Only stops when the user explicitly taps the Mic ON/OFF button (`stopListening()`).
 */

import { ErrorCode, SupportedLanguage } from '../models/types';
import { settingsService } from './SettingsService';

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onPartialResult?: (transcript: string) => void;
  onFinalResult: (transcript: string) => void;
  onError?: (code: ErrorCode, friendlyMessage: string) => void;
  onEnd?: () => void;
}

interface NativeSubscription {
  remove: () => void;
}

const MATH_BIASING_STRINGS = [
  'plus',
  'minus',
  'times',
  'multiply',
  'multiplied',
  'multiplied by',
  'into',
  'divided by',
  'divide',
  'over',
  'upon',
  'point',
  'dot',
  'percent',
  'percentage',
  'pratishat',
  'square',
  'squared',
  'cube',
  'cubed',
  'root',
  'square root',
  'cube root',
  'under root',
  'equals',
  'equal to',
  'GST',
  'discount',
  'off',
  'tip',
  'split',
  'half',
  'double',
  'triple',
  'power',
  'raised to',
  'jodo',
  'jod',
  'ghatao',
  'guna',
  'bhaag',
  'bhag',
  'bata',
  'batte',
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'million',
  'billion',
  'lakh',
  'lakhs',
  'crore',
  'crores',
  'ek',
  'do',
  'teen',
  'char',
  'chaar',
  'paanch',
  'panch',
  'chhe',
  'saat',
  'aath',
  'nau',
  'das',
  'gyarah',
  'barah',
  'terah',
  'chaudah',
  'pandrah',
  'solah',
  'satrah',
  'atharah',
  'unnis',
  'bees',
  'tees',
  'chalis',
  'pachas',
  'sau',
  'hazaar',
  'hazar',
];

// Safely obtain native ExpoSpeechRecognitionModule without breaking Web or Jest environments
function getNativeSpeechModule(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    return mod?.ExpoSpeechRecognitionModule || null;
  } catch {
    return null;
  }
}

export class SpeechService {
  private listening = false;
  private userRequestedStop = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private activeWebRecognition: Record<string, unknown> | null = null;
  private nativeSubscriptions: NativeSubscription[] = [];
  private mockSpeechRecognizer:
    | ((callbacks: SpeechRecognitionCallbacks) => Promise<void>)
    | null = null;
  
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSpeechTimestamp: number = 0;
  private hasReceivedSpeech = false;
  private readonly SILENCE_TIMEOUT_MS = 3500;
  private activeCallbacks: SpeechRecognitionCallbacks | null = null;

  public isListening(): boolean {
    return this.listening;
  }

  /**
   * Clears the current speech recognizer buffer while staying in continuous listening mode.
   * This resets the audio recognition window so subsequent calculations start from a fresh slate,
   * avoiding lag and accumulated transcript pollution.
   */
  public restartSession(): void {
    if (!this.listening || this.userRequestedStop) return;
    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.stop === 'function') {
      try {
        void nativeModule.stop();
      } catch {
        // Ignore
      }
    }
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    if (!this.hasReceivedSpeech || !this.listening || this.userRequestedStop) return;
    
    this.lastSpeechTimestamp = Date.now();
    this.idleTimer = setTimeout(() => {
      if (this.listening && !this.userRequestedStop) {
        void this.stopListening();
      }
    }, this.SILENCE_TIMEOUT_MS);
  }

  /**
   * Allows tests or custom native voice bridges to plug in directly.
   */
  public setMockSpeechRecognizer(
    fn: ((callbacks: SpeechRecognitionCallbacks) => Promise<void>) | null
  ): void {
    this.mockSpeechRecognizer = fn;
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private cleanUpNativeSubscriptions(): void {
    this.clearRestartTimer();
    this.clearIdleTimer();
    for (const sub of this.nativeSubscriptions) {
      try {
        sub?.remove?.();
      } catch {
        // Ignore removal error
      }
    }
    this.nativeSubscriptions = [];
  }

  /**
   * Schedules a single debounced native SpeechRecognizer restart on Android/iOS.
   * Prevents race conditions when Android fires `error` followed immediately by `end`.
   */
  private scheduleNativeRestart(
    nativeModule: any,
    language: SupportedLanguage,
    delayMs = 150
  ): void {
    if (this.userRequestedStop || !this.listening) {
      return;
    }
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.userRequestedStop || !this.listening) {
        return;
      }
      try {
        void nativeModule.start({
          lang: language,
          interimResults: true,
          continuous: true,
          contextualStrings: MATH_BIASING_STRINGS,
        });
      } catch {
        // If native start throws because previous session is still closing, retry once more
        this.restartTimer = setTimeout(() => {
          if (!this.userRequestedStop && this.listening) {
            try {
              void nativeModule.start({
                lang: language,
                interimResults: true,
                continuous: true,
                contextualStrings: MATH_BIASING_STRINGS,
              });
            } catch {
              // Ignore
            }
          }
        }, 350);
      }
    }, delayMs);
  }

  /**
   * Starts listening to the user's voice in continuous mode until `stopListening()` is called.
   */
  public async startListening(
    callbacks: SpeechRecognitionCallbacks
  ): Promise<void> {
    if (this.listening) {
      await this.stopListening();
    }

    this.userRequestedStop = false;
    this.hasReceivedSpeech = false;
    this.activeCallbacks = callbacks;

    // 1. Check custom/mock recognizer (used in integration tests)
    if (this.mockSpeechRecognizer) {
      this.listening = true;
      callbacks.onStart?.();
      try {
        await this.mockSpeechRecognizer(callbacks);
      } finally {
        this.listening = false;
        callbacks.onEnd?.();
      }
      return;
    }

    const language: SupportedLanguage =
      settingsService.getSettings().language || 'en-US';

    // 2. Check Native Android / iOS Speech Recognition (via expo-speech-recognition)
    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.start === 'function') {
      try {
        // Request microphone and speech recognition permissions from Android / iOS
        if (typeof nativeModule.requestPermissionsAsync === 'function') {
          const perm = await nativeModule.requestPermissionsAsync();
          if (perm && !perm.granted) {
            callbacks.onError?.(
              'MIC_PERMISSION_DENIED',
              'Microphone permission is required to use voice commands. Please allow microphone access in Settings.'
            );
            return;
          }
        }

        this.cleanUpNativeSubscriptions();
        let hasNotifiedStart = false;

        if (typeof nativeModule.addListener === 'function') {
          const subStart = nativeModule.addListener('start', () => {
            this.listening = true;
            if (!hasNotifiedStart) {
              hasNotifiedStart = true;
              callbacks.onStart?.();
            }
          });
          if (subStart) this.nativeSubscriptions.push(subStart);

          // Listen for partial and final transcription results
          const subResult = nativeModule.addListener(
            'result',
            (event: {
              isFinal?: boolean;
              results?: Array<{ transcript: string }>;
            }) => {
              const text = event.results?.[0]?.transcript || '';
              if (!text.trim()) return;
              
              this.hasReceivedSpeech = true;
              this.resetIdleTimer();

              if (event.isFinal) {
                callbacks.onFinalResult(text.trim());
              } else {
                callbacks.onPartialResult?.(text);
              }
            }
          );
          if (subResult) this.nativeSubscriptions.push(subResult);

          // Listen for errors
          const subError = nativeModule.addListener(
            'error',
            (event: { error?: string; message?: string }) => {
              const errStr = String(
                event.error || event.message || ''
              ).toLowerCase();

              // Check if this is a fatal permission / hardware denial
              const isPermissionDenied =
                errStr.includes('not-allowed') ||
                errStr.includes('permission') ||
                errStr.includes('service-not-allowed');

              if (isPermissionDenied) {
                this.userRequestedStop = true;
                this.listening = false;
                this.cleanUpNativeSubscriptions();
                callbacks.onError?.(
                  'MIC_PERMISSION_DENIED',
                  'Microphone permission was denied. Please allow microphone access.'
                );
                callbacks.onEnd?.();
                return;
              }

              // For all other Android SpeechRecognizer events (no-speech, speech-timeout,
              // client, busy, network, aborted), keep the mic alive in continuous mode!
              if (!this.userRequestedStop && this.listening) {
                this.scheduleNativeRestart(nativeModule, language, 180);
                return;
              }

              this.listening = false;
              this.cleanUpNativeSubscriptions();
              callbacks.onEnd?.();
            }
          );
          if (subError) this.nativeSubscriptions.push(subError);

          // Listen for end event — Android SpeechRecognizer fires `end` after every phrase or 15s window
          const subEnd = nativeModule.addListener('end', () => {
            if (!this.userRequestedStop && this.listening) {
              // Seamlessly re-arm native listening after a short debounce
              this.scheduleNativeRestart(nativeModule, language, 120);
            } else {
              this.listening = false;
              this.cleanUpNativeSubscriptions();
              callbacks.onEnd?.();
            }
          });
          if (subEnd) this.nativeSubscriptions.push(subEnd);
        }

        this.listening = true;
        hasNotifiedStart = true;
        callbacks.onStart?.();

        await nativeModule.start({
          lang: language,
          interimResults: true,
          continuous: true,
          contextualStrings: MATH_BIASING_STRINGS,
        });

        return;
      } catch (nativeErr: any) {
        console.warn('Native speech recognition failed to start:', nativeErr);
        this.listening = false;
        this.cleanUpNativeSubscriptions();
        callbacks.onError?.(
          'SPEECH_RECOGNITION_FAILED',
          'Unable to activate the microphone on this device.'
        );
        callbacks.onEnd?.();
        return;
      }
    }

    // 3. Check Web / Browser SpeechRecognition API (available on Web)
    const globalObj =
      typeof globalThis !== 'undefined'
        ? (globalThis as Record<string, unknown>)
        : {};
    const SpeechRecognitionCtor = (globalObj.SpeechRecognition ||
      globalObj.webkitSpeechRecognition) as
      | (new () => Record<string, unknown>)
      | undefined;

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        this.activeWebRecognition = recognition;
        recognition.lang = language;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.continuous = true;

        recognition.onstart = () => {
          this.listening = true;
          callbacks.onStart?.();
        };

        recognition.onresult = (event: Record<string, unknown>) => {
          const resultIndex = (event.resultIndex as number) || 0;
          const results = event.results as ArrayLike<
            ArrayLike<{ transcript: string }> & { isFinal?: boolean }
          >;
          let interim = '';
          let finalSegment = '';
          for (let i = resultIndex; i < results.length; i++) {
            const res = results[i];
            const text = res[0]?.transcript || '';
            if (res.isFinal) {
              finalSegment += text;
            } else {
              interim += text;
            }
          }
          if (interim || finalSegment) {
            this.hasReceivedSpeech = true;
            this.resetIdleTimer();
          }
          if (interim) {
            callbacks.onPartialResult?.(interim);
          }
          if (finalSegment) {
            callbacks.onFinalResult(finalSegment.trim());
          }
        };

        recognition.onerror = (event: { error?: string }) => {
          if (
            event.error === 'not-allowed' ||
            event.error === 'service-not-allowed'
          ) {
            this.userRequestedStop = true;
            this.listening = false;
            callbacks.onError?.(
              'MIC_PERMISSION_DENIED',
              'Microphone permission was denied. Please enable microphone access.'
            );
            callbacks.onEnd?.();
          }
        };

        recognition.onend = () => {
          if (!this.userRequestedStop && this.listening) {
            try {
              (recognition.start as () => void)();
              return;
            } catch {
              // Fall through if unable to restart
            }
          }
          this.listening = false;
          this.activeWebRecognition = null;
          callbacks.onEnd?.();
        };

        (recognition.start as () => void)();
        return;
      } catch {
        this.listening = false;
        callbacks.onError?.(
          'SPEECH_RECOGNITION_FAILED',
          'Unable to start speech recognition on this device.'
        );
        callbacks.onEnd?.();
        return;
      }
    }

    // 4. Fallback if no audio hardware is present (e.g. headless emulator)
    this.listening = true;
    callbacks.onStart?.();
  }

  public async stopListening(): Promise<void> {
    this.userRequestedStop = true;
    this.listening = false;
    this.clearRestartTimer();
    this.clearIdleTimer();

    const cb = this.activeCallbacks;
    this.activeCallbacks = null;

    // Stop native module if active
    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.stop === 'function') {
      try {
        await nativeModule.stop();
      } catch {
        // Ignore stop errors
      }
    }
    this.cleanUpNativeSubscriptions();

    // Stop web recognition if active
    if (
      this.activeWebRecognition &&
      typeof this.activeWebRecognition.stop === 'function'
    ) {
      try {
        (this.activeWebRecognition.stop as () => void)();
      } catch {
        // Ignore stop errors
      }
    }
    this.activeWebRecognition = null;
    cb?.onEnd?.();
  }

  /**
   * Simulates a spoken utterance flowing through the Speech-to-Text recognizer.
   */
  public async simulateSpokenPhrase(
    phrase: string,
    callbacks: SpeechRecognitionCallbacks
  ): Promise<void> {
    this.userRequestedStop = false;
    this.listening = true;
    callbacks.onStart?.();
    callbacks.onPartialResult?.(phrase);
    this.userRequestedStop = true;
    this.listening = false;
    callbacks.onFinalResult(phrase.trim());
    callbacks.onEnd?.();
  }
}

export const speechService = new SpeechService();
