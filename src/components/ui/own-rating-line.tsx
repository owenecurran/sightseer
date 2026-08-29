import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { Spacing } from '@/constants/theme';

// Deliberately smaller than the stamp a row carries for its own review
// (32-52px elsewhere), so the two never read as equals: this one is an
// aside about the viewer, not the review being listed.
const OWN_STAMP_SIZE = 26;

// "Your rating" plus the viewer's own stamp — the secondary rating shown on
// board rows and travel-book entries for a place the viewer has also
// reviewed themselves.
//
// One component rather than the five identical copies of this markup that
// existed across the three board views and the travel book, which is
// exactly how a "★" managed to survive in five places after the rest of the
// app moved to stamps.
export function OwnRatingLine({ rating }: { rating: number }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary">
        Your rating
      </ThemedText>
      <RatingGlassBadgeGated rating={rating} size={OWN_STAMP_SIZE} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
