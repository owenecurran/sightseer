import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// A small set of loading-state icons shown while an async image URL/photo
// is still being fetched — only the first (a walking pedestrian) is built
// out for now; the other two slots are reserved so a different icon can be
// swapped in later (per-context or at random) without restructuring the
// call sites that already render <ImageLoadingIcon />.
const LOADING_ICONS = ['🚶', '🚶', '🚶'] as const;

type ImageLoadingIconProps = {
  variant?: 0 | 1 | 2;
};

export function ImageLoadingIcon({ variant = 0 }: ImageLoadingIconProps) {
  const walk = useSharedValue(0);

  useEffect(() => {
    walk.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [walk]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (walk.value - 0.5) * 16 }],
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <Text style={styles.icon}>{LOADING_ICONS[variant]}</Text>
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
    fontSize: 28,
  },
});
