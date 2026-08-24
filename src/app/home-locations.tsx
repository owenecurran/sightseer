import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import {
  addHomeLocation,
  listHomeLocations,
  MAX_HOME_LOCATIONS,
  removeHomeLocation,
  type HomeLocation,
} from '@/lib/home-locations';

type PlaceRow = Database['public']['Tables']['places']['Row'];

// Where the user actually lives — the basis for deciding which of their
// reviews count as being "on a trip" (see get_trips_for_users). Kept on its
// own screen rather than inside settings.tsx because picking one opens the
// full-screen map picker, which doesn't nest sensibly inside that screen's
// scrolling form.
export default function HomeLocationsScreen() {
  const { session } = useAuth();
  const [locations, setLocations] = useState<HomeLocation[]>([]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      listHomeLocations(session.user.id)
        .then(setLocations)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your home locations.'))
        .finally(() => setHasLoadedOnce(true));
    }, [session])
  );

  async function handleSelectPlace(place: PlaceRow) {
    if (!session) return;
    setIsPickerOpen(false);
    setError(null);
    try {
      await addHomeLocation(session.user.id, place);
      setLocations(await listHomeLocations(session.user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that home location.');
    }
  }

  async function handleRemove(id: string) {
    setError(null);
    setBusyId(id);
    try {
      await removeHomeLocation(id);
      setLocations((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that home location.');
    } finally {
      setBusyId(null);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const isAtLimit = locations.length >= MAX_HOME_LOCATIONS;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <BackLink seed="home-locations" />

          <ThemedText type="displaySerif">Home locations</ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Reviews you post around these places count as everyday life. Anything further afield gets
            grouped into a trip in the feed. Add up to {MAX_HOME_LOCATIONS} — change them whenever you
            like.
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {locations.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No home locations yet. Until you add one, none of your reviews are grouped into trips.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {locations.map((location) => (
                <ThemedView key={location.id} type="backgroundElement" style={styles.row}>
                  <View style={styles.rowText}>
                    <ThemedText type="headline">{location.name}</ThemedText>
                    {location.parentName && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {location.parentName}
                      </ThemedText>
                    )}
                  </View>
                  <Pressable onPress={() => handleRemove(location.id)} disabled={busyId === location.id} hitSlop={8}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {busyId === location.id ? 'Removing…' : 'Remove'}
                    </ThemedText>
                  </Pressable>
                </ThemedView>
              ))}
            </View>
          )}

          <Button
            label={isAtLimit ? `${MAX_HOME_LOCATIONS} of ${MAX_HOME_LOCATIONS} added` : 'Add a home location'}
            variant="secondary"
            disabled={isAtLimit}
            onPress={() => setIsPickerOpen(true)}
          />
        </View>

        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={() => setIsPickerOpen(false)}
          onSelect={handleSelectPlace}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
});
