/**
 * Safe, High-Fidelity Tactile Haptic Feedback Helper
 * Uses native hardware-accelerated vibration effects on Android (VibrationEffect.EFFECT_CLICK)
 * and expo-haptics on iOS for crisp, non-fatiguing, mechanical tactile clicks.
 */

import { settingsService } from '../services/SettingsService';

function getReactNative() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native');
  } catch {
    return null;
  }
}

function triggerNativeAndroidHaptic(type: string): boolean {
  try {
    const rn = getReactNative();
    if (rn?.Platform?.OS === 'android' && rn?.NativeModules?.ChimeModule?.triggerHaptic) {
      rn.NativeModules.ChimeModule.triggerHaptic(type);
      return true;
    }
  } catch {
    // Fallback to expo-haptics
  }
  return false;
}

/**
 * Keypad button tap: Crisp, ultra-light mechanical click.
 * Zero latency, instant hardware tactile feedback.
 */
export async function triggerKeypadHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  const soundTheme = settingsService.getSettings().soundTheme;
  const hapticType = soundTheme === 'mechanical' ? 'mechanical' : 'keypad';

  // 1. Try zero-latency Android native hardware click
  if (triggerNativeAndroidHaptic(hapticType)) return;

  // 2. iOS / Expo fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    if (Haptics.impactAsync && Haptics.ImpactFeedbackStyle) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else if (Haptics.selectionAsync) {
      await Haptics.selectionAsync();
    }
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate(16);
    } catch {
      // Ignore
    }
  }
}

/**
 * Light impact for minor UI toggles (drawer, mode switch, chips).
 */
export async function triggerLightHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('light')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate(12);
    } catch {
      // Ignore
    }
  }
}

/**
 * Medium impact for selecting history items or drawer opens.
 */
export async function triggerMediumHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('medium')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate(20);
    } catch {
      // Ignore
    }
  }
}

/**
 * Firm impact for = and AC buttons.
 */
export async function triggerHeavyHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('heavy')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate(30);
    } catch {
      // Ignore
    }
  }
}

/**
 * Success haptic: Distinctive double-pulse confirmation pattern when calculation succeeds.
 */
export async function triggerSuccessHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('success')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    if (Haptics.notificationAsync && Haptics.NotificationFeedbackType) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate([0, 18, 50, 20]);
    } catch {
      // Ignore
    }
  }
}

/**
 * Error haptic: Triple-pulse pattern for syntax/domain errors.
 */
export async function triggerErrorHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('error')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    if (Haptics.notificationAsync && Haptics.NotificationFeedbackType) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate([0, 25, 40, 25, 40, 30]);
    } catch {
      // Ignore
    }
  }
}

/**
 * Warning / toggle haptic for mic on/off.
 */
export async function triggerWarningHaptic(): Promise<void> {
  if (!settingsService.getSettings().hapticsEnabled) return;

  if (triggerNativeAndroidHaptic('double')) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Haptics = require('expo-haptics');
    if (Haptics.notificationAsync && Haptics.NotificationFeedbackType) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    try {
      const rn = getReactNative();
      rn?.Vibration?.vibrate([0, 15, 30, 15]);
    } catch {
      // Ignore
    }
  }
}
