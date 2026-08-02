import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, useWindowDimensions, View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const MAX_ZOOM = 3;

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

  useEffect(() => {
    if (visible) setActiveIndex(initialIndex);
  }, [visible, initialIndex]);

  function handleMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setActiveIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
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
        )}
      </View>
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
