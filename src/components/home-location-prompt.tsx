import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { addHomeLocation } from '@/lib/home-locations';
import { dismissHomeLocationPrompt, type HomeLocationSuggestion } from '@/lib/trips';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];

type HomeLocationPromptProps = {
  suggestion: HomeLocationSuggestion;
  // Called once the prompt is resolved either way, so the feed can drop it.
  onResolved: () => void;
};

// "You've been in Lisbon for a while — is this home now?" Shown at the top
// of the feed when someone's ongoing trip has run long enough that it stops
// looking like travel (see LONG_STAY_DAYS).
//
// Adding the place here is what makes their reviews there stop grouping as
// a trip, which is the whole point of asking — so this is a settings change
// surfaced at the moment it's actually relevant, not a notification.
export function HomeLocationPrompt({ suggestion, onResolved }: HomeLocationPromptProps) {
  const { trip, dayCount } = suggestion;
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    setIsBusy(true);
    try {
      // Only id and name are read by addHomeLocation (the latter purely for
      // its error messages), so the trip's own area stands in for the full
      // place row rather than costing another fetch.
      await addHomeLocation(trip.userId, {
        id: trip.areaPlaceId,
        name: trip.areaName,
      } as PlaceRow);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that home location.');
      setIsBusy(false);
    }
  }

  async function handleDismiss() {
    setError(null);
    setIsBusy(true);
    try {
      await dismissHomeLocationPrompt(trip);
      onResolved();
    } catch {
      // Nothing actionable for the user here — the prompt simply stays and
      // can be dismissed again next time.
      setIsBusy(false);
    }
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="sectionLabel">Still in {trip.areaName}?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        You've been posting from {trip.areaName} for {dayCount} days. Add it as a home location and
        reviews there will stop being grouped as a trip.
      </ThemedText>

      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      <View style={styles.actions}>
        <Pressable onPress={handleAdd} disabled={isBusy} hitSlop={8}>
          <ThemedText type="small" themeColor="sage">
            {isBusy ? 'Saving…' : 'Add as home'}
          </ThemedText>
        </Pressable>
        <Pressable onPress={handleDismiss} disabled={isBusy} hitSlop={8}>
          <ThemedText type="small" themeColor="textSecondary">
            Not home
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
