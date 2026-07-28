import { StyleSheet, View } from 'react-native';

import { LoadableImage } from '@/components/ui/loadable-image';
import { Spacing } from '@/constants/theme';

export const MAX_VISIT_PHOTOS = 4;

type PhotoGridProps = {
  urls: string[];
};

// Layouts match the standard 1/2/3/4-photo social-feed grid (Instagram-style):
// 1 full width, 2 side-by-side, 3 as one tall + two stacked, 4 as a 2x2 grid.
export function PhotoGrid({ urls }: PhotoGridProps) {
  if (urls.length === 0) return null;

  if (urls.length === 1) {
    return <LoadableImage source={{ uri: urls[0] }} style={styles.single} />;
  }

  if (urls.length === 2) {
    return (
      <View style={styles.row}>
        <LoadableImage source={{ uri: urls[0] }} style={styles.square} />
        <LoadableImage source={{ uri: urls[1] }} style={styles.square} />
      </View>
    );
  }

  if (urls.length === 3) {
    return (
      <View style={styles.row}>
        <LoadableImage source={{ uri: urls[0] }} style={styles.tall} />
        <View style={styles.column}>
          <LoadableImage source={{ uri: urls[1] }} style={styles.square} />
          <LoadableImage source={{ uri: urls[2] }} style={styles.square} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.column}>
      <View style={styles.row}>
        <LoadableImage source={{ uri: urls[0] }} style={styles.square} />
        <LoadableImage source={{ uri: urls[1] }} style={styles.square} />
      </View>
      <View style={styles.row}>
        <LoadableImage source={{ uri: urls[2] }} style={styles.square} />
        {urls[3] && <LoadableImage source={{ uri: urls[3] }} style={styles.square} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  single: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.half,
  },
  column: {
    flex: 1,
    gap: Spacing.half,
  },
  square: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: Spacing.two,
  },
  tall: {
    flex: 1,
    aspectRatio: 0.5,
    borderRadius: Spacing.two,
  },
});
