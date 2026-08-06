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

function LightboxPage({ uri, width, height }: { uri: string; width: number; height: number }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  // translateX/Y are the single continuously-authoritative position, kept in
  // sync by whichever gesture (pinch or pan) last touched them — no separate
  // "saved" checkpoint needed for translate the way scale needs savedScale,
  // since every write below is already relative to the live current value.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // The focal point as of the *previous* onChange frame (reset to the
  // initial focal on onStart) — this is what makes the zoom track a moving
  // pinch instead of freezing to wherever the gesture began. The earlier
  // version only ever read event.focalX/focalY once, in onStart, and used
  // that single frozen point for the whole gesture's translate math — so
  // scaling was correctly anchored at first touch, but any finger movement
  // during the pinch (which is how you'd naturally pinch-zoom toward an
  // off-center point) was completely ignored until you lifted your fingers
  // and did a separate one-finger pan. Recomputing against the *current*
  // focal point every single onChange frame, relative to last frame's focal
  // point, folds zoom and pan into one continuous two-finger gesture.
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);

  // Keeps translateX/Y from drifting the zoomed image past its own edges —
  // at scale S, the image is (S-1)*width/2 wider than the view on each
  // side, so that's the max translate in either direction; at scale 1
  // (not zoomed) this collapses to 0, correctly forbidding any pan at all.
  function clampTranslate(value: number, dimension: number, currentScale: number) {
    'worklet';
    const max = (Math.max(currentScale, 1) - 1) * (dimension / 2);
    return clamp(value, -max, max);
  }

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      lastFocalX.value = event.focalX - width / 2;
      lastFocalY.value = event.focalY - height / 2;
    })
    .onChange((event) => {
      const prevScale = scale.value;
      const nextScale = clamp(savedScale.value * event.scale, 1, MAX_ZOOM);
      const focalX = event.focalX - width / 2;
      const focalY = event.focalY - height / 2;

      // The full per-frame formula: the content point that was under last
      // frame's focal point — (lastFocal - translate) / prevScale — must
      // land back under *this* frame's focal point at the new scale. Reduces
      // to plain focal-anchored zoom when the focal point hasn't moved
      // (focalX === lastFocalX.value), and to plain panning when the scale
      // hasn't changed (nextScale === prevScale) — one formula covers both,
      // continuously, every frame, rather than zoom and pan being two
      // separate gestures the user has to alternate between.
      translateX.value = clampTranslate(
        focalX - (lastFocalX.value - translateX.value) * (nextScale / prevScale),
        width,
        nextScale
      );
      translateY.value = clampTranslate(
        focalY - (lastFocalY.value - translateY.value) * (nextScale / prevScale),
        height,
        nextScale
      );

      scale.value = nextScale;
      lastFocalX.value = focalX;
      lastFocalY.value = focalY;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Reposition-while-zoomed via a single finger (once the pinch has already
  // ended) — manual activation so it only actually claims the gesture once
  // scale > 1 (checked as a worklet condition against the live shared
  // value, not a one-time prop, since RNGH resolves activation per-touch not
  // per-render). Below that threshold it fails immediately, letting the
  // untouched single-finger drag fall through to the outer FlatList's own
  // paging swipe and the lightbox's swipe-to-dismiss.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((_event, state) => {
      if (scale.value > 1) state.activate();
      else state.fail();
    })
    .onChange((event) => {
      translateX.value = clampTranslate(translateX.value + event.changeX, width, scale.value);
      translateY.value = clampTranslate(translateY.value + event.changeY, height, scale.value);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withTiming(1);
      savedScale.value = 1;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
    });

  const composed = Gesture.Simultaneous(Gesture.Race(pan, pinch), doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
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

// Full-screen tap-to-focus viewer — pinch to zoom, continuously anchored to
// wherever the two fingers currently are (not just where the pinch started),
// so zooming and repositioning happen as one fluid two-finger gesture rather
// than "zoom, then lift fingers, then pan separately" (see LightboxPage's
// `pinch` gesture). Double-tap resets to fit. A single-finger `pan` gesture
// still exists for repositioning after the pinch has ended, manually
// activated only above scale 1 so an un-zoomed single-finger drag falls
// through untouched to the outer FlatList's own paging swipe and this
// component's own swipe-to-dismiss below.
export function PhotoLightbox({ visible, urls, initialIndex, onClose }: PhotoLightboxProps) {
  const { width, height } = useWindowDimensions();
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
                renderItem={({ item }) => <LightboxPage uri={item} width={width} height={height} />}
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
