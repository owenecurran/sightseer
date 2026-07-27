import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getVisitedPlaces } from '@/lib/profile-map';

type ProfileMapProps = {
  userId: string;
};

// Web fallback — expo-maps has no web renderer at all, so this is a plain
// summary rather than an interactive map. The real map (pins + colored
// visited regions) only renders via profile-map.native.tsx.
export function ProfileMap({ userId }: ProfileMapProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getVisitedPlaces(userId)
      .then((places) => setCount(places.length))
      .catch(() => setCount(null));
  }, [userId]);

  if (count === null || count === 0) return null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        📍 {count} place{count === 1 ? '' : 's'} visited
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        The map view is available in the app on iOS and Android.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
