import React from 'react';
import {
  FlatList,
  Modal,
  Platform,
  SafeAreaView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { CalculationHistoryItem } from '../../models/types';
import { historyService } from '../../services/HistoryService';
import { ThemeColors } from '../../theme/theme';
import { groupDigits, groupingForLanguage } from '../../utils/numberFormat';
import { settingsService } from '../../services/SettingsService';
import { triggerLightHaptic } from '../../utils/haptics';

interface HistoryModalProps {
  visible: boolean;
  theme: ThemeColors;
  strings: LocalizedStrings;
  items: CalculationHistoryItem[];
  onClose: () => void;
  onSelectReuse: (item: CalculationHistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  visible,
  theme,
  strings,
  items,
  onClose,
  onSelectReuse,
  onDeleteItem,
  onClearAll,
}) => {
  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      const shareText = historyService.formatShareText(item);
      await Share.share({ message: shareText });
    } catch {
      // Ignore
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent={true}
      onRequestClose={onClose}
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
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {strings.historyTitle}
          </Text>
          <View style={styles.headerActions}>
            {items.length > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Clear all calculation history"
                onPress={() => {
                  void triggerLightHaptic();
                  onClearAll();
                }}
                style={[
                  styles.clearBtn,
                  { backgroundColor: theme.dangerSoft },
                ]}
              >
                <Text style={[styles.clearBtnText, { color: theme.danger }]}>
                  {strings.clearHistory}
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Close history"
              onPress={onClose}
              style={[
                styles.closeBtn,
                { backgroundColor: theme.surfaceElevated },
              ]}
            >
              <Text style={[styles.closeBtnText, { color: theme.textPrimary }]}>
                Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* List */}
        {items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {strings.historyEmpty}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={`Reuse calculation ${item.interpretedExpression} equals ${item.result}`}
                  onPress={() => {
                    void triggerLightHaptic();
                    onSelectReuse(item);
                    onClose();
                  }}
                >
                  <View style={styles.cardTopRow}>
                    <Text
                      style={[styles.modeTag, { color: theme.accent }]}
                    >
                      {item.mode === 'voice' ? '🎙️ VOICE' : '⌨️ KEYPAD'}
                    </Text>
                    <Text
                      style={[styles.timestamp, { color: theme.textMuted }]}
                    >
                      Today • {formatTime(item.timestamp)}
                    </Text>
                  </View>

                  {item.originalCommand &&
                    item.originalCommand !== item.interpretedExpression && (
                      <Text
                        style={[
                          styles.originalCmd,
                          { color: theme.textSecondary },
                        ]}
                      >
                        “{item.originalCommand}”
                      </Text>
                    )}

                  <View style={styles.mathRow}>
                    <Text
                      style={[
                        styles.expressionText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {(item.interpretedExpression || '').replace(/\*/g, '×').replace(/\//g, '÷')} =
                    </Text>
                    <Text
                      style={[styles.resultText, { color: theme.textPrimary }]}
                    >
                      {groupDigits(item.result, groupingForLanguage(settingsService.getSettings().language))}
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Item Action Footer */}
                <View
                  style={[
                    styles.cardActions,
                    { borderTopColor: theme.border },
                  ]}
                >
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Reuse this result"
                    onPress={() => {
                      void triggerLightHaptic();
                      onSelectReuse(item);
                      onClose();
                    }}
                  >
                    <Text
                      style={[styles.cardActionText, { color: theme.accent }]}
                    >
                      ↺ Reuse
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Copy result"
                    onPress={() => handleCopy(item.result)}
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

                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Delete calculation from history"
                    onPress={() => {
                      void triggerLightHaptic();
                      onDeleteItem(item.id);
                    }}
                  >
                    <Text
                      style={[styles.cardActionText, { color: theme.danger }]}
                    >
                      ✕ Delete
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
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
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  closeBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  modeTag: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  timestamp: {
    fontSize: 11,
  },
  originalCmd: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  expressionText: {
    fontSize: 16,
    fontWeight: '500',
  },
  resultText: {
    fontSize: 24,
    fontWeight: '800',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cardActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
