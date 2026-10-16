import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemeColors } from '../../theme/theme';

interface StartingAnimationProps {
  theme: ThemeColors;
  onFinish: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const StartingAnimation: React.FC<StartingAnimationProps> = ({
  theme,
  onFinish,
}) => {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(18)).current;
  const waveScale = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    // 1. Logo pop-in with spring
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // 2. Wave and text fade-in
    Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(textTranslateY, {
          toValue: 0,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.timing(waveScale, {
          toValue: 1.1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // 3. Pause briefly, then smooth fade-out to main screen
      Animated.delay(650),
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, [
    containerOpacity,
    logoScale,
    logoOpacity,
    textOpacity,
    textTranslateY,
    waveScale,
    onFinish,
  ]);

  const handleSkip = () => {
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onFinish();
    });
  };

  return (
    <Animated.View
      style={[
        styles.overlay,
        {
          backgroundColor: theme.background,
          opacity: containerOpacity,
        },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleSkip}
        style={styles.touchArea}
      >
        {/* Animated App Icon / Logo */}
        <Animated.View
          style={[
            styles.logoWrapper,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
              shadowColor: theme.keypadEqualsBg,
            },
          ]}
        >
          <Image
            source={require('../../../assets/icon.png')}
            style={styles.iconImage}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Brand Name & Tagline */}
        <Animated.View
          style={[
            styles.textContainer,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            VoiceCalc AI
          </Text>
          <View style={styles.badgeRow}>
            <View
              style={[
                styles.pillBadge,
                {
                  backgroundColor: theme.keypadEqualsBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: theme.keypadEqualsText },
                ]}
              >
                DETERMINISTIC
              </Text>
            </View>
            <View
              style={[
                styles.pillBadge,
                {
                  backgroundColor: theme.keypadOperatorBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: theme.keypadOperatorText },
                ]}
              >
                VOICE AI
              </Text>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Local Verified Math • Continuous Voice
          </Text>
        </Animated.View>

        {/* Bottom subtle progress dots */}
        <View style={styles.dotsRow}>
          <View
            style={[styles.dot, { backgroundColor: theme.keypadEqualsBg }]}
          />
          <View
            style={[styles.dot, { backgroundColor: theme.keypadOperatorBg }]}
          />
          <View
            style={[styles.dot, { backgroundColor: theme.textMuted }]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchArea: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoWrapper: {
    width: 124,
    height: 124,
    borderRadius: 32,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
    marginBottom: 26,
    borderWidth: 2,
    borderColor: 'rgba(230, 208, 27, 0.45)',
  },
  iconImage: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  dotsRow: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
