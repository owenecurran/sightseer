import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';

type LoadableImageProps = Omit<ImageProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
};

// Wraps expo-image's <Image> with a loading-state icon shown until the
// image has actually finished loading (or indefinitely, if no source is
// available yet — e.g. a presigned view URL that hasn't resolved). Covers
// both "no URL yet" and "URL resolved, bytes still downloading" under one
// consistent loading treatment instead of the previous silent blank gap.
export function LoadableImage({ source, style, ...rest }: LoadableImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const hasSource = source != null;

  return (
    <View style={[style, styles.clip]}>
      {hasSource && (
        <Image {...rest} source={source} style={styles.fill} onLoad={() => setIsLoaded(true)} />
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
