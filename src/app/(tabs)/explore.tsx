import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getLatestReviewPhotoIds } from '@/lib/boards';
import { followUser, unfollowOrCancelRequest, type MutualFollower } from '@/lib/follows';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { searchAll, type SearchBoardResult, type SearchTravelBookResult, type SearchUserResult } from '@/lib/search';

const DEBOUNCE_MS = 300;

type SearchMode = 'people_boards' | 'locations';
type ResultFilter = 'all' | 'people' | 'boards' | 'travel_books';

const RESULT_FILTERS: { key: ResultFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'people', label: 'People' },
  { key: 'boards', label: 'Boards' },
  { key: 'travel_books', label: 'Travel books' },
];

function followLabel(status: SearchUserResult['followStatus']): string {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return 'Follow';
}

// Leads with the raw count (per direct feedback: "shows the number of
// mutual followers as well", not just names) before the same "Followed by
// X (+N others)" framing this already had.
function mutualsLabel(mutuals: MutualFollower[]): string | null {
  if (mutuals.length === 0) return null;
  const firstName = mutuals[0].name ?? mutuals[0].handle ?? 'Someone';
  const countLabel = `${mutuals.length} mutual follower${mutuals.length === 1 ? '' : 's'}`;
  if (mutuals.length === 1) return `${countLabel} · ${firstName}`;
  return `${countLabel} · ${firstName} + ${mutuals.length - 1} other${mutuals.length > 2 ? 's' : ''}`;
}

export default function SearchScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('people_boards');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [boards, setBoards] = useState<SearchBoardResult[]>([]);
  const [travelBooks, setTravelBooks] = useState<SearchTravelBookResult[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
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
      setTravelBooks([]);
      setUsers([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchAll(query, session.user.id);
        setBoards(result.boards);
        setTravelBooks(result.travelBooks);
        setUsers(result.users);

        const userIds = result.users.map((u) => u.id);
        setAvatarUrls(userIds.length > 0 ? await getAvatarViewUrls(userIds) : {});

        // Cover thumbnails: explicit cover_photo_id wins; boards without one
        // fall back to the most-recently-added item's photo (same rule
        // boards.tsx uses). Travel books have no such fallback.
        const boardsWithoutCover = result.boards.filter((b) => !b.cover_photo_id);
        const latestPhotoIdByBoard = await getLatestReviewPhotoIds(boardsWithoutCover.map((b) => b.id));
        const photoIdByEntity: Record<string, string> = { ...latestPhotoIdByBoard };
        for (const b of result.boards) if (b.cover_photo_id) photoIdByEntity[b.id] = b.cover_photo_id;
        for (const t of result.travelBooks) if (t.cover_photo_id) photoIdByEntity[t.id] = t.cover_photo_id;
        const coverPhotoIds = Object.values(photoIdByEntity);
        const resolvedCovers = coverPhotoIds.length > 0 ? await getPhotoViewUrls(coverPhotoIds) : {};
        setCoverUrls(
          Object.fromEntries(
            Object.entries(photoIdByEntity)
              .map(([entityId, photoId]) => [entityId, resolvedCovers[photoId]])
              .filter(([, url]) => url != null)
          )
        );
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

  const showPeople = resultFilter === 'all' || resultFilter === 'people';
  const showBoards = resultFilter === 'all' || resultFilter === 'boards';
  const showTravelBooks = resultFilter === 'all' || resultFilter === 'travel_books';
  const hasAnyResults =
    (showBoards && boards.length > 0) || (showTravelBooks && travelBooks.length > 0) || (showPeople && users.length > 0);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
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
              <TextField placeholder="Search people, boards, or travel books" value={query} onChangeText={setQuery} />

              <View style={styles.filterRow}>
                {RESULT_FILTERS.map((f) => (
                  <Pressable key={f.key} onPress={() => setResultFilter(f.key)}>
                    <ThemedView type={resultFilter === f.key ? 'backgroundSelected' : 'backgroundElement'} style={styles.filterChip}>
                      <ThemedText type="small" themeColor={resultFilter === f.key ? 'text' : 'textSecondary'}>
                        {f.label}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                ))}
              </View>

              {!isSearching && query.trim().length > 0 && !hasAnyResults && (
                <ThemedText type="small" themeColor="textSecondary">
                  No results.
                </ThemedText>
              )}

              <View style={styles.results}>
                {showBoards &&
                  boards.map((board) => (
                    <Pressable
                      key={board.id}
                      onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
                      <ThemedView type="backgroundElement" style={styles.resultRow}>
                        {coverUrls[board.id] && <Image source={{ uri: coverUrls[board.id] }} style={styles.resultThumbnail} />}
                        <View style={styles.resultInfo}>
                          <ThemedText type="headline">{board.name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            by {board.creatorName}
                            {board.is_private ? ' · Private' : ''}
                          </ThemedText>
                        </View>
                      </ThemedView>
                    </Pressable>
                  ))}

                {showTravelBooks &&
                  travelBooks.map((book) => (
                    <Pressable
                      key={book.id}
                      onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: book.id } })}>
                      <ThemedView type="backgroundElement" style={styles.resultRow}>
                        {coverUrls[book.id] && <Image source={{ uri: coverUrls[book.id] }} style={styles.resultThumbnail} />}
                        <View style={styles.resultInfo}>
                          <ThemedText type="headline">{book.title}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            by {book.creatorName}
                            {book.is_private ? ' · Private' : ''}
                          </ThemedText>
                        </View>
                      </ThemedView>
                    </Pressable>
                  ))}

                {showPeople &&
                  users.map((user) => {
                    const mutualLine = mutualsLabel(user.mutuals);
                    return (
                      <Pressable
                        key={user.id}
                        onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}>
                        <ThemedView type="backgroundElement" style={styles.resultRow}>
                          <Avatar uri={avatarUrls[user.id]} name={user.name ?? user.handle} size={40} />
                          <View style={styles.resultInfo}>
                            <ThemedText type="headline">{user.name ?? user.handle ?? 'Unnamed'}</ThemedText>
                            {user.handle && (
                              <ThemedText type="small" themeColor="textSecondary">
                                @{user.handle}
                              </ThemedText>
                            )}
                            {mutualLine && (
                              <ThemedText type="small" themeColor="textSecondary">
                                {mutualLine}
                              </ThemedText>
                            )}
                          </View>
                          <Pressable onPress={() => handleFollowToggle(user)} hitSlop={8}>
                            <ThemedText type="smallBold">{followLabel(user.followStatus)}</ThemedText>
                          </Pressable>
                        </ThemedView>
                      </Pressable>
                    );
                  })}
              </View>
            </>
          ) : (
            <Pressable onPress={() => setIsPickerOpen(true)}>
              <ThemedView type="backgroundElement" style={styles.locationsCard}>
                <ThemedText type="headline">Search the map</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Browse reviewed places, or search for one to view its page.
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </Animated.ScrollView>
      </SafeAreaView>

      <LocationSearchModal mode="browse" visible={isPickerOpen} onCancel={() => setIsPickerOpen(false)} />
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
    gap: Spacing.three,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  resultInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  resultThumbnail: {
    width: 40,
    height: 40,
    borderRadius: Spacing.one,
  },
  locationsCard: {
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
