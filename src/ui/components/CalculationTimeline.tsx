import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CalculationHistoryItem } from '../../models/types';
import { ThemeColors } from '../../theme/theme';
import { triggerLightHaptic } from '../../utils/haptics';

interface CalculationTimelineProps {
  theme: ThemeColors;
  items: CalculationHistoryItem[];
  onSelectItem?: (item: CalculationHistoryItem) => void;
  title?: string;
}

export const CalculationTimeline: React.FC<CalculationTimelineProps> = ({
  theme,
  items,
  onSelectItem,
  title = 'Timeline',
}) => {
  if (!items || items.length === 0) {
    return null;
  }

  // Display the most recent calculations in chronological flow
  const recentItems = items.slice(-8);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWithIcon}>
          <Text style={styles.timelineIcon}>⏱️</Text>
          <Text style={[styles.timelineTitle, { color: theme.textSecondary }]}>
            {title.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.countBadge, { color: theme.textMuted }]}>
          {items.length} {items.length === 1 ? 'calc' : 'calcs'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {recentItems.map((item, index) => {
          const stepNumber = items.length - recentItems.length + index + 1;
          return (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Timeline item ${stepNumber}: ${item.interpretedExpression} equals ${item.result}`}
              onPress={() => {
                void triggerLightHaptic();
                onSelectItem?.(item);
              }}
              style={[
                styles.itemCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text
                  style={[
                    styles.stepBadge,
                    {
                      backgroundColor: theme.accentSoft,
                      color: theme.accent,
                    },
                  ]}
                >
                  #{stepNumber}
                </Text>
                <Text style={[styles.modeIndicator, { color: theme.textMuted }]}>
                  {item.mode === 'voice' ? '🎙️' : '⌨️'}
                </Text>
              </View>

              <Text
                style={[styles.itemExpression, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {item.interpretedExpression || item.originalCommand}
              </Text>

              <Text
                style={[styles.itemResult, { color: theme.textPrimary }]}
                numberOfLines={1}
              >
                = {item.result}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timelineIcon: {
    fontSize: 11,
  },
  timelineTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  countBadge: {
    fontSize: 10,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 14,
    gap: 8,
    paddingVertical: 2,
  },
  itemCard: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 115,
    maxWidth: 160,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  stepBadge: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  modeIndicator: {
    fontSize: 10,
  },
  itemExpression: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 2,
  },
  itemResult: {
    fontSize: 14,
    fontWeight: '700',
  },
});
