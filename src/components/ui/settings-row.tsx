import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  const theme = useTheme();
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
      {!isDanger && <Ionicons name="chevron-forward" size={16} color={theme.textSecondary} />}
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
