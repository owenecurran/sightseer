import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type CollectionsSwitcherProps = {
  active: 'boards' | 'travel_books';
};

// A clear, mutual switcher between Boards and Travel Books — replaces the
// old one-way "Travel books ›" text link (boards.tsx had no way back other
// than the generic "← Back"). Copies board/[id].tsx's modeRow/modeChip
// styling verbatim, the app's established pill-switcher pattern.
export function CollectionsSwitcher({ active }: CollectionsSwitcherProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.replace('/boards')}>
        <ThemedView type={active === 'boards' ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
          <ThemedText type="small" themeColor={active === 'boards' ? 'text' : 'textSecondary'}>
            Boards
          </ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable onPress={() => router.replace('/travel-books')}>
        <ThemedView type={active === 'travel_books' ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
          <ThemedText type="small" themeColor={active === 'travel_books' ? 'text' : 'textSecondary'}>
            Travel books
          </ThemedText>
        </ThemedView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
