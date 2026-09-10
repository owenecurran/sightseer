import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

type CheckboxRowProps = {
  label: string;
  // Second line under the label, for a setting whose consequence is not
  // obvious from its name.
  description?: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
};

// A labelled checkbox. Lifted out of settings.tsx when the notification
// preferences moved to their own screen and both needed it.
export function CheckboxRow({ label, description, checked, onPress, disabled }: CheckboxRowProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.row}>
      <ThemedView type={checked ? 'backgroundSelected' : 'background'} style={styles.box}>
        {checked && <ThemedText type="smallBold">✓</ThemedText>}
      </ThemedView>
      {/* Takes the slack so a long label wraps under itself rather than
          pushing the box off the row. */}
      <ThemedText type="small" style={styles.label}>
        {label}
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {'\n'}
            {description}
          </ThemedText>
        ) : null}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    // The card behind these is backgroundElement, so an unchecked box needs
    // its own outline to read as a control rather than a hole.
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.25)',
  },
  label: {
    flex: 1,
  },
});
