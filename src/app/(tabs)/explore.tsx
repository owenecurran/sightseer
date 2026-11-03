import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
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
import {
  searchAll,
  suggestPeople,
  type SearchBoardResult,
  type SearchTravelBookResult,
  type SearchUserResult,
} from '@/lib/search';

const DEBOUNCE_MS = 300;

// One row of chips where there were two. "People & Boards | Locations" sat
// above the field and "All | People | Boards | Travel books" below it, so
// narrowing a search meant reading two rows of nearly the same words to work
// out which one did what. Places is simply the last filter now; picking it
// swaps the field for the map, which is all the old mode switch did.
//
// No "All" chip: nothing selected IS all, and tapping the selected chip
// again goes back to it. That is what lets the row fit across a phone. It
// cannot scroll sideways instead -- the tabs are a horizontal pager, and a
// sideways swipe on the chips turns the page to Create.
type ResultFilter = 'all' | 'people' | 'boards' | 'travel_books' | 'places';

const RESULT_FILTERS: { key: Exclude<ResultFilter, 'all'>; label: string }[] = [
  { key: 'people', label: 'People' },
  { key: 'boards', label: 'Boards' },
  { key: 'travel_books', label: 'Travel books' },
  { key: 'places', label: 'Places' },
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

// One line, shrunk to fit. These were the 34pt wrapping headline, so a
// three-word name stacked three lines high and a list of people ran to a
// screen for every three of them.
function ResultTitle({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="headline" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.resultTitle}>
      {children}
    </ThemedText>
  );
}

export default function SearchScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [query, setQuery] = useState('');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const isPlaces = resultFilter === 'places';
  const [boards, setBoards] = useState<SearchBoardResult[]>([]);
  const [travelBooks, setTravelBooks] = useState<SearchTravelBookResult[]>([]);
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchUserResult[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // What fills the screen before anything is typed. It used to be nothing:
  // a title, two rows of chips and an empty field, on the tab people open to
  // find someone. Loaded once; a failure here just leaves the space empty,
  // because nobody asked for these and an error about them would be noise.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const people = await suggestPeople(session.user.id);
        if (cancelled) return;
        setSuggestions(people);
        const ids = people.map((u) => u.id);
        if (ids.length > 0) {
          const urls = await getAvatarViewUrls(ids);
          if (!cancelled) setAvatarUrls((prev) => ({ ...prev, ...urls }));
        }
      } catch {
        // See above.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!session || isPlaces) return;

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
        // Merged rather than replaced, so the suggested people keep their
        // avatars when the field is cleared again.
        if (userIds.length > 0) {
          const urls = await getAvatarViewUrls(userIds);
          setAvatarUrls((prev) => ({ ...prev, ...urls }));
        }

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
  }, [query, session, isPlaces]);

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
        const update = (list: SearchUserResult[]) =>
          list.map((u) => (u.id === user.id ? { ...u, followStatus: status } : u));
        setUsers(update);
        setSuggestions(update);
      } else {
        await unfollowOrCancelRequest(session.user.id, user.id);
        const update = (list: SearchUserResult[]) =>
          list.map((u) => (u.id === user.id ? { ...u, followStatus: null } : u));
        setUsers(update);
        setSuggestions(update);
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
  const hasQuery = query.trim().length > 0;

  function renderUser(user: SearchUserResult) {
    const mutualLine = mutualsLabel(user.mutuals);
    return (
      <Pressable key={user.id} onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}>
        <PaperPanel seed={`result-user`} style={styles.resultRow}>
          <Avatar uri={avatarUrls[user.id]} name={user.name ?? user.handle} size={40} />
          <View style={styles.resultInfo}>
            <ResultTitle>{user.name ?? user.handle ?? 'Unnamed'}</ResultTitle>
            {user.handle && (
              <ThemedText type="small" themeColor="textMeta">
                @{user.handle}
              </ThemedText>
            )}
            {mutualLine && <ThemedText type="caption">{mutualLine}</ThemedText>}
          </View>
          <Pressable onPress={() => handleFollowToggle(user)} hitSlop={8}>
            <ThemedText type="action" themeColor={user.followStatus === null ? 'sage' : 'text'}>
              {followLabel(user.followStatus)}
            </ThemedText>
          </Pressable>
        </PaperPanel>
      </Pressable>
    );
  }

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
            {RESULT_FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setResultFilter((current) => (current === f.key ? 'all' : f.key))}>
                <ThemedView
                  type={resultFilter === f.key ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.filterChip}>
                  <ThemedText type="small" themeColor={resultFilter === f.key ? 'text' : 'textSecondary'}>
                    {f.label}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}

          {!isPlaces ? (
            <>
              <TextField placeholder="Search people, boards, or travel books" value={query} onChangeText={setQuery} />

              {!isSearching && hasQuery && !hasAnyResults && (
                <ThemedText type="caption">
                  Nothing matches that. Try part of a name or a handle.
                </ThemedText>
              )}

              {!hasQuery && showPeople && suggestions.length > 0 && (
                <View style={styles.results}>
                  <ThemedText type="sectionLabel" style={styles.sectionLabel}>
                    People you may know
                  </ThemedText>
                  {suggestions.map(renderUser)}
                </View>
              )}

              {!hasQuery && !showPeople && (
                <ThemedText type="caption">
                  {resultFilter === 'boards'
                    ? 'Search boards by their name or description.'
                    : 'Search travel books by their title or description.'}
                </ThemedText>
              )}

              <View style={styles.results}>
                {showBoards &&
                  boards.map((board) => (
                    <Pressable
                      key={board.id}
                      onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
                      <PaperPanel seed={`result-board`} style={styles.resultRow}>
                        {coverUrls[board.id] && <Image source={{ uri: coverUrls[board.id] }} style={styles.resultThumbnail} />}
                        <View style={styles.resultInfo}>
                          <ResultTitle>{board.name}</ResultTitle>
                          <ThemedText type="meta">
                            by {board.creatorName}
                            {board.is_private ? ' · Private' : ''}
                          </ThemedText>
                        </View>
                      </PaperPanel>
                    </Pressable>
                  ))}

                {showTravelBooks &&
                  travelBooks.map((book) => (
                    <Pressable
                      key={book.id}
                      onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: book.id } })}>
                      <PaperPanel seed={`result-book`} style={styles.resultRow}>
                        {coverUrls[book.id] && <Image source={{ uri: coverUrls[book.id] }} style={styles.resultThumbnail} />}
                        <View style={styles.resultInfo}>
                          <ResultTitle>{book.title}</ResultTitle>
                          <ThemedText type="meta">
                            by {book.creatorName}
                            {book.is_private ? ' · Private' : ''}
                          </ThemedText>
                        </View>
                      </PaperPanel>
                    </Pressable>
                  ))}

                {showPeople && users.map(renderUser)}
              </View>
            </>
          ) : (
            <Pressable onPress={() => setIsPickerOpen(true)}>
              <PaperPanel seed="explore-map" accentIndex={3} style={styles.locationsCard}>
                <ThemedText type="headlineWrapped">Search the map</ThemedText>
                <ThemedText type="caption">
                  Browse reviewed places, or search for one to view its page.
                </ThemedText>
              </PaperPanel>
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
  sectionLabel: {
    marginBottom: Spacing.one,
  },
  // Twelve a side rather than sixteen: with that, the four chips fit across
  // a 411dp phone. Narrower screens wrap the last one rather than clip it.
  filterChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: 12,
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
  resultTitle: {
    fontSize: 24,
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
