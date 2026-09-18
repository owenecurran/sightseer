import { Image, type ImageLoadEventData, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';
import { stableImageSource } from '@/lib/image-cache';

type LoadableImageProps = Omit<ImageProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
};

// Wraps expo-image's <Image> with a loading-state icon shown until the
// image has actually finished loading (or indefinitely, if no source is
// available yet — e.g. a presigned view URL that hasn't resolved). Covers
// both "no URL yet" and "URL resolved, bytes still downloading" under one
// consistent loading treatment instead of the previous silent blank gap.
export function LoadableImage({ source, style, onLoad, ...rest }: LoadableImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const hasSource = source != null;

  function handleLoad(event: ImageLoadEventData) {
    setIsLoaded(true);
    onLoad?.(event);
  }

  return (
    <View style={[style, styles.clip]}>
      {hasSource && (
        <Image
          // Decoded bitmaps kept in memory, not just the bytes on disk.
          //
          // expo-image defaults to `disk`, which means scrolling a photo out
          // of the feed and back in re-reads and re-DECODES it every time —
          // and with no thumbnail derivatives in the database yet, every one
          // of those decodes is of a 2048px original. PostcardMap already
          // asks for memory-disk; this is the same request for the thing
          // there are far more of.
          //
          // Overridable per call site: it comes before {...rest}, so a caller
          // that wants something else still wins.
          cachePolicy="memory-disk"
          {...rest}
          // Stable disk-cache identity across presigned-URL rotation — see
          // stableImageSource. Non-string sources pass through untouched.
          source={typeof source === 'object' && source != null && 'uri' in source ? stableImageSource((source as { uri?: string }).uri) : source}
          style={styles.fill}
          onLoad={handleLoad}
        />
      )}
      {!isLoaded && <ImageLoadingIcon />}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFill,
  },
});
