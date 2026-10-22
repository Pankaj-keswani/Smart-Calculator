import { nlFallbackParser } from '../src/parser/nlParser';
import { ConversationContext } from '../src/models/types';
import { ACCENT_PALETTES, DARK_THEME, getTheme, LIGHT_THEME } from '../src/theme/theme';
import {
  enterPictureInPicture,
  isOverlayPermissionGranted,
  launchFloatingCalculator,
  stopFloatingCalculator,
} from '../src/utils/floatingOverlay';

describe('Feature Upgrade 1: Voice Control Commands', () => {
  const dummyContext: ConversationContext = {
    lastResult: 42,
    lastFormattedResult: '42',
    lastExpression: '6 * 7',
    lastUnit: null,
    pendingClarification: null,
    recentTurns: [
      { userText: '6 * 7', expression: '6 * 7', result: 42, timestamp: 1000 },
    ],
    memoryVariables: { rent: 1200 },
  };

  it('parses clear and reset voice commands', () => {
    const clearIntent = nlFallbackParser.parse('clear', dummyContext);
    expect(clearIntent.intent).toBe('context_reset');

    const resetIntent = nlFallbackParser.parse('reset', dummyContext);
    expect(resetIntent.intent).toBe('context_reset');
  });

  it('parses undo command', () => {
    const undoIntent = nlFallbackParser.parse('undo', dummyContext);
    expect(undoIntent.intent).toBe('voice_control');
    expect(undoIntent.voice_action).toBe('undo');
  });

  it('parses copy command', () => {
    const copyIntent = nlFallbackParser.parse('copy that', dummyContext);
    expect(copyIntent.intent).toBe('voice_control');
    expect(copyIntent.voice_action).toBe('copy');
  });

  it('parses repeat command', () => {
    const repeatIntent = nlFallbackParser.parse('say that again', dummyContext);
    expect(repeatIntent.intent).toBe('voice_control');
    expect(repeatIntent.voice_action).toBe('repeat');
  });

  it('parses memory save and recall commands', () => {
    const saveIntent = nlFallbackParser.parse('save this as grocery', dummyContext);
    expect(saveIntent.intent).toBe('voice_control');
    expect(saveIntent.voice_action).toBe('memory_save');
    expect(saveIntent.memory_key).toBe('grocery');
    expect(saveIntent.value).toBe(42);

    const recallIntent = nlFallbackParser.parse('recall rent', dummyContext);
    expect(recallIntent.intent).toBe('voice_control');
    expect(recallIntent.voice_action).toBe('memory_recall');
    expect(recallIntent.memory_key).toBe('rent');
    expect(recallIntent.value).toBe(1200);
  });
});

describe('Feature Upgrade 6: Accent Color Palettes & getTheme', () => {
  it('returns default gold accent for dark and light themes', () => {
    const darkGold = getTheme(true, 'gold');
    expect(darkGold.accent).toBe(ACCENT_PALETTES.gold.dark);
    expect(darkGold.keypadEqualsBg).toBe(ACCENT_PALETTES.gold.dark);

    const lightGold = getTheme(false, 'gold');
    expect(lightGold.accent).toBe(ACCENT_PALETTES.gold.light);
  });

  it('dynamically adapts accent for emerald, cyan, orange, and rose', () => {
    const emerald = getTheme(true, 'emerald');
    expect(emerald.accent).toBe(ACCENT_PALETTES.emerald.dark);
    expect(emerald.keypadEqualsBg).toBe(ACCENT_PALETTES.emerald.dark);

    const cyan = getTheme(false, 'cyan');
    expect(cyan.accent).toBe(ACCENT_PALETTES.cyan.light);

    const rose = getTheme(true, 'rose');
    expect(rose.accent).toBe(ACCENT_PALETTES.rose.dark);

    const orange = getTheme(false, 'orange');
    expect(orange.accent).toBe(ACCENT_PALETTES.orange.light);
  });
});

describe('Feature Upgrade 3: Floating Overlay Utilities', () => {
  it('safely handles non-android or unmocked native modules without crashing', async () => {
    expect(await isOverlayPermissionGranted()).toBe(false);
    expect(await launchFloatingCalculator()).toBe(false);
    expect(await enterPictureInPicture()).toBe(false);
    expect(() => stopFloatingCalculator()).not.toThrow();
  });
});
