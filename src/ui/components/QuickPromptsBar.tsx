import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { ThemeColors } from '../../theme/theme';
import { triggerLightHaptic } from '../../utils/haptics';

interface QuickPromptsBarProps {
  theme: ThemeColors;
  strings: LocalizedStrings;
  onSubmitCommand: (command: string) => void;
}

export const QuickPromptsBar: React.FC<QuickPromptsBarProps> = ({
  theme,
  strings,
  onSubmitCommand,
}) => {
  const [textCommand, setTextCommand] = useState('');

  const handleSend = () => {
    const trimmed = textCommand.trim();
    if (!trimmed) return;
    void triggerLightHaptic();
    onSubmitCommand(trimmed);
    setTextCommand('');
  };

  return (
    <View style={styles.container}>
      {/* Natural Language Command Input */}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <TextInput
          value={textCommand}
          onChangeText={setTextCommand}
          placeholder={strings.voiceInputPlaceholder}
          placeholderTextColor={theme.textMuted}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          accessibilityLabel="Type a calculation"
          style={[styles.input, { color: theme.textPrimary }]}
        />
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Calculate typed command"
          onPress={handleSend}
          disabled={!textCommand.trim()}
          style={[
            styles.sendBtn,
            {
              backgroundColor: textCommand.trim()
                ? theme.keypadEqualsBg
                : theme.surfaceElevated,
            },
          ]}
        >
          <Text
            style={[
              styles.sendBtnText,
              {
                color: textCommand.trim() ? theme.keypadEqualsText : theme.textMuted,
              },
            ]}
          >
            →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Quick Voice Prompt Chips */}
      <View style={styles.chipsSection}>
        <Text style={[styles.chipsLabel, { color: theme.textMuted }]}>
          {strings.quickExamplesTitle}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {strings.quickExamples.map((example) => (
            <TouchableOpacity
              key={example}
              accessibilityRole="button"
              accessibilityLabel={`Try example command: ${example}`}
              onPress={() => {
                void triggerLightHaptic();
                onSubmitCommand(example);
              }}
              style={[
                styles.chip,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: theme.textSecondary }]}>
                “{example}”
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 5,
  },
  input: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 6,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  chipsSection: {
    marginTop: 12,
  },
  chipsLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 7,
    marginLeft: 4,
  },
  chipsScroll: {
    gap: 8,
    paddingRight: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
