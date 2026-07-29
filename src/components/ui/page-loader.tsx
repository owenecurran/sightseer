import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';

// Full-screen buffer shown in place of a screen's whole content until its
// data has loaded — not just per-image spinners (LoadableImage/
// ImageLoadingIcon already cover those). Uses the same gradient
// (`type="screen"`) as the page it precedes so there's no flash of a
// different background once real content swaps in, and reuses the same
// walking-icon animation as per-image loading for visual consistency.
export function PageLoader() {
  return (
    <ThemedView type="screen" style={styles.container}>
      <View style={styles.iconWrap}>
        <ImageLoadingIcon />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconWrap: {
    flex: 1,
  },
});
