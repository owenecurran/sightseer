import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

type SaveCollectionButtonProps = {
  isSaved: boolean;
  notifyOnNewItems: boolean;
  isLoading?: boolean;
  onSave: () => void;
  onUnsave: () => void;
  onToggleNotify: () => void;
};

// Shared "save someone else's board/travel book" affordance — used by
// board/[id].tsx and travel-book/[id].tsx for non-owners. Saving and the
// per-save notify toggle are two separate actions (you can save without
// notifications, or flip notify on/off after the fact) rather than one
// combined step.
export function SaveCollectionButton({
  isSaved,
  notifyOnNewItems,
  isLoading,
  onSave,
  onUnsave,
  onToggleNotify,
}: SaveCollectionButtonProps) {
  if (!isSaved) {
    return <Button label="Save" variant="secondary" onPress={onSave} loading={isLoading} />;
  }

  return (
    <View style={styles.container}>
      <Button label="Saved ✓" variant="secondary" onPress={onUnsave} loading={isLoading} />
      <Pressable onPress={onToggleNotify} style={styles.notifyRow}>
        <ThemedView type={notifyOnNewItems ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
          {notifyOnNewItems && <ThemedText type="smallBold">✓</ThemedText>}
        </ThemedView>
        <ThemedText type="small" themeColor="textSecondary">
          Notify me of new items
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
