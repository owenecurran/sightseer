import { Image, type ImageErrorEventData, type ImageLoadEventData, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';
import { stableImageSource } from '@/lib/image-cache';

type LoadableImageProps = Omit<ImageProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  // Whether a missing source is still on its way. It is by default: no
  // source yet means the address is still being looked up. A caller that
  // knows nothing is coming (the lookup has finished and this one has no
  // photo) passes false, and gets a bare frame instead of a loading icon for
  // a picture that will never arrive.
  pending?: boolean;
};

// The URI a source points at, or null for one that points at nothing yet:
// no source at all, or `{ uri: undefined }`, which callers pass while a
// signed URL is still being fetched. A local asset (a number) counts as
// pointing at something.
function sourceKey(source: ImageProps['source']): string | null {
  if (source == null) return null;
  if (typeof source === 'object' && !Array.isArray(source) && 'uri' in source) {
    return source.uri ? source.uri : null;
  }
  return typeof source === 'string' ? source : 'local';
}

// Wraps expo-image's <Image> with a loading-state icon shown until the
// image has actually finished loading, or until there is nothing left to wait
// for: the load failed, or the caller says no source is coming (`pending`).
// Covers both "no URL yet" and "URL resolved, bytes still downloading" under
// one consistent loading treatment instead of the previous silent blank gap.
//
// A failed load used to leave the icon up for good: nothing listened for the
// error, so it waited on a load that had already given up. See
// ImageLoadingIcon for what that cost.
export function LoadableImage({
  source,
  style,
  onLoad,
  onError,
  placeholder,
  pending = true,
  ...rest
}: LoadableImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  // Which source failed. Per source rather than a flag, so a new address
  // after a failure (PostcardPhotos falls back from a broken preview to the
  // original, and signed URLs are re-issued) gets its own chance to load.
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const key = sourceKey(source);
  const hasSource = key != null;
  const hasFailed = hasSource && failedSource === key;
  // A placeholder is already something to look at, so the spinner would only
  // be a spinner ON TOP of the picture. The icon exists for the case where
  // the alternative is a blank hole, which is no longer this one.
  const hasPlaceholder = placeholder != null;
  const isWaiting = !isLoaded && !hasFailed && (hasSource || pending);

  function handleLoad(event: ImageLoadEventData) {
    setIsLoaded(true);
    onLoad?.(event);
  }

  function handleError(event: ImageErrorEventData) {
    setFailedSource(key);
    onError?.(event);
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
          placeholder={placeholder}
          {...rest}
          // Stable disk-cache identity across presigned-URL rotation — see
          // stableImageSource. Non-string sources pass through untouched.
          source={typeof source === 'object' && source != null && 'uri' in source ? stableImageSource((source as { uri?: string }).uri) : source}
          style={styles.fill}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {isWaiting && !hasPlaceholder && <ImageLoadingIcon />}
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
