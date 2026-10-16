import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LocalizedStrings } from '../../localization/i18n';
import { VoiceInteractionState } from '../../models/types';
import { ThemeColors } from '../../theme/theme';
import { triggerMediumHaptic } from '../../utils/haptics';

interface MicrophoneButtonProps {
  theme: ThemeColors;
  strings: LocalizedStrings;
  voiceState: VoiceInteractionState;
  onPress: () => void;
}

export const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({
  theme,
  strings,
  voiceState,
  onPress,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    if (voiceState === 'idle') {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0.25);
      return;
    }

    const duration =
      voiceState === 'listening'
        ? 850
        : voiceState === 'processing'
        ? 550
        : 1000;

    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.28,
            duration,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.15,
            duration,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [voiceState, pulseAnim, opacityAnim]);

  const getStateColor = () => {
    switch (voiceState) {
      case 'listening':
        return theme.accentListening;
      case 'processing':
        return theme.accentProcessing;
      case 'speaking':
        return theme.accentSpeaking;
      default:
        return theme.accent;
    }
  };

  const getStateIcon = () => {
    switch (voiceState) {
      case 'listening':
        return '●';
      case 'processing':
        return '⋯';
      case 'speaking':
        return '🔊';
      default:
        return '🎙️';
    }
  };

  const activeColor = getStateColor();

  return (
    <View style={styles.wrapper}>
      <View style={styles.micZone}>
        {/* Animated Halo Ring */}
        <Animated.View
          style={[
            styles.pulseRing,
            {
              backgroundColor: activeColor,
              opacity: opacityAnim,
              transform: [{ scale: pulseAnim }],
            },
          ]}
        />

        {/* Core Microphone Button */}
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Microphone button, current state: ${strings.micStateLabel[voiceState]}`}
          accessibilityHint="Tap to speak a natural language calculation"
          onPress={() => {
            void triggerMediumHaptic();
            onPress();
          }}
          style={[
            styles.micButton,
            {
              backgroundColor: activeColor,
              shadowColor: activeColor,
            },
          ]}
        >
          <Text style={styles.micIconText}>{getStateIcon()}</Text>
        </TouchableOpacity>
      </View>

      {/* Primary State Label ("Tap to calculate", "Listening...", "Thinking...", "Answering...") */}
      <Text style={[styles.stateTitle, { color: theme.textPrimary }]}>
        {strings.micStateLabel[voiceState]}
      </Text>

      {/* Subtle Guidance Subtitle */}
      <Text style={[styles.stateSubtitle, { color: theme.textSecondary }]}>
        {strings.micStateSubLabel[voiceState]}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
  },
  micZone: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
  },
  micButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  micIconText: {
    fontSize: 34,
    color: '#FFFFFF',
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 10,
    letterSpacing: -0.2,
  },
  stateSubtitle: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 28,
  },
});
