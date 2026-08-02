import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Image, LayoutChangeEvent, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const FRAME_MAX = 320;
// Capped lower than before (was 3) — zooming all the way in produced
// visibly soft/blurry crops from typical phone-camera source resolutions.
// Shared by both review-photo and profile-prompt-photo uploads, so this
// limit applies uniformly to both.
const MAX_ZOOM = 2;

const MIN_RATIO = 9 / 16;
const MAX_RATIO = 16 / 9;
const MIN_LOG_RATIO = Math.log2(MIN_RATIO);
const MAX_LOG_RATIO = Math.log2(MAX_RATIO);

const RATIO_PRESETS: { label: string; ratio: number }[] = [
  { label: '9:16', ratio: 9 / 16 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
];

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

// t in [0,1] <-> ratio in [9/16, 16/9], interpolated in log space so the
// slider feels evenly balanced around 1:1 (square) at its center rather than
// bunching most of its travel into the wide end.
function ratioFromT(t: number) {
  'worklet';
  return Math.pow(2, MIN_LOG_RATIO + t * (MAX_LOG_RATIO - MIN_LOG_RATIO));
}

function tFromRatio(ratio: number) {
  return (Math.log2(ratio) - MIN_LOG_RATIO) / (MAX_LOG_RATIO - MIN_LOG_RATIO);
}

// Frame dimensions always fit inside a FRAME_MAX x FRAME_MAX box (contained,
// not covered) so the sheet's overall size stays stable as the ratio changes
// — only the crop window inside it grows/shrinks.
function frameDimsForRatio(ratio: number): { width: number; height: number } {
  'worklet';
  return ratio >= 1 ? { width: FRAME_MAX, height: FRAME_MAX / ratio } : { width: FRAME_MAX * ratio, height: FRAME_MAX };
}

function maxPan(effectiveScale: number, frameW: number, frameH: number, imgW: number, imgH: number) {
  'worklet';
  return {
    x: Math.max((imgW * effectiveScale - frameW) / 2, 0),
    y: Math.max((imgH * effectiveScale - frameH) / 2, 0),
  };
}

export type CroppedPhoto = { uri: string; width: number; height: number };

type PhotoCropModalProps = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (result: CroppedPhoto) => void;
  // Off by default so every existing call site (profile-prompt photos, trip
  // recap covers) keeps today's square-only crop unchanged. Only review
  // photos (new + edited) opt in to the 9:16-16:9 ratio picker.
  allowRatioSelection?: boolean;
};

export function PhotoCropModal({ visible, uri, onCancel, onConfirm, allowRatioSelection = false }: PhotoCropModalProps) {
  const theme = useTheme();
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sliderTrackWidth, setSliderTrackWidth] = useState(0);

  const t = useSharedValue(0.5);
  const imageWidth = useSharedValue(0);
  const imageHeight = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const frameWidth = useDerivedValue(() => frameDimsForRatio(ratioFromT(t.value)).width);
  const frameHeight = useDerivedValue(() => frameDimsForRatio(ratioFromT(t.value)).height);
  const baseScale = useDerivedValue(() => {
    if (imageWidth.value === 0) return 1;
    return Math.max(frameWidth.value / imageWidth.value, frameHeight.value / imageHeight.value);
  });

  useEffect(() => {
    if (!uri) return;
    setImageSize(null);
    setError(null);
    t.value = 0.5;
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    savedTranslateX.value = 0;
    translateY.value = 0;
    savedTranslateY.value = 0;

    Image.getSize(
      uri,
      (width, height) => {
        setImageSize({ width, height });
        imageWidth.value = width;
        imageHeight.value = height;
        // Default to the photo's own framing rather than force-cropping to
        // a square — square was cutting a lot of most photos away by
        // default (anything not already ~1:1) before the user touched
        // anything, which read as "zoomed in and not matching the review."
        t.value = tFromRatio(clamp(width / height, MIN_RATIO, MAX_RATIO));
      },
      () => setError('Could not load that image.')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  // Pinch-to-zoom has no mouse equivalent — on web, let scrolling inside the
  // frame zoom instead (RNGH doesn't expose wheel events, so this attaches
  // a plain DOM listener directly; View's ref forwards to the real element
  // on web via react-native-web).
  const frameRef = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || !imageSize) return;
    const node = frameRef.current as unknown as HTMLElement | null;
    if (!node) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const nextScale = clamp(scale.value - event.deltaY * 0.002, 1, MAX_ZOOM);
      scale.value = nextScale;
      savedScale.value = nextScale;
      const effectiveScale = baseScale.value * nextScale;
      const bound = maxPan(effectiveScale, frameWidth.value, frameHeight.value, imageWidth.value, imageHeight.value);
      translateX.value = clamp(translateX.value, -bound.x, bound.x);
      translateY.value = clamp(translateY.value, -bound.y, bound.y);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    }

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize]);

  const pan = Gesture.Pan().onChange((event) => {
    const effectiveScale = baseScale.value * scale.value;
    const bound = maxPan(effectiveScale, frameWidth.value, frameHeight.value, imageWidth.value, imageHeight.value);
    translateX.value = clamp(savedTranslateX.value + event.translationX, -bound.x, bound.x);
    translateY.value = clamp(savedTranslateY.value + event.translationY, -bound.y, bound.y);
  });

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_ZOOM);
      const effectiveScale = baseScale.value * scale.value;
      const bound = maxPan(effectiveScale, frameWidth.value, frameHeight.value, imageWidth.value, imageHeight.value);
      translateX.value = clamp(translateX.value, -bound.x, bound.x);
      translateY.value = clamp(translateY.value, -bound.y, bound.y);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const frameContainerStyle = useAnimatedStyle(() => ({
    width: frameWidth.value,
    height: frameHeight.value,
  }));

  const imageStyle = useAnimatedStyle(() => ({
    width: imageWidth.value * baseScale.value,
    height: imageHeight.value * baseScale.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // Shared by the ratio slider's drag and the preset chips — moves `t`
  // (re-deriving frame dims from the target ratio directly, rather than
  // reading the not-yet-updated `frameWidth`/`frameHeight` derived values)
  // then re-clamps pan into the new bounds, same as pinch's onEnd re-clamp.
  // Tagged 'worklet' so it's directly callable both from the slider's UI-
  // thread gesture callbacks and from the preset chips' plain JS onPress —
  // worklets remain valid callables from either thread, same as `clamp`.
  function setRatio(nextT: number) {
    'worklet';
    t.value = clamp(nextT, 0, 1);
    const dims = frameDimsForRatio(ratioFromT(t.value));
    const effectiveScale = baseScale.value * scale.value;
    const bound = maxPan(effectiveScale, dims.width, dims.height, imageWidth.value, imageHeight.value);
    translateX.value = clamp(translateX.value, -bound.x, bound.x);
    translateY.value = clamp(translateY.value, -bound.y, bound.y);
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  }

  function handleSliderLayout(event: LayoutChangeEvent) {
    setSliderTrackWidth(event.nativeEvent.layout.width);
  }

  const sliderPan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      if (sliderTrackWidth <= 0) return;
      setRatio(event.x / sliderTrackWidth);
    })
    .onChange((event) => {
      if (sliderTrackWidth <= 0) return;
      setRatio(event.x / sliderTrackWidth);
    });

  const sliderThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * Math.max(sliderTrackWidth - THUMB_SIZE, 0) }],
  }));
  const sliderFillStyle = useAnimatedStyle(() => ({
    width: `${t.value * 100}%`,
  }));

  async function handleConfirm() {
    if (!uri || !imageSize) return;
    setIsProcessing(true);
    setError(null);
    try {
      const frameW = frameWidth.value;
      const frameH = frameHeight.value;
      const effectiveScale = baseScale.value * scale.value;
      const renderedWidth = imageSize.width * effectiveScale;
      const renderedHeight = imageSize.height * effectiveScale;
      const visibleLeft = (renderedWidth - frameW) / 2 - translateX.value;
      const visibleTop = (renderedHeight - frameH) / 2 - translateY.value;
      const cropWidth = frameW / effectiveScale;
      const cropHeight = frameH / effectiveScale;

      // Rounded defensively — the manipulator's web (canvas-based) backend
      // in particular can misbehave on fractional pixel rects, which this
      // math produces almost every time (frame/scale are rarely whole-
      // number ratios of each other).
      const originX = Math.round(clamp(visibleLeft / effectiveScale, 0, imageSize.width - cropWidth));
      const originY = Math.round(clamp(visibleTop / effectiveScale, 0, imageSize.height - cropHeight));
      const context = ImageManipulator.manipulate(uri).crop({
        originX,
        originY,
        width: Math.round(cropWidth),
        height: Math.round(cropHeight),
      });
      const rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
      onConfirm({ uri: saved.uri, width: saved.width, height: saved.height });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not crop that photo.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <ThemedView type="background" style={styles.sheet}>
          <ThemedText type="smallBold">Adjust photo</ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <View style={styles.frameOuter}>
            <Animated.View style={[styles.frame, frameContainerStyle]} ref={frameRef}>
              {uri && imageSize && (
                <GestureDetector gesture={composed}>
                  <Animated.View style={imageStyle}>
                    <Image source={{ uri }} style={styles.fillImage} />
                  </Animated.View>
                </GestureDetector>
              )}
            </Animated.View>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'web'
              ? 'Drag to reposition, scroll to zoom.'
              : 'Drag to reposition, pinch to zoom.'}
          </ThemedText>

          {allowRatioSelection && imageSize && (
            <View style={styles.ratioSection}>
              <GestureDetector gesture={sliderPan}>
                <View style={styles.sliderTrack} onLayout={handleSliderLayout}>
                  <View style={[styles.sliderTrackBackground, { backgroundColor: theme.backgroundElement }]} />
                  {sliderTrackWidth > 0 && (
                    <>
                      <Animated.View style={[styles.sliderFill, sliderFillStyle, { backgroundColor: theme.sage }]} />
                      <Animated.View
                        style={[styles.sliderThumb, sliderThumbStyle, { backgroundColor: theme.sage, borderColor: theme.background }]}
                      />
                    </>
                  )}
                </View>
              </GestureDetector>

              <View style={styles.presetsRow}>
                <Pressable
                  onPress={() => setRatio(tFromRatio(clamp(imageSize.width / imageSize.height, MIN_RATIO, MAX_RATIO)))}
                  hitSlop={6}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Original
                  </ThemedText>
                </Pressable>
                {RATIO_PRESETS.map((preset) => (
                  <Pressable key={preset.label} onPress={() => setRatio(tFromRatio(preset.ratio))} hitSlop={6}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {preset.label}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <View style={styles.actionsRow}>
            <Pressable onPress={onCancel} disabled={isProcessing}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
            <Button label="Use photo" onPress={handleConfirm} loading={isProcessing} disabled={!imageSize} />
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 6;
const TOUCH_TARGET_HEIGHT = 36;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    width: FRAME_MAX + Spacing.four * 2,
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    alignItems: 'center',
  },
  frameOuter: {
    width: FRAME_MAX,
    height: FRAME_MAX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    overflow: 'hidden',
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000022',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'center',
  },
  ratioSection: {
    width: '100%',
    gap: Spacing.one,
  },
  sliderTrack: {
    width: '100%',
    height: TOUCH_TARGET_HEIGHT,
    justifyContent: 'center',
  },
  sliderTrackBackground: {
    position: 'absolute',
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  sliderFill: {
    position: 'absolute',
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
  },
  sliderThumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
  },
  presetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
});
