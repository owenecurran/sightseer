import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { followUser, unfollowOrCancelRequest } from '@/lib/follows';
import { searchPlacesAndUsers, type SearchUserResult } from '@/lib/search';

const DEBOUNCE_MS = 300;

type PlaceRow = Database['public']['Tables']['places']['Row'];
type FilterMode = 'all' | 'places' | 'people';

function followLabel(status: SearchUserResult['followStatus']): string {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return 'Follow';
}

export default function SearchScreen() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!session) return;

    if (!query.trim()) {
      setPlaces([]);
      setUsers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchPlacesAndUsers(query, session.user.id);
        setPlaces(result.places);
        setUsers(result.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, session]);

  async function handleFollowToggle(user: SearchUserResult) {
    if (!session) return;
    setError(null);
    try {
      if (user.followStatus === null) {
        const status = await followUser({
          followerId: session.user.id,
          followeeId: user.id,
          followeeIsPrivate: user.is_private,
        });
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: status } : u)));
      } else {
        await unfollowOrCancelRequest(session.user.id, user.id);
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: null } : u)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that follow.');
    }
  }

  const showPlaces = filter !== 'people';
  const showUsers = filter !== 'places';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Search</ThemedText>

        <TextField placeholder="Search locations or people" value={query} onChangeText={setQuery} />

        <View style={styles.filterRow}>
          {(['all', 'places', 'people'] as FilterMode[]).map((mode) => (
            <Pressable key={mode} onPress={() => setFilter(mode)}>
              <ThemedView
                type={filter === mode ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.filterChip}>
                <ThemedText type="small" themeColor={filter === mode ? 'text' : 'textSecondary'}>
                  {mode === 'all' ? 'All' : mode === 'places' ? 'Places' : 'People'}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </View>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {!isSearching && query.trim().length > 0 && places.length === 0 && users.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No results.
          </ThemedText>
        )}

        <View style={styles.results}>
          {showPlaces &&
            places.map((place) => (
              <Pressable
                key={place.id}
                onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}>
                <ThemedView type="backgroundElement" style={styles.resultRow}>
                  <ThemedText type="default">{place.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {place.level}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}

          {showUsers &&
            users.map((user) => (
              <ThemedView key={user.id} type="backgroundElement" style={styles.resultRow}>
                <ThemedText type="default">{user.name ?? user.handle ?? 'Unnamed'}</ThemedText>
                <Pressable onPress={() => handleFollowToggle(user)}>
                  <ThemedText type="smallBold">{followLabel(user.followStatus)}</ThemedText>
                </Pressable>
              </ThemedView>
            ))}
        </View>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  filterChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  results: {
    gap: Spacing.two,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
