import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { AppSettings, SupportedLanguage } from '../../models/types';
import { ThemeColors } from '../../theme/theme';
import { launchFloatingCalculator } from '../../utils/floatingOverlay';
import { triggerKeypadHaptic, triggerLightHaptic } from '../../utils/haptics';
import { RATE_CURRENCIES } from '../../engine/CurrencyService';
import { OfflineSpeechStatus, speechService } from '../../services/SpeechService';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const APP_VERSION: string = (() => {
  try {
    return require('../../../app.json').expo.version || '';
  } catch {
    return '';
  }
})();

interface SettingsModalProps {
  visible: boolean;
  theme: ThemeColors;
  strings: LocalizedStrings;
  settings: AppSettings;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onClose: () => void;
}

const LANGUAGES: Array<{ id: SupportedLanguage; label: string }> = [
  { id: 'en-IN', label: 'English (India) · Hinglish' },
  { id: 'en-US', label: 'English (US)' },
  { id: 'hi-IN', label: 'हिन्दी (Hindi)' },
  { id: 'es-ES', label: 'Español' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'de-DE', label: 'Deutsch' },
];

const SPEECH_STATUS_TEXT: Record<OfflineSpeechStatus, string> = {
  ready: '✓ Ready — your voice is recognized on this phone, offline.',
  'download-needed':
    'Language pack not installed yet. Download it once (about 50 MB) to recognize speech fully offline.',
  'prefer-offline':
    "Uses your phone's offline voice-typing pack. If voice fails without internet, download it below.",
  unavailable: "Speech recognition isn't available on this device.",
};

const SPEECH_RATES = [0.8, 1.0, 1.2, 1.4];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  theme,
  strings,
  settings,
  onUpdateSettings,
  onClose,
}) => {
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<OfflineSpeechStatus | null>(null);
  const [speechMessage, setSpeechMessage] = useState<string | null>(null);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

  // Offline speech pack status for the selected language
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setSpeechMessage(null);
    void speechService.getOfflineSpeechStatus(settings.language).then((st) => {
      if (alive) setSpeechStatus(st);
    });
    return () => {
      alive = false;
    };
  }, [visible, settings.language]);

  // Load saved exchange rates into editable text fields when opened
  useEffect(() => {
    if (!visible) return;
    const drafts: Record<string, string> = {};
    for (const c of RATE_CURRENCIES) {
      const v = settings.exchangeRates?.[c.code];
      drafts[c.code] = typeof v === 'number' ? String(v) : '';
    }
    setRateDrafts(drafts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const commitRate = (code: string) => {
    const raw = (rateDrafts[code] || '').replace(/,/g, '.').trim();
    const value = parseFloat(raw);
    const next = { ...(settings.exchangeRates || {}) };
    if (Number.isFinite(value) && value > 0) {
      next[code] = value;
    } else {
      delete next[code];
    }
    if (next[code] === settings.exchangeRates?.[code]) return;
    onUpdateSettings({ exchangeRates: next, exchangeRatesUpdatedAt: Date.now() });
  };

  const handleDownloadSpeech = async () => {
    void triggerKeypadHaptic();
    setSpeechMessage('Requesting download…');
    const msg = await speechService.downloadOfflineSpeech(settings.language);
    setSpeechMessage(msg);
    setSpeechStatus(await speechService.getOfflineSpeechStatus(settings.language));
  };

  const handleClose = () => {
    void triggerLightHaptic();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent={true}
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={[
          styles.container,
          {
            backgroundColor: theme.background,
            paddingTop:
              Platform.OS === 'android'
                ? (StatusBar.currentHeight || 24) + 4
                : 0,
          },
        ]}
      >
        <StatusBar
          barStyle={theme.isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent={true}
        />

        {/* Header Bar */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {strings.settingsTitle}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            onPress={handleClose}
            style={[
              styles.doneBtn,
              { backgroundColor: theme.keypadEqualsBg },
            ]}
          >
            <Text
              style={[
                styles.doneBtnText,
                { color: theme.keypadEqualsText },
              ]}
            >
              Done
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. APPEARANCE */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            APPEARANCE & THEME
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
              Theme Mode
            </Text>
            <View style={styles.themeSelectorRow}>
              {(
                [
                  { id: 'light', label: '☀️ Light', bg: '#F2F0E3', dot: '#E7D11B' },
                  { id: 'dark', label: '🌙 Dark', bg: '#0F0F0F', dot: '#E6D01B' },
                  { id: 'system', label: '📱 Auto', bg: theme.surfaceElevated, dot: '#C2BC90' },
                ] as const
              ).map((item) => {
                const selected = settings.themeMode === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${item.label} mode`}
                    onPress={() => {
                      void triggerKeypadHaptic();
                      onUpdateSettings({ themeMode: item.id });
                    }}
                    style={[
                      styles.themeCardBtn,
                      {
                        backgroundColor: selected
                          ? theme.keypadEqualsBg
                          : theme.surfaceElevated,
                        borderColor: selected
                          ? theme.keypadEqualsBg
                          : theme.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.themeSwatchCircle,
                        { backgroundColor: item.bg },
                      ]}
                    >
                      <View
                        style={[
                          styles.themeSwatchDot,
                          { backgroundColor: item.dot },
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.themeCardLabel,
                        {
                          color: selected
                            ? theme.keypadEqualsText
                            : theme.textPrimary,
                        },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Accent Color Palette */}
            <Text
              style={[
                styles.fieldLabel,
                { color: theme.textPrimary, marginTop: 18 },
              ]}
            >
              Accent Color
            </Text>
            <View style={styles.accentSelectorRow}>
              {(
                [
                  { id: 'gold', label: 'Gold', color: '#E6D01B' },
                  { id: 'emerald', label: 'Emerald', color: '#10B981' },
                  { id: 'cyan', label: 'Cyan', color: '#06B6D4' },
                  { id: 'orange', label: 'Orange', color: '#F97316' },
                  { id: 'rose', label: 'Rose', color: '#F43F5E' },
                ] as const
              ).map((acc) => {
                const selected = (settings.accentTheme || 'gold') === acc.id;
                return (
                  <TouchableOpacity
                    key={acc.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${acc.label} accent color`}
                    onPress={() => {
                      void triggerKeypadHaptic();
                      onUpdateSettings({ accentTheme: acc.id });
                    }}
                    style={[
                      styles.accentBtn,
                      {
                        backgroundColor: theme.surfaceElevated,
                        borderColor: selected ? acc.color : theme.border,
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.accentColorCircle,
                        { backgroundColor: acc.color },
                      ]}
                    />
                    <Text
                      style={[
                        styles.accentLabel,
                        {
                          color: selected ? theme.textPrimary : theme.textSecondary,
                          fontWeight: selected ? '700' : '500',
                        },
                      ]}
                    >
                      {acc.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 2. SOUND & HAPTICS */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            SOUND & HAPTICS
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
              Sound Effect Pack
            </Text>
            <View style={styles.pillGrid}>
              {(
                [
                  { id: 'modern', label: '🎵 Modern Pip' },
                  { id: 'mechanical', label: '⌨️ Mechanical' },
                  { id: 'bubble', label: '🫧 Bubble Pop' },
                  { id: 'silent', label: '🔕 Mute (Haptic only)' },
                ] as const
              ).map((snd) => {
                const selected = (settings.soundTheme || 'modern') === snd.id;
                return (
                  <TouchableOpacity
                    key={snd.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${snd.label}`}
                    onPress={() => {
                      onUpdateSettings({ soundTheme: snd.id });
                      try {
                        // eslint-disable-next-line @typescript-eslint/no-require-imports
                        const rn = require('react-native');
                        if (snd.id !== 'silent') {
                          rn.NativeModules?.ChimeModule?.playKeyClick?.(snd.id);
                          rn.NativeModules?.ChimeModule?.triggerHaptic?.(snd.id === 'mechanical' ? 'mechanical' : 'keypad');
                          setTimeout(() => {
                            try {
                              rn.NativeModules?.ChimeModule?.playChime?.(snd.id);
                            } catch {}
                          }, 130);
                        } else {
                          void triggerKeypadHaptic();
                        }
                      } catch {
                        void triggerKeypadHaptic();
                      }
                    }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: selected
                          ? theme.keypadEqualsBg
                          : theme.surfaceElevated,
                        borderColor: selected
                          ? theme.keypadEqualsBg
                          : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: selected
                            ? theme.keypadEqualsText
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {snd.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[styles.switchRow, { marginTop: 18 }]}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                  Tactile Haptics
                </Text>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                  Crisp mechanical click sensation on keypad and mic presses
                </Text>
              </View>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={(val) => {
                  void triggerLightHaptic();
                  onUpdateSettings({ hapticsEnabled: val });
                }}
                trackColor={{ false: theme.surfaceElevated, true: theme.keypadEqualsBg }}
                thumbColor={settings.hapticsEnabled ? theme.keypadEqualsText : theme.textMuted}
              />
            </View>
          </View>

          {/* 3. VOICE & SPEECH */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            VOICE & SPEECH
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                  Speak Answers Aloud (TTS)
                </Text>
                <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                  Automatically speak results after speech calculations
                </Text>
              </View>
              <Switch
                value={settings.ttsEnabled}
                onValueChange={(val) => {
                  void triggerLightHaptic();
                  onUpdateSettings({ ttsEnabled: val });
                }}
                trackColor={{ false: theme.surfaceElevated, true: theme.keypadEqualsBg }}
                thumbColor={settings.ttsEnabled ? theme.keypadEqualsText : theme.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                Recognition Language
              </Text>
              <View style={styles.pillGrid}>
                {LANGUAGES.map((lang) => {
                  const selected = settings.language === lang.id;
                  return (
                    <TouchableOpacity
                      key={lang.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Select language ${lang.label}`}
                      onPress={() => {
                        void triggerKeypadHaptic();
                        onUpdateSettings({ language: lang.id });
                      }}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: selected
                            ? theme.keypadEqualsBg
                            : theme.surfaceElevated,
                          borderColor: selected
                            ? theme.keypadEqualsBg
                            : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          {
                            color: selected
                              ? theme.keypadEqualsText
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                Offline Speech
              </Text>
              <Text style={[styles.subLabel, { color: theme.textSecondary, lineHeight: 18 }]}>
                {speechStatus ? SPEECH_STATUS_TEXT[speechStatus] : 'Checking…'}
              </Text>
              {speechMessage ? (
                <Text style={[styles.subLabel, { color: theme.keypadEqualsBg, marginTop: 6 }]}>
                  {speechMessage}
                </Text>
              ) : null}
              {(speechStatus === 'download-needed' || speechStatus === 'prefer-offline') && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Download offline speech pack"
                  onPress={() => void handleDownloadSpeech()}
                  style={[
                    styles.pill,
                    {
                      backgroundColor: theme.keypadEqualsBg,
                      borderColor: theme.keypadEqualsBg,
                      alignSelf: 'flex-start',
                      marginTop: 10,
                    },
                  ]}
                >
                  <Text style={[styles.pillText, { color: theme.keypadEqualsText }]}>
                    Download offline speech pack
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                Speech Rate
              </Text>
              <View style={styles.pillGrid}>
                {SPEECH_RATES.map((rate) => {
                  const selected = Math.abs(settings.ttsRate - rate) < 0.05;
                  return (
                    <TouchableOpacity
                      key={rate}
                      accessibilityRole="button"
                      accessibilityLabel={`Set speech rate to ${rate}x`}
                      onPress={() => {
                        void triggerKeypadHaptic();
                        onUpdateSettings({ ttsRate: rate });
                      }}
                      style={[
                        styles.pill,
                        {
                          backgroundColor: selected
                            ? theme.keypadEqualsBg
                            : theme.surfaceElevated,
                          borderColor: selected
                            ? theme.keypadEqualsBg
                            : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          {
                            color: selected
                              ? theme.keypadEqualsText
                              : theme.textSecondary,
                          },
                        ]}
                      >
                        {rate}x
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* 4. OFFLINE CURRENCY RATES */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            CURRENCY RATES (OFFLINE)
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.subLabel, { color: theme.textSecondary, lineHeight: 18, marginBottom: 10 }]}>
              The app never downloads rates. Enter today's rate once and say things like
              "100 dollars to rupees". Leave a field empty to skip that currency.
            </Text>
            {RATE_CURRENCIES.map((c) => (
              <View key={c.code} style={styles.rateRow}>
                <Text style={[styles.rateLabel, { color: theme.textPrimary }]}>1 USD =</Text>
                <TextInput
                  value={rateDrafts[c.code] ?? ''}
                  onChangeText={(t) =>
                    setRateDrafts((d) => ({ ...d, [c.code]: t.replace(/[^0-9.,]/g, '') }))
                  }
                  onEndEditing={() => commitRate(c.code)}
                  onSubmitEditing={() => commitRate(c.code)}
                  keyboardType="decimal-pad"
                  placeholder="—"
                  placeholderTextColor={theme.textMuted}
                  accessibilityLabel={`US dollar to ${c.label} rate`}
                  style={[
                    styles.rateInput,
                    {
                      color: theme.textPrimary,
                      backgroundColor: theme.surfaceElevated,
                      borderColor: theme.border,
                    },
                  ]}
                />
                <Text style={[styles.rateCode, { color: theme.textSecondary }]} numberOfLines={1}>
                  {c.code} · {c.label}
                </Text>
              </View>
            ))}
            {settings.exchangeRatesUpdatedAt ? (
              <Text style={[styles.versionText, { color: theme.textMuted, marginTop: 10 }]}>
                Rates last edited {new Date(settings.exchangeRatesUpdatedAt).toLocaleDateString()}
              </Text>
            ) : null}
          </View>

          {/* 5. QUICK ACCESS & FLOATING OVERLAY */}
          {Platform.OS === 'android' && (
            <>
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                QUICK ACCESS & FLOATING MODE
              </Text>
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
              >
                <View style={styles.switchRow}>
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                      Floating Bubble Mode
                    </Text>
                    <Text style={[styles.subLabel, { color: theme.textSecondary }]}>
                      Keep a draggable mini-calculator floating over WhatsApp, Amazon, or Excel
                    </Text>
                  </View>
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Launch Floating Bubble"
                    onPress={async () => {
                      void triggerKeypadHaptic();
                      const launched = await launchFloatingCalculator();
                      if (launched) {
                        onClose();
                      }
                    }}
                    style={[
                      styles.pill,
                      {
                        backgroundColor: theme.keypadEqualsBg,
                        borderColor: theme.keypadEqualsBg,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        { color: theme.keypadEqualsText },
                      ]}
                    >
                      Launch
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: theme.border, marginVertical: 14 },
                  ]}
                />

                <View>
                  <Text style={[styles.fieldLabel, { color: theme.textPrimary, marginBottom: 2 }]}>
                    Home Screen Widget & Quick Tile
                  </Text>
                  <Text style={[styles.subLabel, { color: theme.textSecondary, lineHeight: 17 }]}>
                    Add the VoiceCalc widget to your phone's home screen for on-screen arithmetic, or use the notification Quick Tile for instant voice calculations.
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* 5. PRIVACY & LOCAL PROCESSING */}
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            PRIVACY & SECURITY
          </Text>
          <View
            style={[
              styles.card,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.localBadgeRow}>
              <View
                style={[
                  styles.localDot,
                  { backgroundColor: theme.keypadEqualsBg },
                ]}
              />
              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.textPrimary, marginBottom: 0 },
                ]}
              >
                100% On-Device & Private
              </Text>
            </View>
            <Text
              style={[
                styles.subLabel,
                { color: theme.textSecondary, marginTop: 8, lineHeight: 18 },
              ]}
            >
              No AI service, no API keys, no accounts. Every calculation is worked out by the app on your phone, and your history never leaves it. Voice is turned into text by your phone's own speech engine — with the offline speech pack installed, that happens without internet too.
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="View Full Privacy Policy"
              onPress={() => {
                void triggerKeypadHaptic();
                setShowPrivacyPolicy(true);
              }}
              style={[
                styles.pill,
                {
                  backgroundColor: theme.surfaceElevated,
                  borderColor: theme.border,
                  marginTop: 14,
                  alignSelf: 'flex-start',
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: theme.keypadEqualsBg, fontWeight: '700', fontSize: 13 },
                ]}
              >
                🔒 Read Full Privacy Policy &rarr;
              </Text>
            </TouchableOpacity>

            <Text
              style={[
                styles.versionText,
                { color: theme.textMuted, marginTop: 14 },
              ]}
            >
              {`VoiceCalc AI${APP_VERSION ? ` • v${APP_VERSION}` : ''} • works offline`}
            </Text>
          </View>
        </ScrollView>

        {/* Offline In-App Privacy Policy Overlay View */}
        {showPrivacyPolicy && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                backgroundColor: theme.background,
                zIndex: 999,
              },
            ]}
          >
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>
                Privacy Policy
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close privacy policy"
                onPress={() => {
                  void triggerLightHaptic();
                  setShowPrivacyPolicy(false);
                }}
                style={[
                  styles.doneBtn,
                  { backgroundColor: theme.keypadEqualsBg },
                ]}
              >
                <Text
                  style={[
                    styles.doneBtnText,
                    { color: theme.keypadEqualsText },
                  ]}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={[styles.content, { paddingBottom: 60 }]}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text style={[styles.fieldLabel, { color: theme.textPrimary, fontSize: 16 }]}>
                  🔒 VoiceCalc AI Privacy Policy
                </Text>
                <Text
                  style={[
                    styles.subLabel,
                    { color: theme.textSecondary, marginTop: 12, lineHeight: 22, fontSize: 14 },
                  ]}
                >
                  {`VoiceCalc AI works on your phone. It uses no AI service, needs no API key or account, and the app itself never sends data over the internet.\n\n1. No Tracking or Telemetry\nVoiceCalc AI does not collect, record, transmit, or monetize your personal information, voice recordings, or calculations.\n\n2. On-Device Processing\nAll calculations, the understanding of spoken or typed commands, unit conversions and currency conversions (using the rates you enter) run inside the app on your phone.\n\nSpeech-to-text is performed by your phone's built-in speech service (for example Speech Services by Google). When the offline speech pack for your language is installed (Settings → Offline Speech), recognition happens fully on the device. Without it, your phone's speech service may use its own online recognition, governed by that provider's privacy policy.\n\n3. Sandboxed Storage\nYour calculation history and customized preferences remain strictly inside your phone's encrypted sandboxed storage and are never uploaded to any remote server or third party.\n\n4. Device Permissions\n• Microphone: Used solely for real-time speech input when you tap the mic. Audio streams are processed locally and discarded immediately after calculation.\n• Display Over Other Apps: Used exclusively for the optional Picture-in-Picture floating mini-calculator so you can calculate while multitasking.`}
                </Text>
              </View>
            </ScrollView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  rateLabel: {
    fontSize: 14,
    fontWeight: '600',
    width: 62,
  },
  rateInput: {
    width: 104,
    height: 40,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  rateCode: {
    flex: 1,
    fontSize: 13,
    marginLeft: 10,
  },
  doneBtn: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 16,
  },
  doneBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 18,
    marginLeft: 4,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 12,
  },
  themeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  themeCardBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1.2,
    gap: 6,
  },
  themeSwatchCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.35)',
  },
  themeSwatchDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  themeCardLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  accentSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  accentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  accentColorCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  accentLabel: {
    fontSize: 11,
  },
  pillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginTop: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  localBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  localDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  versionText: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
