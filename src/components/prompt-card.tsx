import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PROFILE_PROMPTS } from '@/constants/profile-prompts';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { deletePrompt, type ProfilePrompt } from '@/lib/profile-prompts';

type PromptCardProps = {
  existing: ProfilePrompt | undefined;
  onChanged: () => void;
  // Long-press handle to start a drag-reorder — omitted for the trailing
  // "+ Add a prompt" slot, which isn't a real reorderable row.
  onDragStart?: () => void;
};

// The compact row/card only — actually editing a prompt (new or existing)
// now happens on its own full-screen route (src/app/prompt-editor.tsx)
// rather than expanding inline here, since that form grew a lot once
// photo pickers were added and felt cramped wedged into edit-profile's
// scroll alongside everything else.
export function PromptCard({ existing, onChanged, onDragStart }: PromptCardProps) {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);

  async function handleRemovePrompt() {
    if (!existing) return;
    setError(null);
    try {
      await deletePrompt(existing.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that prompt.');
    }
  }

  if (existing) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          {PROFILE_PROMPTS.find((p) => p.slug === existing.promptSlug)?.label ?? existing.promptSlug}
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}
        <View style={styles.row}>
          <Pressable onPress={() => router.push({ pathname: '/prompt-editor', params: { promptId: existing.id } })}>
            <ThemedText type="small">Edit</ThemedText>
          </Pressable>
          <Pressable onPress={handleRemovePrompt}>
            <ThemedText type="small" themeColor="textSecondary">
              Remove
            </ThemedText>
          </Pressable>
          {onDragStart && (
            <Pressable onLongPress={onDragStart} delayLongPress={150} hitSlop={8} style={styles.dragHandle}>
              <Ionicons name="reorder-three-outline" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </ThemedView>
    );
  }

  return (
    <Pressable onPress={() => router.push('/prompt-editor')}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary">
          + Add a prompt
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  dragHandle: {
    marginLeft: 'auto',
  },
});
