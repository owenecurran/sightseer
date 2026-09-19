import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StickerArrow } from '@/components/ui/sticker-arrow';
import { Spacing } from '@/constants/theme';

type SettingsRowProps = {
  label: string;
  // One line saying what is behind the row, so the label does not have to
  // carry the whole explanation.
  description?: string;
  onPress: () => void;
  // Destructive rows get the danger colour and no chevron — they act here
  // rather than navigating, and should not look like the rest.
  tone?: 'default' | 'danger';
};

// One row that goes somewhere. Settings previously expressed the same
// intent three different ways — a secondary Button for "Manage home
// locations", a bare sage Pressable for "Terms of use", another for "Delete
// my account" — so a destructive action and a legal link were styled
// identically while two navigations to sibling screens were not.
export function SettingsRow({ label, description, onPress, tone = 'default' }: SettingsRowProps) {
  const isDanger = tone === 'danger';

  return (
    <Pressable onPress={onPress} style={styles.row} hitSlop={4}>
      <View style={styles.text}>
        <ThemedText type="small" themeColor={isDanger ? 'danger' : 'text'}>
          {label}
        </ThemedText>
        {description && (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        )}
      </View>
      {/* The app's own "go here" mark rather than a chevron — the same
          sticker StickerLink and the ticket cards use, so every forward
          affordance in the app is one object instead of three. Seeded off
          the label so a settings list is a row of different stickers rather
          than the same one repeated. */}
      {!isDanger && <StickerArrow direction="right" size={20} seed={`settings:${label}`} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  // Takes the slack so a description wraps instead of shoving the chevron
  // off the row.
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
