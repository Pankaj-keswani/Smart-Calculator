/**
 * Design System & Theme Tokens for SmartCalc AI
 *
 * Matches the warm ivory/olive/gold Light Mode and deep matte black/olive/gold Dark Mode
 * calculator aesthetic.
 */

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentListening: string;
  accentListeningSoft: string;
  accentProcessing: string;
  accentSpeaking: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  keypadNumberBg: string;
  keypadNumberText: string;
  keypadOperatorBg: string;
  keypadOperatorText: string;
  keypadFunctionBg: string;
  keypadFunctionText: string;
  keypadEqualsBg: string;
  keypadEqualsText: string;
}

export const DARK_THEME: ThemeColors = {
  isDark: true,
  background: '#0F0F0F',
  surface: '#1C1C1C',
  surfaceElevated: '#242422',
  surfaceSubtle: '#181817',
  border: '#2C2C29',
  textPrimary: '#F5F5F0',
  textSecondary: '#8A8982',
  textMuted: '#686760',
  accent: '#E6D01B',
  accentSoft: 'rgba(230, 208, 27, 0.16)',
  accentListening: '#EF4444',
  accentListeningSoft: 'rgba(239, 68, 68, 0.18)',
  accentProcessing: '#E6D01B',
  accentSpeaking: '#10B981',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.15)',
  success: '#10B981',
  // Exact Dark Mode Keypad Colors from reference design:
  // Numbers: dark charcoal circle (#1F1F1F), white text (#F5F5F0)
  // Operators & ( ) %: warm olive-khaki (#C2BC90), dark text (#181815)
  // AC & =: vibrant warm yellow (#E6D01B), dark text (#141413)
  keypadNumberBg: '#1F1F1F',
  keypadNumberText: '#F5F5F0',
  keypadOperatorBg: '#C2BC90',
  keypadOperatorText: '#181815',
  keypadFunctionBg: '#C2BC90',
  keypadFunctionText: '#181815',
  keypadEqualsBg: '#E6D01B',
  keypadEqualsText: '#141413',
};

export const LIGHT_THEME: ThemeColors = {
  isDark: false,
  background: '#F2F0E3',
  surface: '#E6E4D6',
  surfaceElevated: '#DCD9C9',
  surfaceSubtle: '#EAE8DA',
  border: '#D5D2C2',
  textPrimary: '#151513',
  textSecondary: '#7A7972',
  textMuted: '#96948B',
  accent: '#D4BE11',
  accentSoft: 'rgba(231, 209, 27, 0.22)',
  accentListening: '#DC2626',
  accentListeningSoft: 'rgba(220, 38, 38, 0.14)',
  accentProcessing: '#D97706',
  accentSpeaking: '#059669',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.12)',
  warning: '#D97706',
  warningSoft: 'rgba(217, 119, 6, 0.14)',
  success: '#059669',
  // Exact Light Mode Keypad Colors from reference design:
  keypadNumberBg: '#D5D3C7',
  keypadNumberText: '#181816',
  keypadOperatorBg: '#C8C49D',
  keypadOperatorText: '#181816',
  keypadFunctionBg: '#C8C49D',
  keypadFunctionText: '#181816',
  keypadEqualsBg: '#E7D11B',
  keypadEqualsText: '#141413',
};

export const ACCENT_PALETTES: Record<string, { dark: string; light: string; text: string }> = {
  gold: { dark: '#E6D01B', light: '#E7D11B', text: '#141413' },
  emerald: { dark: '#10B981', light: '#059669', text: '#FFFFFF' },
  cyan: { dark: '#06B6D4', light: '#0891B2', text: '#FFFFFF' },
  orange: { dark: '#F97316', light: '#EA580C', text: '#FFFFFF' },
  rose: { dark: '#F43F5E', light: '#E11D48', text: '#FFFFFF' },
};

export function getTheme(isDark: boolean, accentTheme: string = 'gold'): ThemeColors {
  const base = isDark ? { ...DARK_THEME } : { ...LIGHT_THEME };
  const palette = ACCENT_PALETTES[accentTheme] || ACCENT_PALETTES.gold;
  const accentColor = isDark ? palette.dark : palette.light;

  base.accent = accentColor;
  base.keypadEqualsBg = accentColor;
  base.keypadEqualsText = palette.text;
  base.accentSoft = `${accentColor}2E`;
  return base;
}
