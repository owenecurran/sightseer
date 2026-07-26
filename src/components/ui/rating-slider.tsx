import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MAX_VALUE = 10;
const TRACK_HEIGHT = 12;
const THUMB_SIZE = 32;
// The tappable/draggable area is taller than the visual line — 12px is too
// thin a target to comfortably hit on a touchscreen.
const TOUCH_TARGET_HEIGHT = 44;
const MAX_SHAKE_PX = 4;
// Value-space stops (0-10), converted to 0-1 progress below.
const GRADIENT_STOPS = [0, 0.1, 0.5, 0.9, 1];
const GRADIENT_COLORS = ['#40013a', '#d40404', '#f7da1e', '#04b02f', '#05e8b7'];

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
  // Continuous background wobble, always running; its amplitude (shakeIntensity)
  // is what actually makes it visible or not, so this never needs restarting.
  const shakePhase = useSharedValue(-1);
  const shakeIntensity = useSharedValue(0);
  const lastHapticValue = useSharedValue(value);

  useEffect(() => {
    shakePhase.value = withRepeat(
      withTiming(1, { duration: 70, easing: Easing.linear }),
      -1,
      true
    );
  }, [shakePhase]);

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

  // Shared by touch-down (tap-to-snap) and drag: always derive progress from
  // the touch's absolute position within the track, never accumulated
  // deltas — deltas measured against a view that's itself being animated is
  // exactly what caused the thumb to drift ahead of the cursor.
  function updateFromTrackX(x: number) {
    'worklet';
    progress.value = clamp(x / trackWidth, 0, 1);

    const nextValue = roundToTenth(progress.value * MAX_VALUE);
    const rawIntensity = clamp(Math.abs(progress.value - 0.5) * 2, 0, 1);
    // Cubic falloff: stays near-imperceptible until close to either
    // extreme, instead of growing the moment you leave dead center.
    shakeIntensity.value = rawIntensity ** 3;

    if (nextValue !== lastHapticValue.value) {
      lastHapticValue.value = nextValue;
      runOnJS(triggerHaptic)(rawIntensity);
      runOnJS(onChange)(nextValue);
    }
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      updateFromTrackX(event.x);
    })
    .onChange((event) => {
      updateFromTrackX(event.x);
    })
    .onFinalize(() => {
      shakeIntensity.value = withTiming(0, { duration: 150 });
    });

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
    backgroundColor: interpolateColor(progress.value, GRADIENT_STOPS, GRADIENT_COLORS),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          progress.value * usableWidth + shakePhase.value * shakeIntensity.value * MAX_SHAKE_PX,
      },
    ],
    backgroundColor: interpolateColor(progress.value, GRADIENT_STOPS, GRADIENT_COLORS),
  }));

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.valueText}>
        {value.toFixed(1)}
      </ThemedText>

      <GestureDetector gesture={pan}>
        <View style={styles.track} onLayout={handleLayout}>
          <View style={[styles.trackBackground, { backgroundColor: theme.backgroundElement }]} />
          {trackWidth > 0 && (
            <>
              <Animated.View style={[styles.fill, fillStyle]} />
              <Animated.View style={[styles.thumb, thumbStyle, { borderColor: theme.background }]} />
            </>
          )}
        </View>
      </GestureDetector>
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
    height: TOUCH_TARGET_HEIGHT,
  },
  trackBackground: {
    position: 'absolute',
    top: (TOUCH_TARGET_HEIGHT - TRACK_HEIGHT) / 2,
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  fill: {
    position: 'absolute',
    top: (TOUCH_TARGET_HEIGHT - TRACK_HEIGHT) / 2,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  thumb: {
    position: 'absolute',
    top: (TOUCH_TARGET_HEIGHT - THUMB_SIZE) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
});
