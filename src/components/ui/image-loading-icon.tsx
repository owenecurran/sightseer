import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// One step of the walk, side to side.
const STEP_MS = 900;
// How many steps it takes before it stands still: about 14 seconds. It used
// to walk for ever, for as long as the picture had not arrived, and a picture
// that never arrives (a signed URL gone stale, a photo with no address) left
// it walking indefinitely. That was not free. While any animation runs, the
// whole page commits on every frame (see place-tag.tsx), so a single stuck
// icon on a Discover tag kept the app redrawing about 50 times a second with
// nothing moving, held a CPU core near 100%, and made every scroll on the
// page stutter. Loading that takes longer than this has failed in a way
// nothing reported; standing still says so, and costs nothing.
const STEPS = 16;
const EASE = Easing.inOut(Easing.quad);

// Shown while an async image URL/photo is still being fetched — the walking
// mark from assets/brand-source/loading-icon.svg, rasterized to
// assets/images/loading-icon.png (scripts/generate-brand-assets.js
// regenerates this, and the app-icon/favicon PNGs, from the source SVGs).
export function ImageLoadingIcon() {
  const walk = useSharedValue(0);

  useEffect(() => {
    walk.value = withSequence(
      // An even number of steps, which ends back where it started; then it
      // comes to rest in the middle.
      withRepeat(withTiming(1, { duration: STEP_MS, easing: EASE }), STEPS, true),
      withTiming(0.5, { duration: STEP_MS / 2, easing: EASE }),
    );
  }, [walk]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (walk.value - 0.5) * 16 }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Image source={require('@/assets/images/loading-icon.png')} style={styles.icon} contentFit="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 24,
    height: 28,
  },
});
