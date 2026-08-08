import { Ionicons } from '@expo/vector-icons';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { FlatList, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const MAX_ZOOM = 3;
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;
// Interim guess for contentFit="contain" letterbox math before the real
// image has loaded and reported its natural size — matches
// review-prompt-card.tsx's identical DEFAULT_PHOTO_ASPECT_RATIO precedent.
const DEFAULT_ASPECT_RATIO = 1;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

type LightboxPageProps = {
  uri: string;
  width: number;
  height: number;
  onClose: () => void;
  // Owned by the parent (PhotoLightbox), not this page — the whole modal's
  // content (every page, plus the close button/index badge chrome) moves
  // and dims together as one unit while dismissing, not just the page you
  // happened to start the drag on.
  dismissTranslateY: SharedValue<number>;
  backdropOpacity: SharedValue<number>;
};

// Two fixes layered on top of each other here, both about gesture
// arbitration rather than the pinch-zoom math itself (unchanged):
// (1) Swipe-to-dismiss used to live in a separate outer GestureDetector
// wrapping the whole FlatList, while pinch/reposition/double-tap lived in
// each page's own inner GestureDetector — two independent RNGH gesture
// trees both trying to claim the same single-finger touches, with no
// explicit relationship between them. Consolidated into one gesture tree
// per page (single top-level GestureDetector) so there's only ever one
// tree deciding what a given touch means.
// (2) That consolidation then put reposition-while-zoomed and
// swipe-to-dismiss in a 3-way Gesture.Race against pinch — which turned out
// to still be unreliable in practice: a Gesture.Pinch()'s ScaleGestureDetector
// has to observe every touch event regardless of pointer count, and sharing
// a Race with a Pan is a known rough edge for that reason, confirmed live
// (swipe-to-dismiss silently never activated). Fixed by gating
// reposition/dismissPan with `.enabled()` on real React state instead of
// racing them against each other — a disabled RNGH gesture doesn't enter
// touch arbitration at all, so only one of the two ever competes with pinch
// at a time, closer to the original, already-proven `Gesture.Race(pan,
// pinch)` two-candidate shape than the three-way race that replaced it.
function LightboxPage({ uri, width, height, onClose, dismissTranslateY, backdropOpacity }: LightboxPageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  // Mirrors scale > 1 as real React state, purely to gate which single-
  // finger Pan gesture is .enabled() below (see the comment above
  // `reposition`/`dismissPan`) — a disabled RNGH gesture never enters touch
  // arbitration at all, which is a stronger, simpler guarantee than trying
  // to out-race a sibling recognizer. wasZoomed (a shared value, not React
  // state) avoids calling the setter every pinch frame — only when actually
  // crossing the threshold, so isZoomed doesn't re-render on every pixel of
  // pinch movement.
  const [isZoomed, setIsZoomed] = useState(false);
  const wasZoomed = useSharedValue(false);
  function syncZoomedState(nextScale: number) {
    'worklet';
    const zoomed = nextScale > 1;
    if (zoomed !== wasZoomed.value) {
      wasZoomed.value = zoomed;
      runOnJS(setIsZoomed)(zoomed);
    }
  }
  // translateX/Y are the single continuously-authoritative position, kept in
  // sync by whichever gesture (pinch or pan) last touched them — no separate
  // "saved" checkpoint needed for translate the way scale needs savedScale,
  // since every write below is already relative to the live current value.
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  // The focal point as of the *previous* onChange frame (reset to the
  // initial focal on onStart) — this is what makes the zoom track a moving
  // pinch instead of freezing to wherever the gesture began. Recomputing
  // against the *current* focal point every single onChange frame, relative
  // to last frame's focal point, folds zoom and pan into one continuous
  // two-finger gesture instead of two you have to alternate between.
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);
  // The image's natural aspect ratio, reported once by Image's onLoad — used
  // to work out where contentFit="contain"'s letterbox/pillarbox dead space
  // actually is, so a tap can tell "on the photo" from "in the margin
  // around it" apart. A shared value (not React state) since it needs to be
  // read from the tap gesture's worklet on the UI thread.
  const imageAspectRatio = useSharedValue(DEFAULT_ASPECT_RATIO);

  function handleImageLoad(event: ImageLoadEventData) {
    const { width: w, height: h } = event.source;
    if (w > 0 && h > 0) imageAspectRatio.value = w / h;
  }

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
      // continuously, every frame.
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
      syncZoomedState(nextScale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  // Reposition-while-zoomed and swipe-to-dismiss used to be two separate
  // single-finger Pan gestures raced against pinch and each other — putting
  // three recognizers (including a Pinch, whose ScaleGestureDetector has to
  // see every touch event regardless of pointer count) in one Race turned
  // out to be exactly what broke swipe-to-dismiss: reliable per RNGH's docs
  // in theory, but pinch sharing a Race with a Pan is a known rough edge in
  // practice. Gating each Pan's `.enabled()` on the same `isZoomed` React
  // state instead means only one of them ever enters touch arbitration at
  // all — a disabled RNGH gesture doesn't compete for the touch, it's simply
  // not there. `reposition` needs no manual activation anymore: `.enabled`
  // already ensures it only ever attaches while zoomed.
  const reposition = Gesture.Pan()
    .enabled(isZoomed)
    .onChange((event) => {
      translateX.value = clampTranslate(translateX.value + event.changeX, width, scale.value);
      translateY.value = clampTranslate(translateY.value + event.changeY, height, scale.value);
    });

  // Swipe-to-dismiss — lives alongside every other page gesture in this one
  // tree instead of a separate outer GestureDetector, but `.enabled(!isZoomed)`
  // keeps it structurally exclusive with `reposition` above rather than
  // racing it (see that gesture's own comment for why). Vertical-only
  // (either direction): activeOffsetY claims it once a drag reads as
  // vertical, failOffsetX yields to the FlatList's own horizontal paging
  // the moment a drag reads as more horizontal than vertical.
  const dismissPan = Gesture.Pan()
    .enabled(!isZoomed)
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onChange((event) => {
      dismissTranslateY.value = event.translationY;
      backdropOpacity.value = 1 - clamp(Math.abs(event.translationY) / 400, 0, 0.7);
    })
    .onEnd((event) => {
      const shouldDismiss =
        Math.abs(dismissTranslateY.value) > DISMISS_DISTANCE || Math.abs(event.velocityY) > DISMISS_VELOCITY;
      if (shouldDismiss) {
        runOnJS(onClose)();
      }
      dismissTranslateY.value = withTiming(0);
      backdropOpacity.value = withTiming(1);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      scale.value = withTiming(1);
      savedScale.value = 1;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      syncZoomedState(1);
    });

  // Tapping the dead space around the photo (the letterbox/pillarbox margin
  // contentFit="contain" leaves when the image's aspect ratio doesn't match
  // the screen's) dismisses, same as swiping — tapping the photo itself
  // doesn't, so a plain "look closer" tap isn't mistaken for "I'm done."
  // Only meaningful unzoomed (scale 1): once zoomed the photo can easily
  // cover the whole page, so "outside the photo" stops being a stable
  // target — reposition is the only gesture enabled at all by then anyway
  // (see its own comment), so this would never even run.
  const singleTapDismiss = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((event) => {
      'worklet';
      if (scale.value > 1) return;
      const containerRatio = width / height;
      let left = 0;
      let right = width;
      let top = 0;
      let bottom = height;
      if (imageAspectRatio.value > containerRatio) {
        // Image is relatively wider than the container — fills the full
        // width, letterboxed top/bottom.
        const renderedHeight = width / imageAspectRatio.value;
        top = (height - renderedHeight) / 2;
        bottom = top + renderedHeight;
      } else {
        // Fills the full height, pillarboxed left/right.
        const renderedWidth = height * imageAspectRatio.value;
        left = (width - renderedWidth) / 2;
        right = left + renderedWidth;
      }
      const isOutsidePhoto = event.x < left || event.x > right || event.y < top || event.y > bottom;
      if (isOutsidePhoto) runOnJS(onClose)();
    });

  // Race: reposition and dismissPan are never BOTH enabled at once (see
  // their own comments), so this is really pinch racing whichever single
  // one is currently live — the same two-candidate shape as the original,
  // already-proven Gesture.Race(pan, pinch), just with the "pan" side
  // swapped out depending on zoom state instead of being one gesture. Still
  // a real Race (not Simultaneous) so a second finger touching down mid-drag
  // lets pinch take over, standard "start with one finger, bring the second
  // in to actually pinch" UX. Exclusive: gives doubleTap first refusal on a
  // tap sequence (RNGH's standard single/double-tap disambiguation shape) —
  // singleTapDismiss only ever runs once doubleTap has already given up
  // waiting for a second tap.
  const composed = Gesture.Simultaneous(
    Gesture.Race(pinch, reposition, dismissPan),
    Gesture.Exclusive(doubleTap, singleTapDismiss)
  );

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.page, { width }]}>
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image source={{ uri }} style={styles.image} contentFit="contain" onLoad={handleImageLoad} />
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
// `pinch` gesture). Double-tap resets to fit. Swipe (either direction) or
// tap the dead space around a photo to dismiss — see LightboxPage's own
// comment for why all of this lives in one gesture tree per page rather
// than split across this component and each page.
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

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* RN's Modal renders into its own native window (a Dialog on Android,
          a separate UIWindow on iOS) — outside the view hierarchy the root
          layout's GestureHandlerRootView (src/app/_layout.tsx) actually
          covers. Without a GestureHandlerRootView of its own inside the
          Modal, every custom Gesture.Pan()/Gesture.Tap() below silently
          never activates (they need that context to register with the
          native gesture-handler runtime), while plain RN touch handling
          (Pressable, FlatList's native scroll) works fine since neither
          depends on it — exactly the "only horizontal paging responds"
          symptom confirmed live after two prior fixes (gesture-tree
          consolidation, RNGH FlatList swap) both failed to change anything. */}
      <GestureHandlerRootView style={styles.flex}>
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
                renderItem={({ item }) => (
                  <LightboxPage
                    uri={item}
                    width={width}
                    height={height}
                    onClose={onClose}
                    dismissTranslateY={translateY}
                    backdropOpacity={backdropOpacity}
                  />
                )}
              />
            </Animated.View>
          )}
        </Animated.View>
      </GestureHandlerRootView>
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
