/**
 * Sound & Audio Feedback Helper
 * Provides a short, pleasant confirmation chime when a calculation is resolved,
 * especially in continuous hands-free voice mode.
 */

import { settingsService } from '../services/SettingsService';
import { triggerSuccessHaptic } from './haptics';

export function playKeySound(): void {
  const soundTheme = settingsService.getSettings().soundTheme || 'modern';
  if (soundTheme === 'silent') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native');
    if (rn?.Platform?.OS === 'android') {
      rn.NativeModules?.ChimeModule?.playKeyClick?.(soundTheme);
      return;
    }
  } catch {
    // Ignore in tests
  }
}

export function playConfirmationChime(): void {
  // Always trigger crisp success tactile feedback
  void triggerSuccessHaptic();

  const soundTheme = settingsService.getSettings().soundTheme || 'modern';
  if (soundTheme === 'silent') return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native');
    if (rn?.Platform?.OS === 'android') {
      rn.NativeModules?.ChimeModule?.playChime?.(soundTheme);
      return;
    }
  } catch {
    // Ignore in tests
  }

  // Web Audio fallback for web environment
  try {
    if (typeof window !== 'undefined' && 'AudioContext' in window) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    }
  } catch {
    // Ignore audio context errors
  }
}
