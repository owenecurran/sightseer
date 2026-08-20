import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { declineTripPrompt, promoteToTrip, type TripSuggestion } from '@/lib/trips';

type TripSuggestionPromptProps = {
  userId: string;
  suggestion: TripSuggestion;
  // Fired after an answer lands, so the host can drop the prompt. `promoted`
  // says which way it went, since accepting usually wants a refresh and
  // declining doesn't.
  onResolved: (promoted: boolean) => void;
};

// "Looks like you're in Seattle — make this a trip?"
//
// Shown right after publishing a review that completes a qualifying cluster,
// and again as a feed banner if it goes unanswered. Only an explicit "Not a
// trip" silences it: dismissing by navigating away writes nothing, which is
// deliberate — an ignored prompt should come back, an answered one shouldn't.
export function TripSuggestionPrompt({ userId, suggestion, onResolved }: TripSuggestionPromptProps) {
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(promoted: boolean) {
    setError(null);
    setIsBusy(true);
    try {
      if (promoted) await promoteToTrip(userId, suggestion.date);
      else await declineTripPrompt(userId, suggestion.date);
      onResolved(promoted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
      setIsBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="sectionLabel">Making a trip of it?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        You've posted {suggestion.visitCount} reviews around {suggestion.areaName}. Group them as a
        trip and they'll show together — and you can turn them into a travel book later.
      </ThemedText>

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Pressable onPress={() => answer(true)} disabled={isBusy} hitSlop={8}>
          <ThemedText type="small" themeColor="sage">
            {isBusy ? 'Saving…' : 'Yes, make it a trip'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={() => answer(false)} disabled={isBusy} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            Not a trip
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.one,
  },
});
