import React, { useState } from 'react';
import {
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { CalculationOutput, ConversationContext } from '../../models/types';
import { ThemeColors } from '../../theme/theme';
import { triggerLightHaptic } from '../../utils/haptics';

interface ResultDisplayProps {
  theme: ThemeColors;
  strings: LocalizedStrings;
  transcript: string;
  output: CalculationOutput;
  context: ConversationContext;
  onResetContext: () => void;
  onSpeakAgain: () => void;
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({
  theme,
  strings,
  transcript,
  output,
  context,
  onResetContext,
  onSpeakAgain,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    void triggerLightHaptic();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(output.formattedResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore if clipboard unavailable
    }
  };

  const handleShare = async () => {
    void triggerLightHaptic();
    try {
      const shareText = `${output.displayExpression} = ${output.formattedResult}`;
      await Share.share({
        message: shareText,
      });
    } catch {
      // Ignore share cancellation
    }
  };

  const resultFontSize =
    output.formattedResult.length > 14
      ? 34
      : output.formattedResult.length > 9
      ? 44
      : 56;

  return (
    <View style={styles.container}>
      {/* Top Row: Conversational Context Pill */}
      {context.lastResult !== null && (
        <View
          style={[
            styles.contextPill,
            {
              backgroundColor: theme.accentSoft,
              borderColor: theme.border,
            },
          ]}
        >
          <Text style={[styles.contextText, { color: theme.textSecondary }]}>
            {strings.contextActiveLabel}:{' '}
            <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>
              {context.lastFormattedResult || String(context.lastResult)}
            </Text>
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Clear calculation context"
            onPress={() => {
              void triggerLightHaptic();
              onResetContext();
            }}
            style={[
              styles.resetBtn,
              { backgroundColor: theme.surfaceElevated },
            ]}
          >
            <Text style={[styles.resetBtnText, { color: theme.textPrimary }]}>
              {strings.clearContext} ✕
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recognized Speech Transcript */}
      {transcript ? (
        <View
          style={[
            styles.transcriptBubble,
            { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
          ]}
        >
          <Text
            style={[styles.transcriptText, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            “{transcript}”
          </Text>
        </View>
      ) : null}

      {/* Main Large Result Display */}
      <View style={styles.resultBlock} accessible accessibilityRole="summary">
        <Text
          style={[
            styles.resultValue,
            {
              fontSize: resultFontSize,
              color: output.errorCode
                ? theme.danger
                : output.requiresClarification
                ? theme.warning
                : theme.textPrimary,
            },
          ]}
          selectable
          accessibilityLabel={`Result: ${output.formattedResult}`}
        >
          {output.formattedResult}
        </Text>

        {/* Normalized Expression Subtitle */}
        <Text
          style={[styles.expressionText, { color: theme.textSecondary }]}
          numberOfLines={2}
          accessibilityLabel={`Expression: ${output.displayExpression}`}
        >
          {output.displayExpression
            ? output.displayExpression.replace(/\*/g, '×').replace(/\//g, '÷')
            : ''}
        </Text>
      </View>

      {/* Optional Smart Breakdown (GST, Discount, Live Rate) */}
      {output.breakdown ? (
        <View
          style={[
            styles.breakdownCard,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.breakdownText, { color: theme.textSecondary }]}>
            {output.breakdown}
          </Text>
        </View>
      ) : null}


      {/* Clarification Banner */}
      {output.requiresClarification && output.clarificationQuestion ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: theme.warningSoft,
              borderColor: theme.warning,
            },
          ]}
        >
          <Text style={[styles.alertText, { color: theme.textPrimary }]}>
            💬 {output.clarificationQuestion}
          </Text>
        </View>
      ) : null}

      {/* Human-Friendly Error Banner */}
      {output.errorCode && output.errorMessage ? (
        <View
          style={[
            styles.alertBanner,
            {
              backgroundColor: theme.dangerSoft,
              borderColor: theme.danger,
            },
          ]}
        >
          <Text style={[styles.alertText, { color: theme.textPrimary }]}>
            {output.errorMessage}
          </Text>
        </View>
      ) : null}

      {/* Quick Action Buttons (Copy, Share, Speak) */}
      {output.success && (
        <View style={styles.actionsRow}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Copy calculation result"
            onPress={handleCopy}
            style={[
              styles.actionChip,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.actionChipText, { color: theme.textSecondary }]}>
              {copied ? `✓ ${strings.copiedToast}` : `⎘ ${strings.copyResult}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Share calculation"
            onPress={handleShare}
            style={[
              styles.actionChip,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.actionChipText, { color: theme.textSecondary }]}>
              ↗ {strings.shareResult}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Speak answer aloud again"
            onPress={() => {
              void triggerLightHaptic();
              onSpeakAgain();
            }}
            style={[
              styles.actionChip,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.actionChipText, { color: theme.textSecondary }]}>
              🔊 {strings.speakAgain}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  contextPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 10,
    gap: 8,
  },
  contextText: {
    fontSize: 12,
    fontWeight: '500',
  },
  resetBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transcriptBubble: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    maxWidth: '92%',
  },
  transcriptText: {
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  resultBlock: {
    alignItems: 'center',
    marginVertical: 6,
  },
  resultValue: {
    fontWeight: '800',
    letterSpacing: -1.5,
    textAlign: 'center',
  },
  expressionText: {
    fontSize: 18,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
  breakdownCard: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  breakdownText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  alertBanner: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: '94%',
  },
  alertText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  actionChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
});

