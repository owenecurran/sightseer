import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { createManualTrip, getVisitRangeForPlace } from '@/lib/trips';

type PlaceRow = Database['public']['Tables']['places']['Row'];

// Build a trip by hand, for the cases detection won't reach on its own: a
// trip inside your own home area, one whose reviews are too spread out to
// cluster, or one you simply want named your way.
//
// It gathers reviews you've ALREADY posted in the range — it doesn't create
// any. That's why there's no review picker: membership is "everything I
// posted between these dates", which stays true as you add more later.
export default function NewTripScreen() {
  const { session } = useAuth();
  const [place, setPlace] = useState<PlaceRow | null>(null);
  // Derived from the chosen destination, never entered by hand — the dates
  // are a fact about the reviews already posted there.
  const [range, setRange] = useState<{ startDate: string; endDate: string; visitCount: number } | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handleSelectPlace(selected: PlaceRow) {
    setPlace(selected);
    setIsPickerOpen(false);
    setError(null);
    setRange(null);
    if (!session) return;
    setIsResolving(true);
    try {
      const found = await getVisitRangeForPlace(session.user.id, selected.id);
      setRange(found);
      if (!found) setError(`No reviews in ${selected.name} yet — post one there first.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not work out those dates.');
    } finally {
      setIsResolving(false);
    }
  }

  async function handleCreate() {
    if (!session || !place || !range) return;
    setError(null);
    setIsCreating(true);
    try {
      await createManualTrip(session.user.id, range.startDate, range.endDate, place.id);
      // Straight to the trip itself — it's identified by its own anchor, so
      // it's viewable the moment it exists.
      router.replace({ pathname: '/trip', params: { user: session.user.id, start: range.startDate } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that trip.');
      setIsCreating(false);
    }
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAwareScroll contentContainerStyle={styles.scrollContent}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">New trip</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pick where you went and we'll work out the dates from your reviews there. You can drop
            any that don't belong once the trip exists.
          </ThemedText>

          <View style={styles.section}>
            <ThemedText type="smallBold">Where to?</ThemedText>

            <Pressable onPress={() => setIsPickerOpen(true)}>
              <ThemedView type="backgroundElement" style={styles.chip}>
                <ThemedText type="default" themeColor={place ? 'text' : 'textSecondary'}>
                  {place ? place.name : 'Pick a destination'}
                </ThemedText>
              </ThemedView>
            </Pressable>
            {isResolving && (
              <ThemedText type="small" themeColor="textSecondary">
                Finding your reviews there…
              </ThemedText>
            )}
            {range && (
              <ThemedText type="small" themeColor="sage">
                {range.visitCount} review{range.visitCount === 1 ? '' : 's'} · {range.startDate} to{' '}
                {range.endDate}
              </ThemedText>
            )}
          </View>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button
            label="Create trip"
            onPress={handleCreate}
            loading={isCreating}
            disabled={!range}
          />
        </KeyboardAwareScroll>

        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={() => setIsPickerOpen(false)}
          onSelect={(selected) => {
            handleSelectPlace(selected);
          }}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%' },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  section: { gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
