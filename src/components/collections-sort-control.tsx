import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type CollectionSortMode = 'recently_edited' | 'mean_rating' | 'most_saves';

const SORT_MODES: { key: CollectionSortMode; label: string }[] = [
  { key: 'recently_edited', label: 'Recently edited' },
  { key: 'mean_rating', label: 'Top rated' },
  { key: 'most_saves', label: 'Most saved' },
];

type CollectionsSortControlProps = {
  active: CollectionSortMode;
  onChange: (mode: CollectionSortMode) => void;
};

export function CollectionsSortControl({ active, onChange }: CollectionsSortControlProps) {
  return (
    <View style={styles.row}>
      {SORT_MODES.map((mode) => (
        <Pressable key={mode.key} onPress={() => onChange(mode.key)}>
          <ThemedView type={active === mode.key ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
            <ThemedText type="small" themeColor={active === mode.key ? 'text' : 'textSecondary'}>
              {mode.label}
            </ThemedText>
          </ThemedView>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
