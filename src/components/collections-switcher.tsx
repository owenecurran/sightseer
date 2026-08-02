import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type CollectionMode = 'boards' | 'travel_books';

type CollectionsSwitcherProps = {
  active: CollectionMode;
  onChange: (mode: CollectionMode) => void;
};

// A clear, mutual switcher between Boards and Travel Books — both live on
// the same tabbed screen (boards.tsx), so this is a plain controlled toggle,
// not a navigation link between two routes.
export function CollectionsSwitcher({ active, onChange }: CollectionsSwitcherProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={() => onChange('boards')}>
        <ThemedView type={active === 'boards' ? 'backgroundSelected' : 'backgroundElement'} style={styles.chip}>
          <ThemedText type="small" themeColor={active === 'boards' ? 'text' : 'textSecondary'}>
            Boards
          </ThemedText>
        </ThemedView>
      </Pressable>
      <Pressable onPress={() => onChange('travel_books')}>
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
