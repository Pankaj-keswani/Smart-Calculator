import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { launchFloatingCalculator } from '../../utils/floatingOverlay';
import { getStrings } from '../../localization/i18n';
import {
  AppMode,
  AppSettings,
  CalculationHistoryItem,
  CalculationOutput,
  ConversationContext,
  VoiceInteractionState,
} from '../../models/types';
import { historyService } from '../../services/HistoryService';
import { settingsService } from '../../services/SettingsService';
import { smartCalcOrchestrator } from '../../services/SmartCalcOrchestrator';
import { textToSpeechService } from '../../services/TextToSpeechService';
import { getTheme, ThemeColors } from '../../theme/theme';
import { HeaderBar } from '../components/HeaderBar';
import { HistoryModal } from '../components/HistoryModal';
import { ManualCalculator } from '../components/ManualCalculator';
import { MicrophoneButton } from '../components/MicrophoneButton';
import { QuickPromptsBar } from '../components/QuickPromptsBar';
import { ResultDisplay } from '../components/ResultDisplay';
import { SettingsModal } from '../components/SettingsModal';
import { StartingAnimation } from '../components/StartingAnimation';

const INITIAL_OUTPUT: CalculationOutput = {
  success: true,
  resultNumber: 0,
  formattedResult: '0',
  displayExpression: 'Ready to calculate',
  spokenResponse: '',
};

export const HomeScreen: React.FC = () => {
  const systemColorScheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(
    settingsService.getSettings()
  );
  const [mode, setMode] = useState<AppMode>('calculator');
  const [voiceState, setVoiceState] = useState<VoiceInteractionState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [output, setOutput] = useState<CalculationOutput>(INITIAL_OUTPUT);
  const [context, setContext] = useState<ConversationContext>(
    smartCalcOrchestrator.getContext()
  );
  const [historyItems, setHistoryItems] = useState<CalculationHistoryItem[]>(
    []
  );
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [reuseVersion, setReuseVersion] = useState<number>(0);
  const [showStartingAnim, setShowStartingAnim] = useState<boolean>(true);

  // Load persisted settings and history on mount
  useEffect(() => {
    void settingsService.load().then(setSettings);
    void historyService.load().then(setHistoryItems);

    const unsubSettings = settingsService.subscribe(setSettings);
    const unsubHistory = historyService.subscribe(setHistoryItems);

    return () => {
      unsubSettings();
      unsubHistory();
    };
  }, []);

  // Resolve active theme
  const isDark =
    settings.themeMode === 'dark' ||
    (settings.themeMode === 'system' && systemColorScheme !== 'light');
  const theme: ThemeColors = getTheme(isDark, settings.accentTheme);
  const strings = getStrings(settings.language);

  const orchestratorCallbacks = {
    onVoiceStateChange: (nextState: VoiceInteractionState) => {
      setVoiceState(nextState);
    },
    onTranscriptUpdate: (text: string) => {
      setTranscript(text);
    },
    onResult: (nextOutput: CalculationOutput) => {
      setOutput(nextOutput);
    },
    onContextUpdate: (nextContext: ConversationContext) => {
      setContext(nextContext);
    },
    onNotice: (message: string | null) => {
      setVoiceNotice(message);
    },
  };

  const handleMicPress = useCallback(async () => {
    if (voiceState !== 'idle') {
      await textToSpeechService.stop();
      await smartCalcOrchestrator.stopVoiceSession(orchestratorCallbacks);
      return;
    }
    await smartCalcOrchestrator.startVoiceSession(orchestratorCallbacks);
  }, [voiceState]);

  // Keep the latest voice state / handler reachable from the one-time deep-link effect
  const voiceStateRef = useRef<VoiceInteractionState>(voiceState);
  voiceStateRef.current = voiceState;
  const initialUrlHandledRef = useRef(false);

  // Deep linking & Quick Settings Tile / Widget / Shortcuts auto-activation.
  // Registered ONCE: re-running this effect on every voice-state change used to
  // re-read the same initial "smartcalc://voice" URL and toggle the mic off/on.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (url.includes('voice')) {
        setMode('voice');
        setTimeout(() => {
          // Start listening (never toggle off) when launched from widget / tile
          if (voiceStateRef.current === 'idle') {
            void smartCalcOrchestrator.startVoiceSession(orchestratorCallbacks);
          }
        }, 350);
      } else if (url.includes('history')) {
        setHistoryModalVisible(true);
      }
    };

    void Linking.getInitialURL().then((url) => {
      if (initialUrlHandledRef.current) return;
      initialUrlHandledRef.current = true;
      handleUrl(url);
    });
    const sub = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => {
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNaturalCommandSubmit = useCallback(async (cmd: string) => {
    await smartCalcOrchestrator.processCommand(cmd, orchestratorCallbacks);
  }, []);

  const handleResetContext = useCallback(() => {
    const nextCtx = smartCalcOrchestrator.resetContext();
    setContext(nextCtx);
    setTranscript('');
    setOutput(INITIAL_OUTPUT);
  }, []);

  const handleSpeakAgain = useCallback(() => {
    const toSpeak =
      output.spokenResponse || `The answer is ${output.formattedResult}.`;
    void textToSpeechService.speak(toSpeak, {
      onStart: () => setVoiceState('speaking'),
      onDone: () => setVoiceState('idle'),
    });
  }, [output]);

  const handleManualCalcComplete = useCallback(
    async (expr: string, calcOutput: CalculationOutput) => {
      setOutput(calcOutput);
      setTranscript('');
      if (typeof calcOutput.resultNumber === 'number') {
        smartCalcOrchestrator.setLastCalculationContext(
          calcOutput.resultNumber,
          calcOutput.formattedResult,
          expr
        );
        setContext(smartCalcOrchestrator.getContext());
        await historyService.addEntry({
          originalCommand: expr,
          interpretedExpression: expr,
          result: calcOutput.formattedResult,
          numericResult: calcOutput.resultNumber,
          mode: 'calculator',
        });
      }
    },
    []
  );

  const handleReuseHistoryItem = useCallback((item: CalculationHistoryItem) => {
    const numeric =
      typeof item.numericResult === 'number'
        ? item.numericResult
        : Number(item.result.replace(/[^0-9.-]/g, ''));

    setReuseVersion((v) => v + 1);
    setTranscript(item.originalCommand);
    setOutput({
      success: true,
      resultNumber: Number.isFinite(numeric) ? numeric : undefined,
      formattedResult: item.result,
      displayExpression: item.interpretedExpression,
      spokenResponse: `The answer is ${item.result}.`,
      unit: item.unit,
    });

    if (Number.isFinite(numeric)) {
      smartCalcOrchestrator.setLastCalculationContext(
        numeric,
        item.result,
        item.interpretedExpression,
        item.unit
      );
      setContext(smartCalcOrchestrator.getContext());
    }
  }, []);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <KeyboardAvoidingView
        style={styles.flexContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top Bar: App Name, Status, Voice/Keypad Switcher, History & Settings */}
        <HeaderBar
          theme={theme}
          strings={strings}
          mode={mode}
          onModeChange={setMode}
          onOpenHistory={() => setHistoryModalVisible(true)}
          onOpenSettings={() => setSettingsModalVisible(true)}
          onLaunchFloating={() => void launchFloatingCalculator()}
          historyCount={historyItems.length}
        />

        {mode === 'voice' ? (
          <View style={styles.voiceModeBody}>
            {/* Center Result & Expression Display */}
            <View style={styles.centerDisplayZone}>
              <ResultDisplay
                theme={theme}
                strings={strings}
                transcript={transcript}
                notice={voiceNotice}
                output={output}
                context={context}
                onResetContext={handleResetContext}
                onSpeakAgain={handleSpeakAgain}
              />
            </View>

            {/* Primary Central Microphone Control */}
            <MicrophoneButton
              theme={theme}
              strings={strings}
              voiceState={voiceState}
              onPress={handleMicPress}
            />

            {/* Bottom Natural Language Command Bar & Quick Voice Chips */}
            <QuickPromptsBar
              theme={theme}
              strings={strings}
              onSubmitCommand={handleNaturalCommandSubmit}
            />
          </View>
        ) : (
          <ManualCalculator
            theme={theme}
            initialValue={
              context.lastResult !== null ? String(context.lastResult) : ''
            }
            currentExpression={output.displayExpression}
            currentResult={output.formattedResult}
            reuseVersion={reuseVersion}
            voiceState={voiceState}
            transcript={transcript}
            voiceNotice={voiceNotice}
            historyItems={historyItems}
            onSelectHistoryItem={handleReuseHistoryItem}
            onOpenHistory={() => setHistoryModalVisible(true)}
            onClearHistory={() => void historyService.clearAll()}
            onDeleteHistoryItem={(id) => void historyService.deleteItem(id)}
            onCalculationComplete={handleManualCalcComplete}
            onTriggerVoice={handleMicPress}
          />
        )}

        {/* History Modal (Used for Voice mode or backup) */}
        <HistoryModal
          visible={historyModalVisible}
          theme={theme}
          strings={strings}
          items={historyItems}
          onClose={() => setHistoryModalVisible(false)}
          onSelectReuse={handleReuseHistoryItem}
          onDeleteItem={(id) => void historyService.deleteItem(id)}
          onClearAll={() => void historyService.clearAll()}
        />

        {/* Settings Modal */}
        <SettingsModal
          visible={settingsModalVisible}
          theme={theme}
          strings={strings}
          settings={settings}
          onUpdateSettings={(partial) =>
            void settingsService.updateSettings(partial)
          }
          onClose={() => setSettingsModalVisible(false)}
        />
      </KeyboardAvoidingView>

      {/* Starting Launch Animation Reveal */}
      {showStartingAnim && (
        <StartingAnimation
          theme={theme}
          onFinish={() => setShowStartingAnim(false)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
    paddingBottom: Platform.OS === 'android' ? 10 : 0,
  },
  flexContainer: {
    flex: 1,
  },
  voiceModeBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  centerDisplayZone: {
    flex: 1,
    justifyContent: 'center',
  },
});
