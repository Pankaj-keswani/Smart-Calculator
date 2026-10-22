import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  FlatList,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  CalcDomainError,
  calculationService,
} from '../../engine/CalculationService';
import {
  CalculationHistoryItem,
  CalculationOutput,
  VoiceInteractionState,
} from '../../models/types';
import { mathStreamFilter } from '../../parser/MathStreamFilter';
import { groupDigits, groupingForLanguage } from '../../utils/numberFormat';
import { settingsService } from '../../services/SettingsService';
import { smartCalcOrchestrator } from '../../services/SmartCalcOrchestrator';
import { ThemeColors } from '../../theme/theme';
import {
  triggerErrorHaptic,
  triggerHeavyHaptic,
  triggerKeypadHaptic,
  triggerLightHaptic,
  triggerMediumHaptic,
  triggerSuccessHaptic,
} from '../../utils/haptics';
import { playKeySound } from '../../utils/sound';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ManualCalculatorProps {
  theme: ThemeColors;
  initialValue?: string;
  currentExpression?: string;
  currentResult?: string;
  reuseVersion?: number;
  voiceState?: VoiceInteractionState;
  transcript?: string;
  /** Short status line from the voice pipeline ("Didn't catch …", mic problems). */
  voiceNotice?: string | null;
  historyItems?: CalculationHistoryItem[];
  onSelectHistoryItem?: (item: CalculationHistoryItem) => void;
  onOpenHistory?: () => void;
  onClearHistory?: () => void;
  onDeleteHistoryItem?: (id: string) => void;
  onCalculationComplete: (
    expression: string,
    output: CalculationOutput
  ) => void;
  onTriggerVoice?: () => void;
}

const SCIENTIFIC_KEYS = [
  { label: '√', insert: 'sqrt(', a11y: 'Square root' },
  { label: 'xʸ', insert: '^', a11y: 'Power' },
  { label: 'sin', insert: 'sin(', a11y: 'Sine' },
  { label: 'cos', insert: 'cos(', a11y: 'Cosine' },
  { label: 'tan', insert: 'tan(', a11y: 'Tangent' },
  { label: 'log', insert: 'log(', a11y: 'Logarithm base 10' },
  { label: 'ln', insert: 'ln(', a11y: 'Natural logarithm' },
  { label: 'n!', insert: '!', a11y: 'Factorial' },
  { label: 'π', insert: 'π', a11y: 'Pi' },
];

export const ManualCalculator: React.FC<ManualCalculatorProps> = ({
  theme,
  initialValue = '',
  currentExpression,
  currentResult,
  reuseVersion = 0,
  voiceState = 'idle',
  transcript = '',
  voiceNotice = null,
  historyItems = [],
  onSelectHistoryItem,
  onOpenHistory,
  onClearHistory,
  onDeleteHistoryItem,
  onCalculationComplete,
  onTriggerVoice,
}) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [expression, setExpression] = useState<string>(
    currentExpression && currentExpression !== 'Ready to calculate'
      ? currentExpression
      : initialValue
  );
  const [livePreview, setLivePreview] = useState<string>(
    currentResult &&
      currentResult !== 'Error' &&
      currentResult !== '—' &&
      currentResult !== '0'
      ? currentResult
      : ''
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showScientific, setShowScientific] = useState<boolean>(false);
  const [isResultCalculated, setIsResultCalculated] = useState<boolean>(false);
  const [isHistoryFullyOpen, setIsHistoryFullyOpen] = useState<boolean>(false);

  // iPhone-style interactive continuous pull-down History Animation (0 to 1)
  const historyProgress = useRef(new Animated.Value(0)).current;
  const isDraggingRef = useRef(false);

  // Horizontal ScrollView ref for long expressions (keeps newly typed digits in view and allows swiping)
  const expressionScrollRef = useRef<ScrollView>(null);
  const scrollViewWidthRef = useRef<number>(0);
  const [isExpressionOverflowing, setIsExpressionOverflowing] = useState(false);

  // Display-only digit grouping (1,50,000 for Indian languages, 150,000 otherwise)
  const grouping = groupingForLanguage(settingsService.getSettings().language);
  const displayExpression = expression
    ? groupDigits(expression.replace(/\*/g, '×').replace(/\//g, '÷'), grouping)
    : '0';

  // Shrink long expressions step by step before falling back to sideways scrolling
  const getExpressionFontSize = (len: number): number => {
    if (len <= 7) return 64;
    if (len <= 10) return 54;
    if (len <= 13) return 44;
    if (len <= 17) return 36;
    if (len <= 22) return 30;
    return 26;
  };

  useEffect(() => {
    if (expression) {
      const timer = setTimeout(() => {
        expressionScrollRef.current?.scrollToEnd({ animated: true });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [expression, isExpressionOverflowing]);

  // Pulse animation for the Long Mic / ON Button when active
  const micPulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (voiceState === 'listening') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(micPulseAnim, {
            toValue: 1.04,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(micPulseAnim, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      micPulseAnim.setValue(1);
    }
  }, [voiceState, micPulseAnim]);

  // Smooth fade/slide animation when display updates
  const resultFadeAnim = useRef(new Animated.Value(1)).current;
  const animateDisplayResult = () => {
    resultFadeAnim.setValue(0.65);
    Animated.spring(resultFadeAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  };

  const openHistorySmooth = () => {
    Animated.spring(historyProgress, {
      toValue: 1,
      friction: 7,
      tension: 40,
      useNativeDriver: true,
    }).start(() => {
      setIsHistoryFullyOpen(true);
    });
  };

  const closeHistorySmooth = () => {
    setIsHistoryFullyOpen(false);
    Animated.spring(historyProgress, {
      toValue: 0,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  };

  const handleCopy = async (text: string) => {
    void triggerLightHaptic();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
    } catch {
      // Ignore
    }
  };

  const handleShare = async (item: CalculationHistoryItem) => {
    void triggerLightHaptic();
    try {
      await Share.share({
        message: `${item.interpretedExpression} = ${item.result}`,
      });
    } catch {
      // Ignore
    }
  };

  const handleDeleteHistory = (id: string) => {
    void triggerLightHaptic();
    onDeleteHistoryItem?.(id);
  };

  // Connect external onOpenHistory (from top HeaderBar clock) to smooth sliding sheet
  useEffect(() => {
    // If parent calls onOpenHistory, open smoothly
  }, []);

  // Continuous 1-to-1 Interactive PanResponder for iPhone Calculator Style History Pull-Down
  // Responsive drag distance for smooth 1:1 finger tracking
  const maxDragY = Math.max(screenHeight * 0.35, 240);

  const displayPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dy > 4 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
        gestureState.dy > 4 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dy > 0) {
          const ratio = Math.min(gestureState.dy / maxDragY, 1);
          historyProgress.setValue(ratio);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        isDraggingRef.current = false;
        if (
          gestureState.dy > 45 ||
          (gestureState.dy > 15 && gestureState.vy > 0.25)
        ) {
          void triggerMediumHaptic();
          openHistorySmooth();
        } else {
          closeHistorySmooth();
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        closeHistorySmooth();
      },
    })
  ).current;

  // Hardware / System Navigation Back Button Support (Android)
  useEffect(() => {
    if (!isHistoryFullyOpen) return;

    const onHardwareBack = () => {
      void triggerLightHaptic();
      closeHistorySmooth();
      return true; // handled, don't exit app
    };

    const backSubscription = BackHandler.addEventListener(
      'hardwareBackPress',
      onHardwareBack
    );

    return () => {
      backSubscription.remove();
    };
  }, [isHistoryFullyOpen]);

  // PanResponder to swipe UP and dismiss the history sheet
  const historySheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dy < -6 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
      onMoveShouldSetPanResponderCapture: (_evt, gestureState) =>
        gestureState.dy < -8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.2,
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
      },
      onPanResponderMove: (_evt, gestureState) => {
        if (gestureState.dy < 0) {
          // Dragging up to dismiss
          const ratio = Math.max(1 - Math.abs(gestureState.dy) / 220, 0);
          historyProgress.setValue(ratio);
        }
      },
      onPanResponderRelease: (_evt, gestureState) => {
        isDraggingRef.current = false;
        if (
          gestureState.dy < -25 ||
          (gestureState.dy < -8 && gestureState.vy < -0.2)
        ) {
          void triggerLightHaptic();
          closeHistorySmooth();
        } else {
          openHistorySmooth();
        }
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        openHistorySmooth();
      },
    })
  ).current;

  // Live real-time speech-to-math display synchronization as user speaks
  useEffect(() => {
    if (voiceState === 'listening' || voiceState === 'processing') {
      if (!transcript || !transcript.trim()) {
        return;
      }

      const context = smartCalcOrchestrator.getContext();
      const filtered = mathStreamFilter.filter(transcript, context);

      if (filtered.cleanMathText) {
        const pretty = calculationService.prettifyExpression(filtered.cleanMathText);
        setExpression(pretty);
        setErrorMsg(null);

        // Compute live calculation preview if expression has operators
        try {
          const openCount = (filtered.cleanMathText.match(/\(/g) || []).length;
          const closeCount = (filtered.cleanMathText.match(/\)/g) || []).length;
          const balanced =
            openCount > closeCount
              ? filtered.cleanMathText + ')'.repeat(openCount - closeCount)
              : filtered.cleanMathText;
          if (/[0-9]/.test(balanced) && /[+\-*/^×÷%]/.test(balanced)) {
            const val = calculationService.evaluateExpression(balanced);
            setLivePreview(calculationService.formatNumber(val));
          }
        } catch {
          // Keep preview as-is while user continues speaking
        }
      } else {
        // Show spoken words so user knows speech is actively heard
        setExpression(transcript);
        setErrorMsg(null);
      }
    }
  }, [transcript, voiceState]);

  // Synchronize when outer calculation (voice finalized, natural command, or history reuse) updates
  useEffect(() => {
    if (
      currentExpression &&
      currentExpression !== 'Ready to calculate' &&
      currentExpression !== 'Voice input'
    ) {
      const hasValidResult =
        Boolean(currentResult) &&
        currentResult !== 'Error' &&
        currentResult !== '—';

      if (hasValidResult) {
        const prettyExpr = calculationService.prettifyExpression(currentExpression);
        setExpression(prettyExpr);
        setLivePreview(currentResult!);
        setIsResultCalculated(true);
        setErrorMsg(null);
        animateDisplayResult();
      }
    }
  }, [currentExpression, currentResult, reuseVersion]);

  const updatePreview = (nextExpr: string) => {
    setErrorMsg(null);
    if (!nextExpr.trim()) {
      setLivePreview('');
      return;
    }
    try {
      const openCount = (nextExpr.match(/\(/g) || []).length;
      const closeCount = (nextExpr.match(/\)/g) || []).length;
      const balanced =
        openCount > closeCount
          ? nextExpr + ')'.repeat(openCount - closeCount)
          : nextExpr;
      const val = calculationService.evaluateExpression(balanced);
      setLivePreview(calculationService.formatNumber(val));
    } catch {
      setLivePreview('');
    }
  };

  const handleAppend = (token: string) => {
    let next: string;
    const cleanToken = token === '*' ? '×' : token === '/' ? '÷' : token;
    const isOperator = /^[+\-*/×÷^%]/.test(cleanToken);

    if (isResultCalculated) {
      setIsResultCalculated(false);
      if (isOperator) {
        // Operator chains onto the calculated result (e.g. 114+...)
        const baseVal = livePreview || expression;
        next = baseVal + cleanToken;
      } else {
        // Number or function starts a fresh calculation
        next = cleanToken;
      }
    } else if (expression === '0') {
      if (cleanToken === '.' || isOperator) {
        next = '0' + cleanToken;
      } else {
        next = cleanToken;
      }
    } else {
      next = expression + cleanToken;
    }

    setExpression(next);
    updatePreview(next);
  };

  const handleSmartParenthesis = () => {
    if (isResultCalculated) {
      setIsResultCalculated(false);
      setExpression('(');
      updatePreview('(');
      return;
    }

    const openCount = (expression.match(/\(/g) || []).length;
    const closeCount = (expression.match(/\)/g) || []).length;
    const lastChar = expression.slice(-1);

    let next: string;
    if (openCount > closeCount && /[0-9)!π%]/.test(lastChar)) {
      next = expression + ')';
    } else if (/[0-9)!π%]/.test(lastChar)) {
      next = expression + '×(';
    } else {
      next = expression + '(';
    }

    setExpression(next);
    updatePreview(next);
  };

  const handleClear = () => {
    setExpression('');
    setLivePreview('');
    setIsResultCalculated(false);
    setErrorMsg(null);
  };

  const handleBackspace = () => {
    if (isResultCalculated) {
      setIsResultCalculated(false);
    }
    const next = expression.slice(0, -1);
    setExpression(next);
    updatePreview(next);
  };

  const handleEquals = () => {
    if (!expression.trim()) return;

    const trimmed = expression.trim();
    if (/[+\-*/×÷^]$/.test(trimmed)) {
      void triggerErrorHaptic();
      setErrorMsg('Calculation is still pending');
      return;
    }

    try {
      const openCount = (expression.match(/\(/g) || []).length;
      const closeCount = (expression.match(/\)/g) || []).length;
      const balancedExpr =
        openCount > closeCount
          ? expression + ')'.repeat(openCount - closeCount)
          : expression;

      const numericVal = calculationService.evaluateExpression(balancedExpr);
      const formatted = calculationService.formatNumber(numericVal);
      const prettyExpr = calculationService
        .prettifyExpression(balancedExpr)
        .replace(/\s+/g, '');

      const output: CalculationOutput = {
        success: true,
        resultNumber: numericVal,
        formattedResult: formatted,
        displayExpression: prettyExpr,
        spokenResponse: `The answer is ${formatted}.`,
      };

      setExpression(prettyExpr);
      setLivePreview(formatted);
      setIsResultCalculated(true);
      setErrorMsg(null);
      void triggerSuccessHaptic();
      animateDisplayResult();
      onCalculationComplete(prettyExpr, output);
    } catch (err) {
      void triggerErrorHaptic();
      const friendly =
        err instanceof CalcDomainError
          ? err.friendlyMessage
          : 'Calculation is still pending';
      setErrorMsg(friendly);
    }
  };

  const toggleScientificRow = () => {
    void triggerLightHaptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowScientific((prev) => !prev);
  };

  const handleSelectPastItem = (item: CalculationHistoryItem) => {
    void triggerMediumHaptic();
    closeHistorySmooth();
    onSelectHistoryItem?.(item);
  };

  // Compute exact circular button dimensions so all 5 rows of circles fit any device screen
  const horizontalPad = 18;
  const gridGap = 11;
  const maxWidthPerBtn = Math.floor(
    (screenWidth - horizontalPad * 2 - gridGap * 3) / 4
  );
  const availableGridHeight = screenHeight - (showScientific ? 335 : 290);
  const maxHeightPerBtn = Math.floor((availableGridHeight - gridGap * 4) / 5);
  const circleSize = Math.max(
    54,
    Math.min(maxWidthPerBtn, maxHeightPerBtn, 82)
  );

  const isListening = voiceState === 'listening';
  const isProcessing = voiceState === 'processing';
  const isSpeaking = voiceState === 'speaking';
  const isVoiceActive = voiceState !== 'idle';

  // Smooth interpolations for iPhone Calculator style interactive pull-down
  const displayTranslateY = historyProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, screenHeight * 0.45],
  });

  const displayOpacity = historyProgress.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0.5, 0],
  });

  const historyTapeTranslateY = historyProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenHeight, 0],
  });

  const historyTapeOpacity = historyProgress.interpolate({
    inputRange: [0, 0.08, 0.4, 1],
    outputRange: [0, 0.25, 0.9, 1],
  });

  const keypadOpacity = historyProgress.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: [1, 0.85, 0.15, 0],
  });

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingHorizontal: horizontalPad,
        },
      ]}
    >
      {/* 1. iPhone Calculator Style Interactive History Sliding Sheet (comes down smoothly from top) */}
      <Animated.View
        {...historySheetPanResponder.panHandlers}
        style={[
          styles.historySlidingSheet,
          {
            backgroundColor: theme.background,
            opacity: historyTapeOpacity,
            transform: [{ translateY: historyTapeTranslateY }],
          },
        ]}
        pointerEvents={isHistoryFullyOpen ? 'auto' : 'none'}
      >
        {/* Drag Handle Bar & Header */}
        <View style={styles.historyHeaderZone}>
          <View
            style={[
              styles.historyPullHandle,
              { backgroundColor: theme.textMuted },
            ]}
          />
          <View style={styles.historyTitleRow}>
            <View>
              <Text
                style={[styles.historyHeaderTitle, { color: theme.textPrimary }]}
              >
                Calculation History
              </Text>
              <Text
                style={[
                  styles.historyHeaderSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {historyItems.length}{' '}
                {historyItems.length === 1 ? 'calculation' : 'calculations'} • Tap
                to reuse
              </Text>
            </View>

            <View style={styles.historyActionButtons}>
              {historyItems.length > 0 && onClearHistory && (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Clear all calculation history"
                  onPress={() => {
                    void triggerLightHaptic();
                    onClearHistory();
                  }}
                  style={[
                    styles.historyClearBtn,
                    { backgroundColor: theme.dangerSoft },
                  ]}
                >
                  <Text
                    style={[styles.historyClearBtnText, { color: theme.danger }]}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close calculation history sheet"
                onPress={closeHistorySmooth}
                style={[
                  styles.historyCloseBtn,
                  { backgroundColor: theme.surfaceElevated },
                ]}
              >
                <Text
                  style={[styles.historyCloseBtnText, { color: theme.textPrimary }]}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Scrollable History List */}
        {historyItems.length === 0 ? (
          <View style={styles.historyEmptyBox}>
            <Text
              style={[styles.historyEmptyText, { color: theme.textSecondary }]}
            >
              No previous calculations yet.
            </Text>
            <Text
              style={[styles.historyEmptyHint, { color: theme.textMuted }]}
            >
              Swipe up or tap Done to return
            </Text>
          </View>
        ) : (
          <FlatList
            data={historyItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.historyListContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.historyItemCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Reuse calculation ${item.interpretedExpression} equals ${item.result}`}
                  activeOpacity={0.7}
                  onPress={() => handleSelectPastItem(item)}
                >
                  <View style={styles.historyItemHeader}>
                    <Text
                      style={[
                        styles.historyItemModeTag,
                        { color: theme.accent },
                      ]}
                    >
                      {item.mode === 'voice' ? '🎙️ VOICE' : '⌨️ KEYPAD'}
                    </Text>
                    <Text
                      style={[
                        styles.historyItemTimestamp,
                        { color: theme.textMuted },
                      ]}
                    >
                      {new Date(item.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>

                  {item.originalCommand &&
                    item.originalCommand !== item.interpretedExpression && (
                      <Text
                        style={[
                          styles.historyItemOriginalCmd,
                          { color: theme.textSecondary },
                        ]}
                      >
                        “{item.originalCommand}”
                      </Text>
                    )}

                  <View style={styles.historyItemMathRow}>
                    <Text
                      style={[
                        styles.historyItemExpr,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {(item.interpretedExpression || '').replace(/\*/g, '×').replace(/\//g, '÷')} =
                    </Text>
                    <Text
                      style={[
                        styles.historyItemResult,
                        { color: theme.textPrimary },
                      ]}
                    >
                      {groupDigits(item.result, grouping)}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Card Action Row: Reuse, Copy, Share, Delete */}
                <View
                  style={[
                    styles.historyCardActions,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Reuse this calculation"
                    onPress={() => handleSelectPastItem(item)}
                    style={styles.cardActionBtn}
                  >
                    <Text
                      style={[styles.cardActionText, { color: theme.accent }]}
                    >
                      ↺ Reuse
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Copy calculation result"
                    onPress={() => handleCopy(item.result)}
                    style={styles.cardActionBtn}
                  >
                    <Text
                      style={[
                        styles.cardActionText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      ⎘ Copy
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Share calculation"
                    onPress={() => handleShare(item)}
                    style={styles.cardActionBtn}
                  >
                    <Text
                      style={[
                        styles.cardActionText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      ↗ Share
                    </Text>
                  </TouchableOpacity>

                  {onDeleteHistoryItem && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel="Delete calculation"
                      onPress={() => handleDeleteHistory(item.id)}
                      style={styles.cardActionBtn}
                    >
                      <Text
                        style={[styles.cardActionText, { color: theme.danger }]}
                      >
                        ✕ Delete
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          />
        )}
      </Animated.View>

      {/* 2. Seamless Top Display Area with Interactive Pull-Down Gesture */}
      <Animated.View
        {...displayPanResponder.panHandlers}
        style={[
          styles.displayArea,
          {
            transform: [{ translateY: displayTranslateY }],
            opacity: displayOpacity,
          },
        ]}
      >
        <View style={styles.displayTouchZone}>
          {/* Main Expression Line with horizontal scroll for unlimited calculation length */}
          <ScrollView
            ref={expressionScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => {
              scrollViewWidthRef.current = e.nativeEvent.layout.width;
            }}
            contentContainerStyle={[
              styles.expressionScrollContent,
              {
                justifyContent: isExpressionOverflowing ? 'flex-start' : 'flex-end',
              },
            ]}
            style={styles.expressionScrollView}
            onContentSizeChange={(w) => {
              const overflowing =
                scrollViewWidthRef.current > 0 &&
                w > scrollViewWidthRef.current + 4;
              if (overflowing !== isExpressionOverflowing) {
                setIsExpressionOverflowing(overflowing);
              }
              expressionScrollRef.current?.scrollToEnd({ animated: true });
            }}
          >
            <Text
              style={[
                styles.expressionText,
                {
                  color: theme.textPrimary,
                  fontSize: getExpressionFontSize(displayExpression.length),
                  textAlign: isExpressionOverflowing ? 'left' : 'right',
                },
              ]}
              accessibilityLabel={`Current expression: ${expression || '0'}`}
            >
              {displayExpression}
            </Text>
          </ScrollView>

          {/* Secondary Result Line (e.g. 114) */}
          {errorMsg ? (
            <Text
              style={[styles.errorPreviewText, { color: theme.danger }]}
              numberOfLines={1}
            >
              {errorMsg}
            </Text>
          ) : (
            <Animated.Text
              style={[
                styles.resultPreviewText,
                {
                  color: theme.textSecondary,
                  opacity: resultFadeAnim,
                  transform: [{ scale: resultFadeAnim }],
                },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              accessibilityLabel={
                livePreview ? `Result: ${livePreview}` : undefined
              }
            >
              {livePreview ? groupDigits(livePreview, grouping) : ' '}
            </Animated.Text>
          )}
        </View>
      </Animated.View>

      {/* 3. Middle Control Bar: Left Double-Chevron (⌃⌄) + Long Mic / ON Button */}
      <Animated.View
        style={[
          styles.middleBarRow,
          { opacity: keypadOpacity },
        ]}
      >
        {/* Left: Double Chevron Expand/Collapse Icon */}
        <View style={{ width: circleSize, alignItems: 'flex-start' }}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Toggle scientific calculator keys"
            onPress={toggleScientificRow}
            style={styles.chevronBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text
              style={[styles.chevronSymbol, { color: theme.textPrimary }]}
            >
              ⌃
            </Text>
            <Text
              style={[
                styles.chevronSymbol,
                styles.chevronBottom,
                { color: theme.textPrimary },
              ]}
            >
              ⌄
            </Text>
          </TouchableOpacity>
        </View>

        {/* Marked Place: Long Mic / ON Pill Button spanning across the right 3 columns */}
        {onTriggerVoice && (
          <Animated.View
            style={[
              styles.longMicWrapper,
              { transform: [{ scale: micPulseAnim }] },
            ]}
          >
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                isListening
                  ? 'Microphone is on and listening. Tap to turn off.'
                  : 'Turn on voice input'
              }
              activeOpacity={0.85}
              onPress={() => {
                void triggerMediumHaptic();
                onTriggerVoice();
              }}
              style={[
                styles.longMicButton,
                {
                  backgroundColor: isListening
                    ? theme.keypadEqualsBg
                    : isProcessing || isSpeaking
                    ? theme.keypadOperatorBg
                    : theme.isDark
                    ? '#1F1F1F'
                    : '#DFDDD0',
                  borderColor: isVoiceActive
                    ? theme.keypadEqualsBg
                    : theme.isDark
                    ? '#33322B'
                    : '#C8C49D',
                },
              ]}
            >
              {/* Status Dot / Mic Indicator */}
              <View
                style={[
                  styles.micIndicatorCircle,
                  {
                    backgroundColor: isListening
                      ? '#141413'
                      : theme.keypadEqualsBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.micIconGlyph,
                    {
                      color: isListening ? theme.keypadEqualsBg : '#141413',
                    },
                  ]}
                >
                  {isListening ? '●' : '🎙'}
                </Text>
              </View>

              {/* Center Text / Live Transcript */}
              <Text
                style={[
                  styles.longMicLabel,
                  {
                    color: isVoiceActive ? '#141413' : theme.textPrimary,
                  },
                ]}
                numberOfLines={1}
              >
                {isListening
                  ? transcript
                    ? `"${transcript}"`
                    : voiceNotice || 'Listening… say your sum'
                  : isProcessing
                  ? 'Calculating…'
                  : isSpeaking
                  ? 'Speaking answer…'
                  : voiceNotice || 'Tap to speak'}
              </Text>

              {/* ON / OFF Pill Badge */}
              <View
                style={[
                  styles.onOffPill,
                  {
                    backgroundColor: isVoiceActive
                      ? '#141413'
                      : theme.keypadOperatorBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.onOffPillText,
                    {
                      color: isVoiceActive ? theme.keypadEqualsBg : '#141413',
                    },
                  ]}
                >
                  {isVoiceActive ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>
          </Animated.View>
        )}
      </Animated.View>

      {/* 4. Expandable Scientific Drawer (Toggled by ⌃⌄ button) */}
      {showScientific && (
        <Animated.View
          style={[styles.sciDrawer, { opacity: keypadOpacity }]}
        >
          {SCIENTIFIC_KEYS.map((item) => (
            <TouchableOpacity
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.a11y}
              onPress={() => handleAppend(item.insert)}
              style={[
                styles.sciPill,
                {
                  backgroundColor: theme.isDark ? '#1F1F1F' : '#DFDDD0',
                },
              ]}
            >
              <Text
                style={[styles.sciPillText, { color: theme.textPrimary }]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* 5. Main 5x4 Circular Keypad */}
      <Animated.View
        style={[
          styles.keypadGrid,
          { gap: gridGap, opacity: keypadOpacity },
        ]}
      >
        {/* Row 1: AC, ( ), %, ÷ */}
        <View style={[styles.keyRow, { gap: gridGap }]}>
          <CircleCalcButton
            label="AC"
            a11y="All Clear"
            size={circleSize}
            onPress={handleClear}
            bg={theme.keypadEqualsBg}
            color={theme.keypadEqualsText}
            fontSize={24}
            fontWeight="500"
            hapticStyle="heavy"
          />
          <CircleCalcButton
            label="( )"
            a11y="Parentheses"
            size={circleSize}
            onPress={handleSmartParenthesis}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={24}
            fontWeight="500"
          />
          <CircleCalcButton
            label="%"
            a11y="Percent"
            size={circleSize}
            onPress={() => handleAppend('%')}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={26}
            fontWeight="500"
          />
          <CircleCalcButton
            label="÷"
            a11y="Divide"
            size={circleSize}
            onPress={() => handleAppend('÷')}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={34}
            fontWeight="400"
          />
        </View>

        {/* Row 2: 7, 8, 9, × */}
        <View style={[styles.keyRow, { gap: gridGap }]}>
          <CircleCalcButton
            label="7"
            size={circleSize}
            onPress={() => handleAppend('7')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="8"
            size={circleSize}
            onPress={() => handleAppend('8')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="9"
            size={circleSize}
            onPress={() => handleAppend('9')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="×"
            a11y="Multiply"
            size={circleSize}
            onPress={() => handleAppend('×')}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={32}
            fontWeight="400"
          />
        </View>

        {/* Row 3: 4, 5, 6, − */}
        <View style={[styles.keyRow, { gap: gridGap }]}>
          <CircleCalcButton
            label="4"
            size={circleSize}
            onPress={() => handleAppend('4')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="5"
            size={circleSize}
            onPress={() => handleAppend('5')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="6"
            size={circleSize}
            onPress={() => handleAppend('6')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="−"
            a11y="Subtract"
            size={circleSize}
            onPress={() => handleAppend('-')}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={34}
            fontWeight="400"
          />
        </View>

        {/* Row 4: 1, 2, 3, + */}
        <View style={[styles.keyRow, { gap: gridGap }]}>
          <CircleCalcButton
            label="1"
            size={circleSize}
            onPress={() => handleAppend('1')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="2"
            size={circleSize}
            onPress={() => handleAppend('2')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="3"
            size={circleSize}
            onPress={() => handleAppend('3')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="+"
            a11y="Add"
            size={circleSize}
            onPress={() => handleAppend('+')}
            bg={theme.keypadOperatorBg}
            color={theme.keypadOperatorText}
            fontSize={34}
            fontWeight="400"
          />
        </View>

        {/* Row 5: 0, ., Backspace [×], = */}
        <View style={[styles.keyRow, { gap: gridGap }]}>
          <CircleCalcButton
            label="0"
            size={circleSize}
            onPress={() => handleAppend('0')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
          />
          <CircleCalcButton
            label="."
            a11y="Decimal point"
            size={circleSize}
            onPress={() => handleAppend('.')}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
            fontSize={32}
          />
          <CircleCalcButton
            label="⌫"
            a11y="Backspace"
            size={circleSize}
            onPress={handleBackspace}
            bg={theme.keypadNumberBg}
            color={theme.keypadNumberText}
            customChild={
              <View
                style={[
                  styles.backspaceBox,
                  { borderColor: theme.keypadNumberText },
                ]}
              >
                <Text
                  style={[
                    styles.backspaceCross,
                    { color: theme.keypadNumberText },
                  ]}
                >
                  ×
                </Text>
              </View>
            }
          />
          <CircleCalcButton
            label="="
            a11y="Equals"
            size={circleSize}
            onPress={handleEquals}
            bg={theme.keypadEqualsBg}
            color={theme.keypadEqualsText}
            fontSize={36}
            fontWeight="400"
            hapticStyle="heavy"
          />
        </View>
      </Animated.View>
    </View>
  );
};

interface CircleCalcButtonProps {
  label: string;
  a11y?: string;
  size: number;
  onPress: () => void;
  bg: string;
  color: string;
  fontSize?: number;
  fontWeight?: '300' | '400' | '500' | '600' | '700';
  customChild?: React.ReactNode;
  hapticStyle?: 'keypad' | 'heavy' | 'medium' | 'none';
}

const CircleCalcButton: React.FC<CircleCalcButtonProps> = ({
  label,
  a11y,
  size,
  onPress,
  bg,
  color,
  fontSize = 29,
  fontWeight = '400',
  customChild,
  hapticStyle = 'keypad',
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (hapticStyle === 'heavy') {
      void triggerHeavyHaptic();
    } else if (hapticStyle === 'medium') {
      void triggerMediumHaptic();
    } else if (hapticStyle !== 'none') {
      void triggerKeypadHaptic();
    }
    playKeySound();
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y || label}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.circleBtn,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: bg,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {customChild ? (
          customChild
        ) : (
          <Text
            style={[
              styles.circleBtnText,
              {
                color,
                fontSize,
                fontWeight,
              },
            ]}
          >
            {label}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  displayArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  displayTouchZone: {
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
  },
  historyPeekPreview: {
    width: '100%',
    paddingBottom: 8,
    marginBottom: 4,
  },
  peekItemRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  peekExpr: {
    fontSize: 16,
    fontWeight: '400',
  },
  peekResult: {
    fontSize: 18,
    fontWeight: '500',
  },
  expressionScrollView: {
    width: '100%',
    height: 84,
    maxHeight: 90,
  },
  expressionScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    flexDirection: 'row',
  },
  expressionText: {
    fontSize: 64,
    fontWeight: '400',
    textAlign: 'right',
    letterSpacing: -1,
    includeFontPadding: false,
  },
  resultPreviewText: {
    fontSize: 38,
    fontWeight: '300',
    textAlign: 'right',
    marginTop: 4,
    minHeight: 46,
  },
  errorPreviewText: {
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'right',
    marginTop: 8,
    minHeight: 46,
  },
  middleBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    marginBottom: 4,
  },
  chevronBtn: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronSymbol: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 13,
  },
  chevronBottom: {
    marginTop: -3,
  },
  longMicWrapper: {
    flex: 1,
  },
  longMicButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    borderRadius: 22,
    borderWidth: 1.2,
    paddingHorizontal: 8,
  },
  micIndicatorCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micIconGlyph: {
    fontSize: 14,
    fontWeight: '700',
  },
  longMicLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    marginHorizontal: 10,
  },
  onOffPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  onOffPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  sciDrawer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
    justifyContent: 'center',
  },
  sciPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  sciPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  keypadGrid: {
    alignItems: 'center',
  },
  keyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  circleBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnText: {
    textAlign: 'center',
  },
  backspaceBox: {
    width: 22,
    height: 18,
    borderWidth: 1.8,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backspaceCross: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: -1,
  },
  // Sliding History Sheet (iPhone Calculator Style)
  historySlidingSheet: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    paddingTop:
      Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 12,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  historyHeaderZone: {
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.25)',
  },
  historyPullHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    marginBottom: 10,
    opacity: 0.6,
  },
  historyTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
  },
  historyHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  historyHeaderSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  historyActionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  historyClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  historyClearBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyCloseBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  historyCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  historyEmptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  historyEmptyText: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 6,
  },
  historyEmptyHint: {
    fontSize: 12,
  },
  historyListContent: {
    paddingTop: 12,
    paddingBottom: 40,
    gap: 12,
  },
  historyItemCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyItemModeTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  historyItemTimestamp: {
    fontSize: 11,
    fontWeight: '500',
  },
  historyItemOriginalCmd: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  historyItemMathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  historyItemExpr: {
    fontSize: 16,
    fontWeight: '500',
  },
  historyItemResult: {
    fontSize: 24,
    fontWeight: '800',
  },
  historyCardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardActionBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
