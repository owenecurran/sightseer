import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

const FRAME_SIZE = 320;
// Capped lower than before (was 3) — zooming all the way in produced
// visibly soft/blurry crops from typical phone-camera source resolutions.
// Shared by both review-photo and profile-prompt-photo uploads, so this
// limit applies uniformly to both.
const MAX_ZOOM = 2;

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

export type CroppedPhoto = { uri: string; width: number; height: number };

type PhotoCropModalProps = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: (result: CroppedPhoto) => void;
};

// Square (1:1) crop, matching the rest of the app's photo display — a
// review's single-photo layout is already square (PhotoGrid), so cropping
// every upload to the same ratio at the source is what actually makes the
// aspect ratio "consistent," not just how it's later displayed.
export function PhotoCropModal({ visible, uri, onCancel, onConfirm }: PhotoCropModalProps) {
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (!uri) return;
    setImageSize(null);
    setError(null);
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    savedTranslateX.value = 0;
    translateY.value = 0;
    savedTranslateY.value = 0;

    Image.getSize(
      uri,
      (width, height) => setImageSize({ width, height }),
      () => setError('Could not load that image.')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  const baseScale = imageSize ? Math.max(FRAME_SIZE / imageSize.width, FRAME_SIZE / imageSize.height) : 1;

  function maxPan(effectiveScale: number): { x: number; y: number } {
    'worklet';
    if (!imageSize) return { x: 0, y: 0 };
    return {
      x: Math.max((imageSize.width * effectiveScale - FRAME_SIZE) / 2, 0),
      y: Math.max((imageSize.height * effectiveScale - FRAME_SIZE) / 2, 0),
    };
  }

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
      const effectiveScale = baseScale * nextScale;
      const bound = maxPan(effectiveScale);
      translateX.value = clamp(translateX.value, -bound.x, bound.x);
      translateY.value = clamp(translateY.value, -bound.y, bound.y);
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    }

    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSize, baseScale]);

  const pan = Gesture.Pan().onChange((event) => {
    const effectiveScale = baseScale * scale.value;
    const bound = maxPan(effectiveScale);
    translateX.value = clamp(savedTranslateX.value + event.translationX, -bound.x, bound.x);
    translateY.value = clamp(savedTranslateY.value + event.translationY, -bound.y, bound.y);
  });

  const pinch = Gesture.Pinch()
    .onChange((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_ZOOM);
      const effectiveScale = baseScale * scale.value;
      const bound = maxPan(effectiveScale);
      translateX.value = clamp(translateX.value, -bound.x, bound.x);
      translateY.value = clamp(translateY.value, -bound.y, bound.y);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pan, pinch);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  async function handleConfirm() {
    if (!uri || !imageSize) return;
    setIsProcessing(true);
    setError(null);
    try {
      const effectiveScale = baseScale * scale.value;
      const renderedWidth = imageSize.width * effectiveScale;
      const renderedHeight = imageSize.height * effectiveScale;
      const visibleLeft = (renderedWidth - FRAME_SIZE) / 2 - translateX.value;
      const visibleTop = (renderedHeight - FRAME_SIZE) / 2 - translateY.value;
      const cropSize = FRAME_SIZE / effectiveScale;

      const context = ImageManipulator.manipulate(uri).crop({
        originX: clamp(visibleLeft / effectiveScale, 0, imageSize.width - cropSize),
        originY: clamp(visibleTop / effectiveScale, 0, imageSize.height - cropSize),
        width: cropSize,
        height: cropSize,
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

          <View style={styles.frame} ref={frameRef}>
            {uri && imageSize && (
              <GestureDetector gesture={composed}>
                <Animated.View style={imageStyle}>
                  <Image
                    source={{ uri }}
                    style={{ width: imageSize.width * baseScale, height: imageSize.height * baseScale }}
                  />
                </Animated.View>
              </GestureDetector>
            )}
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'web'
              ? 'Drag to reposition, scroll to zoom.'
              : 'Drag to reposition, pinch to zoom.'}
          </ThemedText>

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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.two,
    alignItems: 'center',
  },
  frame: {
    width: FRAME_SIZE,
    height: FRAME_SIZE,
    overflow: 'hidden',
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00000022',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'center',
  },
});
