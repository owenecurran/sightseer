import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// Shown while an async image URL/photo is still being fetched — the walking
// mark from assets/brand-source/loading-icon.svg, rasterized to
// assets/images/loading-icon.png (scripts/generate-brand-assets.js
// regenerates this, and the app-icon/favicon PNGs, from the source SVGs).
export function ImageLoadingIcon() {
  const walk = useSharedValue(0);

  useEffect(() => {
    walk.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
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
