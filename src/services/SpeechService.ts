/**
 * Speech Recognition Service (SpeechService)
 *
 * Cross-platform Speech-to-Text for Android, iOS and Web, powered by
 * `expo-speech-recognition` on native devices.
 *
 * Hands-free design:
 * - Delivers ALL recognizer hypotheses (maxAlternatives) with each final result so the
 *   orchestrator can pick the one that is valid math ("4 plus 4" vs "for plus for").
 * - Re-arms the Android recognizer after each phrase with a single debounced scheduler
 *   (never concurrent `start()` calls -> no ERROR_RECOGNIZER_BUSY / ERROR_CLIENT).
 * - Classifies errors: harmless ones (no-speech, timeout, aborted) re-arm silently;
 *   persistent ones (network, no mic, unsupported language, repeated failures) stop the
 *   mic and report a clear message instead of looping forever.
 * - Switches itself off after a period of silence to save battery.
 * - `suspend()` / `resume()` pause recognition while the app speaks an answer, so the
 *   recognizer never transcribes the app's own voice.
 */

import { ErrorCode, SupportedLanguage } from '../models/types';
import { settingsService } from './SettingsService';

export interface SpeechRecognitionCallbacks {
  onStart?: () => void;
  onPartialResult?: (transcript: string) => void;
  /** `alternatives` are the recognizer's other hypotheses, best first (may be empty). */
  onFinalResult: (transcript: string, alternatives?: string[]) => void;
  onError?: (code: ErrorCode, friendlyMessage: string) => void;
  onEnd?: () => void;
}

interface NativeSubscription {
  remove: () => void;
}

/** Operator / function vocabulary used to bias the recognizer (Android 13+, iOS). */
const MATH_BIASING_EN = [
  'plus',
  'minus',
  'times',
  'multiplied by',
  'divided by',
  'into',
  'over',
  'point',
  'percent',
  'percent of',
  'square root',
  'cube root',
  'squared',
  'cubed',
  'to the power',
  'factorial',
  'equals',
  'GST',
  'discount',
  'tip',
  'split',
  'half of',
  'double',
  'open bracket',
  'close bracket',
  'clear',
  'undo',
];

const MATH_BIASING_IN = [
  'lakh',
  'crore',
  'jodo',
  'ghatao',
  'guna',
  'bhag',
  'aur',
  'pratishat',
  'kitna hua',
  'into',
  'by',
];

function getBiasingStrings(language: SupportedLanguage): string[] {
  return language === 'en-IN' || language === 'hi-IN'
    ? [...MATH_BIASING_EN, ...MATH_BIASING_IN]
    : MATH_BIASING_EN;
}

/** Stop the mic after this much silence following the last recognized speech. */
const SILENCE_AFTER_SPEECH_MS = 12000;
/** Stop the mic if nothing at all is said within this time. */
const SILENCE_NO_SPEECH_MS = 15000;
/** Consecutive recoverable errors (without any result in between) before giving up. */
const MAX_CONSECUTIVE_ERRORS = 6;

/**
 * Android 13+ (API 33) supports segmented continuous sessions that emit a final result
 * per phrase without restart beeps. On Android 12 and below, expo-speech-recognition's
 * "continuous" mode disables end-of-speech detection entirely (no final results until
 * stop), so we use normal phrase-by-phrase recognition there and re-arm after each phrase.
 * iOS keeps continuous mode (partials are evaluated via the orchestrator's fallback).
 */
function supportsSegmentedContinuous(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native');
    if (Platform?.OS === 'android') {
      return Number(Platform.Version) >= 33;
    }
    return true;
  } catch {
    return true;
  }
}

function getPlatform(): { os: string; version: number } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Platform } = require('react-native');
    return { os: String(Platform?.OS || 'unknown'), version: Number(Platform?.Version) || 0 };
  } catch {
    return { os: 'unknown', version: 0 };
  }
}

const normLocale = (l: string) => String(l || '').replace('_', '-').toLowerCase();

export type OfflineSpeechStatus =
  /** Language pack installed: recognition runs fully on the phone */
  | 'ready'
  /** Phone supports on-device recognition, but the language pack must be downloaded */
  | 'download-needed'
  /** Older phone: uses Google's offline voice typing pack if installed (preferred offline) */
  | 'prefer-offline'
  | 'unavailable';

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

type NativeResultEvent = {
  isFinal?: boolean;
  results?: Array<{ transcript: string; confidence?: number }>;
};

export class SpeechService {
  private listening = false;
  private suspended = false;
  private userRequestedStop = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private activeWebRecognition: Record<string, unknown> | null = null;
  private nativeSubscriptions: NativeSubscription[] = [];
  private mockSpeechRecognizer:
    | ((callbacks: SpeechRecognitionCallbacks) => Promise<void>)
    | null = null;

  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private hasReceivedSpeech = false;
  private consecutiveErrors = 0;
  private networkErrors = 0;
  private activeCallbacks: SpeechRecognitionCallbacks | null = null;
  private activeLanguage: SupportedLanguage = 'en-US';
  /** True when the current session uses Android/iOS on-device (offline) recognition. */
  private useOnDevice = false;

  /**
   * Reports whether speech for `language` can be recognized fully on the phone.
   */
  public async getOfflineSpeechStatus(
    language: SupportedLanguage = settingsService.getSettings().language || 'en-US'
  ): Promise<OfflineSpeechStatus> {
    const nativeModule = getNativeSpeechModule();
    if (!nativeModule) return 'unavailable';
    const { os, version } = getPlatform();
    try {
      const supportsOnDevice =
        typeof nativeModule.supportsOnDeviceRecognition === 'function' &&
        nativeModule.supportsOnDeviceRecognition() === true;
      if (os === 'ios') return supportsOnDevice ? 'ready' : 'unavailable';
      if (os !== 'android' || version < 33 || !supportsOnDevice) return 'prefer-offline';
      const res = await nativeModule.getSupportedLocales({});
      const installed: string[] = (res?.installedLocales || []).map(normLocale);
      if (installed.includes(normLocale(language))) return 'ready';
      const supported: string[] = (res?.locales || []).map(normLocale);
      return supported.includes(normLocale(language)) || supported.length === 0
        ? 'download-needed'
        : 'prefer-offline';
    } catch {
      return 'prefer-offline';
    }
  }

  /**
   * Asks Android to download the offline speech pack for `language` (Android 13+).
   * Returns a short message for the UI.
   */
  public async downloadOfflineSpeech(
    language: SupportedLanguage = settingsService.getSettings().language || 'en-US'
  ): Promise<string> {
    const nativeModule = getNativeSpeechModule();
    if (!nativeModule || typeof nativeModule.androidTriggerOfflineModelDownload !== 'function') {
      return 'Open Google app → Settings → Voice → Offline speech recognition to download your language.';
    }
    try {
      const res = await nativeModule.androidTriggerOfflineModelDownload({ locale: language });
      if (res?.status === 'download_success') return 'Offline speech pack installed.';
      if (res?.status === 'download_scheduled') return 'Download scheduled — it will finish on Wi-Fi.';
      return 'Follow the download dialog to install the offline speech pack.';
    } catch {
      return 'Open Google app → Settings → Voice → Offline speech recognition to download your language.';
    }
  }

  public isListening(): boolean {
    return this.listening;
  }

  /**
   * Clears the recognizer's audio buffer while staying in listening mode
   * (used after a partial-transcript fallback evaluation).
   */
  public restartSession(): void {
    if (!this.listening || this.userRequestedStop || this.suspended) return;
    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.stop === 'function') {
      try {
        void nativeModule.stop();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * Pauses recognition (e.g. while the app speaks an answer). The session stays
   * "listening" from the UI's point of view; call `resume()` afterwards.
   */
  public async suspend(): Promise<void> {
    if (!this.listening || this.userRequestedStop) return;
    this.suspended = true;
    this.clearRestartTimer();
    this.clearIdleTimer();
    const nativeModule = getNativeSpeechModule();
    if (nativeModule) {
      try {
        if (typeof nativeModule.abort === 'function') {
          nativeModule.abort();
        } else if (typeof nativeModule.stop === 'function') {
          await nativeModule.stop();
        }
      } catch {
        // Ignore
      }
    }
    if (this.activeWebRecognition && typeof this.activeWebRecognition.abort === 'function') {
      try {
        (this.activeWebRecognition.abort as () => void)();
      } catch {
        // Ignore
      }
    }
  }

  /** Resumes after `suspend()`. Returns false if the user stopped the mic meanwhile. */
  public async resume(): Promise<boolean> {
    if (!this.suspended) return this.listening;
    this.suspended = false;
    if (this.userRequestedStop || !this.listening) return false;

    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.start === 'function' && !this.mockSpeechRecognizer) {
      // Short delay lets the TTS engine release audio focus before the mic opens again
      this.scheduleNativeRestart(nativeModule, 250);
    } else if (this.activeWebRecognition && typeof this.activeWebRecognition.start === 'function') {
      try {
        (this.activeWebRecognition.start as () => void)();
      } catch {
        // Already running
      }
    }
    this.armIdleTimer();
    return true;
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /** (Re)starts the auto-off timer: shorter budget before any speech was heard. */
  private armIdleTimer(): void {
    this.clearIdleTimer();
    if (!this.listening || this.userRequestedStop || this.suspended) return;
    const timeout = this.hasReceivedSpeech ? SILENCE_AFTER_SPEECH_MS : SILENCE_NO_SPEECH_MS;
    this.idleTimer = setTimeout(() => {
      if (this.listening && !this.userRequestedStop && !this.suspended) {
        void this.stopListening();
      }
    }, timeout);
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

  private buildStartOptions(language: SupportedLanguage): Record<string, unknown> {
    return {
      lang: language,
      interimResults: true,
      // Several hypotheses let us recover from "for"/"four", "to"/"two", "ate"/"eight"...
      maxAlternatives: 5,
      continuous: supportsSegmentedContinuous(),
      // Run recognition on the phone whenever the offline language pack is installed
      requiresOnDeviceRecognition: this.useOnDevice,
      // Older Android: ask Google's recognizer to use its offline voice pack.
      // (EXTRA_PREFER_OFFLINE exists since API 23, so reflection is safe everywhere.)
      ...(getPlatform().os === 'android'
        ? { androidIntentOptions: { EXTRA_PREFER_OFFLINE: true } }
        : {}),
      contextualStrings: getBiasingStrings(language),
      addsPunctuation: false,
      // NOTE: do not pass `androidIntentOptions` keys that only exist on newer API levels;
      // the native module resolves them by reflection and throws on older Android.
      iosTaskHint: 'dictation',
    };
  }

  /**
   * Schedules a single debounced native recognizer (re)start.
   * Prevents race conditions when Android fires `error` followed immediately by `end`.
   */
  private scheduleNativeRestart(nativeModule: any, delayMs = 150): void {
    if (this.userRequestedStop || !this.listening || this.suspended) {
      return;
    }
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.userRequestedStop || !this.listening || this.suspended) {
        return;
      }
      try {
        const maybePromise = nativeModule.start(this.buildStartOptions(this.activeLanguage));
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => this.scheduleNativeRestart(nativeModule, 600));
        }
      } catch {
        // Previous session still closing -> try again a bit later
        this.scheduleNativeRestart(nativeModule, 600);
      }
    }, delayMs);
  }

  /** Stops everything and reports an unrecoverable problem to the UI. */
  private failAndStop(
    code: ErrorCode,
    message: string,
    callbacks: SpeechRecognitionCallbacks
  ): void {
    this.userRequestedStop = true;
    this.listening = false;
    this.suspended = false;
    this.cleanUpNativeSubscriptions();
    const nativeModule = getNativeSpeechModule();
    try {
      nativeModule?.abort?.();
    } catch {
      // Ignore
    }
    this.activeCallbacks = null;
    callbacks.onError?.(code, message);
    callbacks.onEnd?.();
  }

  private extractAlternatives(event: NativeResultEvent): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of event.results || []) {
      const t = (r?.transcript || '').trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        out.push(t);
      }
    }
    return out;
  }

  /**
   * Starts listening to the user's voice in hands-free mode until `stopListening()` is
   * called or the silence timeout elapses.
   */
  public async startListening(
    callbacks: SpeechRecognitionCallbacks
  ): Promise<void> {
    if (this.listening) {
      await this.stopListening();
    }

    this.userRequestedStop = false;
    this.suspended = false;
    this.hasReceivedSpeech = false;
    this.consecutiveErrors = 0;
    this.networkErrors = 0;
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

    this.activeLanguage = settingsService.getSettings().language || 'en-US';
    this.useOnDevice = (await this.getOfflineSpeechStatus(this.activeLanguage)) === 'ready';

    // 2. Native Android / iOS Speech Recognition (via expo-speech-recognition)
    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.start === 'function') {
      try {
        if (
          typeof nativeModule.isRecognitionAvailable === 'function' &&
          nativeModule.isRecognitionAvailable() === false
        ) {
          callbacks.onError?.(
            'SPEECH_RECOGNITION_FAILED',
            'No speech recognition service found. Install or enable the Google app (Speech Services by Google) and try again.'
          );
          callbacks.onEnd?.();
          return;
        }

        if (typeof nativeModule.requestPermissionsAsync === 'function') {
          const perm = await nativeModule.requestPermissionsAsync();
          if (perm && !perm.granted) {
            callbacks.onError?.(
              'MIC_PERMISSION_DENIED',
              'Microphone permission is required for voice. Please allow microphone access in Settings.'
            );
            callbacks.onEnd?.();
            return;
          }
        }

        this.cleanUpNativeSubscriptions();

        if (typeof nativeModule.addListener === 'function') {
          const subResult = nativeModule.addListener(
            'result',
            (event: NativeResultEvent) => {
              if (this.suspended || this.userRequestedStop) return;
              const alternatives = this.extractAlternatives(event);
              const text = alternatives[0] || '';
              if (!text) return;

              this.hasReceivedSpeech = true;
              this.consecutiveErrors = 0;
              this.networkErrors = 0;
              this.armIdleTimer();

              if (event.isFinal) {
                callbacks.onFinalResult(text, alternatives.slice(1));
              } else {
                callbacks.onPartialResult?.(text);
              }
            }
          );
          if (subResult) this.nativeSubscriptions.push(subResult);

          const subError = nativeModule.addListener(
            'error',
            (event: { error?: string; message?: string }) => {
              if (this.userRequestedStop || this.suspended) return;
              const errStr = String(event.error || event.message || '').toLowerCase();

              // On-device recognizer refused (pack removed / unsupported): retry with the
              // standard recognizer, still preferring its offline voice pack.
              if (
                this.useOnDevice &&
                (errStr.includes('service-not-allowed') ||
                  errStr.includes('language-not-supported'))
              ) {
                this.useOnDevice = false;
                this.scheduleNativeRestart(nativeModule, 200);
                return;
              }

              if (
                errStr.includes('not-allowed') ||
                errStr.includes('permission') ||
                errStr.includes('service-not-allowed')
              ) {
                this.failAndStop(
                  'MIC_PERMISSION_DENIED',
                  'Microphone permission was denied. Please allow microphone access.',
                  callbacks
                );
                return;
              }

              if (errStr.includes('language-not-supported')) {
                if (this.activeLanguage !== 'en-US') {
                  // e.g. Hindi pack missing -> keep working in English
                  this.activeLanguage = 'en-US';
                  this.scheduleNativeRestart(nativeModule, 200);
                  return;
                }
                this.failAndStop(
                  'SPEECH_RECOGNITION_FAILED',
                  'This speech language is not available on your device. Choose another language in Settings.',
                  callbacks
                );
                return;
              }

              if (errStr.includes('audio-capture')) {
                this.failAndStop(
                  'SPEECH_RECOGNITION_FAILED',
                  'The microphone is being used by another app. Close it and try again.',
                  callbacks
                );
                return;
              }

              if (errStr.includes('network')) {
                this.networkErrors += 1;
                if (this.networkErrors >= 2) {
                  this.failAndStop(
                    'NO_INTERNET',
                    'Offline speech pack missing. Download it in Settings → Offline speech (or Google app → Settings → Voice → Offline speech recognition).',
                    callbacks
                  );
                  return;
                }
                this.scheduleNativeRestart(nativeModule, 800);
                return;
              }

              // no-speech / speech-timeout are normal pauses; busy / client / aborted /
              // interrupted are transient. Re-arm with a growing back-off, but give up
              // after repeated failures instead of looping (and beeping) forever.
              const harmless =
                errStr.includes('no-speech') || errStr.includes('speech-timeout');
              if (!harmless) {
                this.consecutiveErrors += 1;
                if (this.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                  this.failAndStop(
                    'SPEECH_RECOGNITION_FAILED',
                    'Voice recognition keeps failing on this device. Please try again in a moment.',
                    callbacks
                  );
                  return;
                }
              }
              const backoff = harmless ? 150 : Math.min(250 * this.consecutiveErrors, 1500);
              this.scheduleNativeRestart(nativeModule, backoff);
            }
          );
          if (subError) this.nativeSubscriptions.push(subError);

          // Android fires `end` after every phrase (or ~5-15 s window)
          const subEnd = nativeModule.addListener('end', () => {
            if (this.suspended) return;
            if (!this.userRequestedStop && this.listening) {
              this.scheduleNativeRestart(nativeModule, 120);
            } else if (this.activeCallbacks === callbacks) {
              this.listening = false;
              this.cleanUpNativeSubscriptions();
              this.activeCallbacks = null;
              callbacks.onEnd?.();
            }
          });
          if (subEnd) this.nativeSubscriptions.push(subEnd);
        }

        this.listening = true;
        callbacks.onStart?.();
        this.armIdleTimer();

        await nativeModule.start(this.buildStartOptions(this.activeLanguage));
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

    // 3. Web / Browser SpeechRecognition API
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
        recognition.lang = this.activeLanguage;
        recognition.interimResults = true;
        recognition.maxAlternatives = 5;
        recognition.continuous = true;

        recognition.onstart = () => {
          this.listening = true;
          callbacks.onStart?.();
          this.armIdleTimer();
        };

        recognition.onresult = (event: Record<string, unknown>) => {
          if (this.suspended) return;
          const resultIndex = (event.resultIndex as number) || 0;
          const results = event.results as ArrayLike<
            ArrayLike<{ transcript: string }> & { isFinal?: boolean }
          >;
          let interim = '';
          for (let i = resultIndex; i < results.length; i++) {
            const res = results[i];
            if (res.isFinal) {
              const alts: string[] = [];
              for (let a = 0; a < res.length; a++) {
                const t = (res[a]?.transcript || '').trim();
                if (t && !alts.includes(t)) alts.push(t);
              }
              if (alts.length) {
                this.hasReceivedSpeech = true;
                this.armIdleTimer();
                callbacks.onFinalResult(alts[0], alts.slice(1));
              }
            } else {
              interim += res[0]?.transcript || '';
            }
          }
          if (interim) {
            this.hasReceivedSpeech = true;
            this.armIdleTimer();
            callbacks.onPartialResult?.(interim);
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
          if (this.suspended) return;
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

    // 4. No speech engine available at all (e.g. headless emulator)
    callbacks.onError?.(
      'SPEECH_RECOGNITION_FAILED',
      'Speech recognition is not available on this device.'
    );
    callbacks.onEnd?.();
  }

  public async stopListening(): Promise<void> {
    this.userRequestedStop = true;
    this.listening = false;
    this.suspended = false;
    this.clearRestartTimer();
    this.clearIdleTimer();

    const cb = this.activeCallbacks;
    this.activeCallbacks = null;

    const nativeModule = getNativeSpeechModule();
    if (nativeModule && typeof nativeModule.stop === 'function') {
      try {
        await nativeModule.stop();
      } catch {
        // Ignore stop errors
      }
    }
    this.cleanUpNativeSubscriptions();

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
    callbacks.onFinalResult(phrase.trim(), []);
    callbacks.onEnd?.();
  }
}

export const speechService = new SpeechService();
