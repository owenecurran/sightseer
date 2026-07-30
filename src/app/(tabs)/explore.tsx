import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { followUser, unfollowOrCancelRequest } from '@/lib/follows';
import { searchPeopleAndBoards, type SearchUserResult } from '@/lib/search';

const DEBOUNCE_MS = 300;

type BoardRow = Database['public']['Tables']['boards']['Row'];
type PlaceRow = Database['public']['Tables']['places']['Row'];
type SearchMode = 'people_boards' | 'locations';

function followLabel(status: SearchUserResult['followStatus']): string {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return 'Follow';
}

export default function SearchScreen() {
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('people_boards');
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!session || mode !== 'people_boards') return;

    if (!query.trim()) {
      setBoards([]);
      setUsers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchPeopleAndBoards(query, session.user.id);
        setBoards(result.boards);
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
  }, [query, session, mode]);

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

  function handleLocationSelected(place: PlaceRow) {
    setIsPickerOpen(false);
    router.push({ pathname: '/place/[id]', params: { id: place.id } });
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <ThemedText type="displaySerif">Search</ThemedText>

          <View style={styles.filterRow}>
            {(['people_boards', 'locations'] as SearchMode[]).map((m) => (
              <Pressable key={m} onPress={() => setMode(m)}>
                <ThemedView type={mode === m ? 'backgroundSelected' : 'backgroundElement'} style={styles.filterChip}>
                  <ThemedText type="small" themeColor={mode === m ? 'text' : 'textSecondary'}>
                    {m === 'people_boards' ? 'People & Boards' : 'Locations'}
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

          {mode === 'people_boards' ? (
            <>
              <TextField placeholder="Search people or boards" value={query} onChangeText={setQuery} />

              {!isSearching && query.trim().length > 0 && boards.length === 0 && users.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No results.
                </ThemedText>
              )}

              <View style={styles.results}>
                {boards.map((board) => (
                  <Pressable
                    key={board.id}
                    onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
                    <ThemedView type="backgroundElement" style={styles.resultRow}>
                      <ThemedText type="headline">{board.name}</ThemedText>
                      {board.is_private && (
                        <ThemedText type="sectionLabel" themeColor="textSecondary">
                          Private
                        </ThemedText>
                      )}
                    </ThemedView>
                  </Pressable>
                ))}

                {users.map((user) => (
                  <ThemedView key={user.id} type="backgroundElement" style={styles.resultRow}>
                    <ThemedText type="headline">{user.name ?? user.handle ?? 'Unnamed'}</ThemedText>
                    <Pressable onPress={() => handleFollowToggle(user)}>
                      <ThemedText type="smallBold">{followLabel(user.followStatus)}</ThemedText>
                    </Pressable>
                  </ThemedView>
                ))}
              </View>
            </>
          ) : (
            <Pressable onPress={() => setIsPickerOpen(true)}>
              <ThemedView type="backgroundElement" style={styles.locationsCard}>
                <ThemedText type="headline">Search the map</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Find a place to view its page.
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </Animated.ScrollView>
      </SafeAreaView>

      <LocationSearchModal
        visible={isPickerOpen}
        onCancel={() => setIsPickerOpen(false)}
        onSelect={handleLocationSelected}
      />
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
  scrollContent: {
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
  locationsCard: {
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
