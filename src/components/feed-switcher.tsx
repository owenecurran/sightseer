import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type FeedMode = 'feed' | 'discover';

type FeedSwitcherProps = {
  active: FeedMode;
  onChange: (mode: FeedMode) => void;
};

// Same controlled two-chip pattern as collections-switcher.tsx (byte-identical
// styling) — Feed and Discover live on the same Home screen, so this is a
// plain toggle, not a navigation link between two routes.
export function FeedSwitcher({ active, onChange }: FeedSwitcherProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => onChange('feed')}>
        <ThemedView type={active === 'feed' ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
          <ThemedText type="small" themeColor={active === 'feed' ? 'text' : 'textSecondary'}>
            Feed
          </ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable onPress={() => onChange('discover')}>
        <ThemedView type={active === 'discover' ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
          <ThemedText type="small" themeColor={active === 'discover' ? 'text' : 'textSecondary'}>
            Discover
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
