import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export type CollectionMode = 'boards' | 'travel_books' | 'trips';

type CollectionsSwitcherProps = {
  active: CollectionMode;
  onChange: (mode: CollectionMode) => void;
};

// Switches between Boards, Travel Books and Trips — all three live on the
// same tabbed screen (boards.tsx), so this is a plain controlled toggle, not
// navigation between routes. Trips sit here because they're the same kind of
// thing to a user: a collection of their own reviews, just one the app
// assembled for them rather than one they built by hand.
const MODES: { key: CollectionMode; label: string }[] = [
  { key: 'boards', label: 'Boards' },
  { key: 'travel_books', label: 'Travel books' },
  { key: 'trips', label: 'Trips' },
];
export function CollectionsSwitcher({ active, onChange }: CollectionsSwitcherProps) {
  return (
    <View style={styles.row}>
      {MODES.map((mode) => (
        <Pressable key={mode.key} onPress={() => onChange(mode.key)}>
          <ThemedView
            type={active === mode.key ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.chip}>
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
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
