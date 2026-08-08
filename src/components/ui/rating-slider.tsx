import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, runOnJS, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { LiquidGlassTrackGated } from '@/components/ui/liquid-glass-track-gated';
import { Spacing } from '@/constants/theme';
import { RATING_GRADIENT_COLORS, RATING_GRADIENT_STOPS } from '@/lib/rating-gradient';

const MAX_VALUE = 10;
const THUMB_SIZE = 32;
// The canvas itself is the touch target here (unlike the old thin-line
// design) — chunky enough to comfortably drag, same height as the thumb so
// the glass droplet fills it edge to edge.
const TRACK_HEIGHT = THUMB_SIZE;
// The logo icon reads as a liquid-glass droplet sitting *on* the gradient
// track, not embedded flush inside it — needs to actually be taller than the
// track to read that way. The canvas itself grows to fit it (see
// CANVAS_HEIGHT below); the track's own gradient stays pill-shaped at
// TRACK_HEIGHT via a mask drawn directly in the shader (see `trackHeight`
// uniform in liquid-glass-track.tsx), so only the icon pokes out above/below
// it, not the whole gradient bar.
const ICON_SIZE = TRACK_HEIGHT * 2.625;
const CANVAS_HEIGHT = ICON_SIZE;
const MAX_SHAKE_PX = 1;
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
  // null = no score set yet — the review-form flow this was built to
  // replace an "add without reviewing" button for (see rating-slider.tsx's
  // callers): saving with a null rating logs a plain visit with no score
  // attached, and the numeric readout above the track stays hidden until
  // the very first drag/tap actually sets a real value. The track itself
  // still needs *some* position to render at while unset — it visually
  // starts at the midpoint (see `progress` below) without that implying a
  // real 5.0 was chosen; only `onChange` firing (on first touch) turns this
  // into an actual value.
  value: number | null;
  onChange: (value: number) => void;
};

export function RatingSlider({ value, onChange }: RatingSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const progress = useSharedValue((value ?? MAX_VALUE / 2) / MAX_VALUE);
  // Continuous background wobble, always running; its amplitude (shakeIntensity)
  // is what actually makes it visible or not, so this never needs restarting.
  const shakePhase = useSharedValue(-1);
  const shakeIntensity = useSharedValue(0);
  const lastHapticValue = useSharedValue(value ?? MAX_VALUE / 2);
  // Guards against a real dead-zone bug: the track visually starts at the
  // midpoint while unset (see `progress` above), which is exactly the value
  // roundToTenth would compute for a first tap landing anywhere near that
  // same spot — without this, `nextValue !== lastHapticValue.value` in
  // updateFromTrackX would be false on that exact tap (both sides already
  // equal the midpoint), so onChange would silently never fire and the
  // slider would stay "unset" despite being touched. Tracks whether onChange
  // has fired at all yet, independent of whether the computed value happens
  // to match the starting point.
  const hasInteracted = useSharedValue(value != null);

  useEffect(() => {
    shakePhase.value = withRepeat(withTiming(1, { duration: 70, easing: Easing.linear }), -1, true);
  }, [shakePhase]);

  // Keep in sync if the value is reset from outside (e.g. selecting a new
  // place resets the form) rather than from this slider's own drag. A reset
  // to null re-centers the track rather than leaving it at wherever it was
  // last dragged.
  useEffect(() => {
    progress.value = (value ?? MAX_VALUE / 2) / MAX_VALUE;
    hasInteracted.value = value != null;
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

    if (nextValue !== lastHapticValue.value || !hasInteracted.value) {
      hasInteracted.value = true;
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

  return (
    <View style={styles.container}>
      <ThemedText type="title" style={styles.valueText}>
        {value != null ? value.toFixed(1) : 'Rate it'}
      </ThemedText>

      <GestureDetector gesture={pan}>
        <View style={styles.track} onLayout={handleLayout}>
          {trackWidth > 0 && (
            <LiquidGlassTrackGated
              width={trackWidth}
              height={CANVAS_HEIGHT}
              trackHeight={TRACK_HEIGHT}
              thumbSize={THUMB_SIZE}
              iconSize={ICON_SIZE}
              progress={progress}
              usableWidth={usableWidth}
              shakePhase={shakePhase}
              shakeIntensity={shakeIntensity}
              maxShakePx={MAX_SHAKE_PX}
              gradientStops={RATING_GRADIENT_STOPS}
              gradientColors={RATING_GRADIENT_COLORS}
            />
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
    height: CANVAS_HEIGHT,
    justifyContent: 'center',
  },
});
