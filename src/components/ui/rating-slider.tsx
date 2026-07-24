import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MAX_VALUE = 10;
const TRACK_HEIGHT = 12;
const THUMB_SIZE = 32;
const LOW_COLOR = '#8B0000';
const HIGH_COLOR = '#66E0C2';

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

function roundToTenth(n: number) {
  'worklet';
  return Math.round(n * 10) / 10;
}

function hapticStyleForIntensity(intensity: number): Haptics.ImpactFeedbackStyle {
  if (intensity > 0.75) return Haptics.ImpactFeedbackStyle.Heavy;
  if (intensity > 0.35) return Haptics.ImpactFeedbackStyle.Medium;
  return Haptics.ImpactFeedbackStyle.Light;
}

function triggerHaptic(intensity: number) {
  // No haptics API on web — dragging still works, just silently no-ops.
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(hapticStyleForIntensity(intensity));
}

type RatingSliderProps = {
  value: number;
  onChange: (value: number) => void;
};

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  const theme = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue(value / MAX_VALUE);
  const shakeOffset = useSharedValue(0);
  const lastHapticValue = useSharedValue(value);

  // Keep in sync if the value is reset from outside (e.g. selecting a new
  // place resets the form) rather than from this slider's own drag.
  useEffect(() => {
    progress.value = value / MAX_VALUE;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  const usableWidth = Math.max(trackWidth - THUMB_SIZE, 1);

  const pan = Gesture.Pan().onChange((event) => {
    progress.value = clamp(progress.value + event.changeX / usableWidth, 0, 1);

    const nextValue = roundToTenth(progress.value * MAX_VALUE);
    // Shake amplitude grows the closer the value gets to either extreme.
    const intensity = clamp(Math.abs(progress.value - 0.5) * 2, 0, 1);
    shakeOffset.value = withSequence(
      withTiming(intensity * 6, { duration: 40 }),
      withTiming(-intensity * 6, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );

    if (nextValue !== lastHapticValue.value) {
      lastHapticValue.value = nextValue;
      runOnJS(triggerHaptic)(intensity);
      runOnJS(onChange)(nextValue);
    }
  });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    backgroundColor: interpolateColor(progress.value, [0, 1], [LOW_COLOR, HIGH_COLOR]),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * usableWidth + shakeOffset.value }],
    backgroundColor: interpolateColor(progress.value, [0, 1], [LOW_COLOR, HIGH_COLOR]),
  }));

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.valueText}>
        {value.toFixed(1)}
      </ThemedText>

      <View style={styles.track} onLayout={handleLayout}>
        <View style={[styles.trackBackground, { backgroundColor: theme.backgroundElement }]} />
        {trackWidth > 0 && (
          <>
            <Animated.View style={[styles.fill, fillStyle]} />
            <GestureDetector gesture={pan}>
              <Animated.View style={[styles.thumb, thumbStyle, { borderColor: theme.background }]} />
            </GestureDetector>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  valueText: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    width: '100%',
    height: TRACK_HEIGHT,
    justifyContent: 'center',
  },
  trackBackground: {
    position: 'absolute',
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    top: -(THUMB_SIZE - TRACK_HEIGHT) / 2,
    borderWidth: 2,
  },
});
