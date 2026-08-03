import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const MAX_ZOOM = 3;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

function LightboxPage({ uri, width }: { uri: string; width: number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_ZOOM);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withTiming(1);
      savedScale.value = 1;
    });

  const composed = Gesture.Simultaneous(pinch, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.page, { width }]}>
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

type PhotoLightboxProps = {
  visible: boolean;
  urls: string[];
  initialIndex: number;
  onClose: () => void;
};

// Full-screen tap-to-focus viewer — pinch to zoom (double-tap to reset),
// swipe between photos when there's more than one via the outer FlatList's
// own native paging scroll (deliberately no pan-to-reposition-while-zoomed:
// that would fight the FlatList's horizontal swipe for single-finger drags,
// a known gesture-interop pitfall not worth chasing for this scope).
export function PhotoLightbox({ visible, urls, initialIndex, onClose }: PhotoLightboxProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const translateY = useSharedValue(0);
  const backdropOpacity = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      setActiveIndex(initialIndex);
      translateY.value = 0;
      backdropOpacity.value = 1;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialIndex]);

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  // Vertical-only (either direction) — failOffsetX yields to the FlatList's
  // horizontal paging and each page's own pinch/double-tap the moment a drag
  // reads as more horizontal than vertical, so this never fights them.
  const swipeToDismiss = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onChange((event) => {
      translateY.value = event.translationY;
      backdropOpacity.value = 1 - clamp(Math.abs(event.translationY) / 400, 0, 0.7);
    })
    .onEnd((event) => {
      const shouldDismiss =
        Math.abs(translateY.value) > DISMISS_DISTANCE || Math.abs(event.velocityY) > DISMISS_VELOCITY;
      if (shouldDismiss) {
        runOnJS(onClose)();
      }
      translateY.value = withTiming(0);
      backdropOpacity.value = withTiming(1);
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={[styles.closeButton, { top: insets.top + Spacing.two }]}>
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>

        {urls.length > 1 && (
          <View style={[styles.indexBadge, { top: insets.top + Spacing.two }]}>
            <ThemedText type="small" style={styles.indexText}>
              {activeIndex + 1} / {urls.length}
            </ThemedText>
          </View>
        )}

        {width > 0 && (
          <GestureDetector gesture={swipeToDismiss}>
            <Animated.View style={[styles.flex, contentStyle]}>
              <FlatList
                data={urls}
                keyExtractor={(url, index) => `${url}-${index}`}
                style={styles.flex}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                initialScrollIndex={initialIndex}
                getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
                onMomentumScrollEnd={handleMomentumEnd}
                renderItem={({ item }) => <LightboxPage uri={item} width={width} />}
              />
            </Animated.View>
          </GestureDetector>
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
  },
  // The FlatList itself needs an explicit flex — without it, being a plain
  // child of a flex:1 View doesn't make it fill the remaining space (same
  // gotcha fixed in full-reviews-view.tsx), so every page/image collapsed
  // to ~0 height and appeared to "not load" at all.
  flex: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: Spacing.three,
    zIndex: 1,
    padding: Spacing.two,
  },
  indexBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
  indexText: {
    color: '#fff',
  },
  page: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: {
    width: '100%',
    height: '100%',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
