/**
 * Floating Overlay & Bubble Manager
 *
 * Allows SmartCalc to run as a draggable floating bubble / overlay
 * over other applications (WhatsApp, Amazon, Excel, Chrome, etc.)
 * or enter Picture-in-Picture mode.
 */

interface NativeFloatingOverlayModule {
  isOverlayPermissionGranted: () => Promise<boolean>;
  requestOverlayPermission: () => void;
  startFloatingCalculator: () => Promise<boolean>;
  stopFloatingCalculator: () => void;
  enterPictureInPicture: () => Promise<boolean>;
  updateWidgetDisplay: (text: string) => void;
}

// Lazy safe loader for React Native (Jest-safe)
function getReactNative(): {
  Platform: { OS: string };
  Alert: { alert: (title: string, msg?: string, buttons?: Array<{ text: string; style?: string; onPress?: () => void }>) => void };
  NativeModules: { FloatingOverlayModule?: NativeFloatingOverlayModule };
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native');
  } catch {
    return null;
  }
}

function getNativeModule(): NativeFloatingOverlayModule | null {
  const rn = getReactNative();
  if (!rn || rn.Platform?.OS !== 'android') return null;
  return rn.NativeModules?.FloatingOverlayModule || null;
}

export async function isOverlayPermissionGranted(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.isOverlayPermissionGranted();
  } catch {
    return false;
  }
}

export function requestOverlayPermission(): void {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.requestOverlayPermission();
  } catch {
    // Ignore
  }
}

export async function launchFloatingCalculator(): Promise<boolean> {
  const rn = getReactNative();
  const mod = getNativeModule();
  if (!mod) {
    rn?.Alert?.alert(
      'Not Supported',
      'Floating overlay calculator is currently available on Android devices.'
    );
    return false;
  }

  const granted = await isOverlayPermissionGranted();
  if (!granted) {
    rn?.Alert?.alert(
      'Overlay Permission Required',
      'To calculate over WhatsApp, Amazon, or Excel without switching apps, please allow "Display over other apps" for VoiceCalc AI.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Grant Permission',
          onPress: () => {
            requestOverlayPermission();
          },
        },
      ]
    );
    return false;
  }

  try {
    const success = await mod.startFloatingCalculator();
    return success !== false;
  } catch (err) {
    console.warn('[FloatingOverlay] Failed to start:', err);
    return false;
  }
}

export function stopFloatingCalculator(): void {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.stopFloatingCalculator();
  } catch {
    // Ignore
  }
}

export async function enterPictureInPicture(): Promise<boolean> {
  const mod = getNativeModule();
  if (!mod) return false;
  try {
    return await mod.enterPictureInPicture();
  } catch {
    return false;
  }
}

export function updateWidgetDisplay(text: string): void {
  const mod = getNativeModule();
  if (!mod) return;
  try {
    mod.updateWidgetDisplay(text);
  } catch {
    // Ignore
  }
}
