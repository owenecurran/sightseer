import { StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { RoadLoader } from '@/components/ui/road-loader';

// Full-screen buffer shown in place of a screen's whole content until its
// data has loaded — not just per-image spinners (LoadableImage/
// ImageLoadingIcon already cover those). Uses the same gradient
// (`type="screen"`) as the page it precedes so there's no flash of a
// different background once real content swaps in. A whole page waiting
// gets the sketched road; a single image waiting keeps the small walking
// mark, which fits in a thumbnail where the road would not.
export function PageLoader() {
  return (
    <ThemedView type="screen" style={styles.container}>
      <View style={styles.iconWrap}>
        <RoadLoader />
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
