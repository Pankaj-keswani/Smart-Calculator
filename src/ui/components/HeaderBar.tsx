import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { AppMode } from '../../models/types';
import { ThemeColors } from '../../theme/theme';
import { triggerLightHaptic } from '../../utils/haptics';

interface HeaderBarProps {
  theme: ThemeColors;
  strings: LocalizedStrings;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
  onLaunchFloating?: () => void;
  historyCount: number;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  strings,
  mode,
  onModeChange,
  onOpenHistory,
  onOpenSettings,
  onLaunchFloating,
  historyCount,
}) => {
  const handleSwitchMode = (target: AppMode) => {
    if (target !== mode) {
      void triggerLightHaptic();
      onModeChange(target);
    }
  };

  return (
    <View style={styles.container}>
      {/* Top-Left: History Clock Icon (matches reference screenshot) */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Open calculation history (${historyCount} items)`}
        onPress={() => {
          void triggerLightHaptic();
          onOpenHistory();
        }}
        style={styles.topIconButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <View
          style={[
            styles.clockCircle,
            { borderColor: theme.textPrimary },
          ]}
        >
          <View
            style={[
              styles.clockHandVertical,
              { backgroundColor: theme.textPrimary },
            ]}
          />
          <View
            style={[
              styles.clockHandHorizontal,
              { backgroundColor: theme.textPrimary },
            ]}
          />
        </View>
        {historyCount > 0 && (
          <View
            style={[
              styles.badge,
              { backgroundColor: theme.keypadEqualsBg },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: theme.keypadEqualsText },
              ]}
            >
              {historyCount > 99 ? '99+' : historyCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Center: Compact Mode Switcher (Keypad | Voice) */}
      <View
        style={[
          styles.modeSegment,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Switch to Manual Calculator Mode"
          accessibilityState={{ selected: mode === 'calculator' }}
          onPress={() => handleSwitchMode('calculator')}
          style={[
            styles.modeTab,
            mode === 'calculator' && {
              backgroundColor: theme.keypadEqualsBg,
            },
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              {
                color:
                  mode === 'calculator'
                    ? theme.keypadEqualsText
                    : theme.textSecondary,
              },
            ]}
          >
            {strings.calculatorMode}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Switch to Voice Mode"
          accessibilityState={{ selected: mode === 'voice' }}
          onPress={() => handleSwitchMode('voice')}
          style={[
            styles.modeTab,
            mode === 'voice' && {
              backgroundColor: theme.keypadEqualsBg,
            },
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              {
                color:
                  mode === 'voice'
                    ? theme.keypadEqualsText
                    : theme.textSecondary,
              },
            ]}
          >
            {strings.voiceMode}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Top-Right: Floating Bubble Mode & Settings */}
      <View style={styles.rightActionsRow}>
        {Platform.OS === 'android' && onLaunchFloating && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Launch Floating Bubble Calculator"
            onPress={() => {
              void triggerLightHaptic();
              onLaunchFloating();
            }}
            style={styles.topIconButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View
              style={[
                styles.floatingBubbleIcon,
                { borderColor: theme.textSecondary },
              ]}
            >
              <View
                style={[
                  styles.floatingBubbleDot,
                  { backgroundColor: theme.keypadEqualsBg },
                ]}
              />
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          onPress={() => {
            void triggerLightHaptic();
            onOpenSettings();
          }}
          style={styles.topIconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.dotsColumn}>
            <View
              style={[styles.dot, { backgroundColor: theme.textPrimary }]}
            />
            <View
              style={[styles.dot, { backgroundColor: theme.textPrimary }]}
            />
            <View
              style={[styles.dot, { backgroundColor: theme.textPrimary }]}
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 999,
    elevation: 10,
  },
  topIconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  rightActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  floatingBubbleIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBubbleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  clockCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockHandVertical: {
    position: 'absolute',
    width: 1.8,
    height: 6,
    top: 4,
    left: 7.5,
    borderRadius: 1,
  },
  clockHandHorizontal: {
    position: 'absolute',
    width: 5,
    height: 1.8,
    top: 8.5,
    left: 7.5,
    borderRadius: 1,
  },
  dotsColumn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
  },
  dot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
  },
  modeSegment: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 2.5,
    borderWidth: 1,
  },
  modeTab: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 15,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: -2,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
});
