import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapSearch } from '@/components/map-search';
import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { CircledTabs } from '@/components/ui/circled-tabs';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, BrandFonts, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
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
import { userErrorMessage } from '@/lib/user-error';

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
  if (status === 'accepted') return 'following';
  if (status === 'pending') return 'asked';
  return '+ follow';
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

// One line, shrunk to fit. Set in the serif the screen titles use, in its
// own case: these were heavy capitals, and a list of names all shouting at
// the same size was most of what made the page feel like a stack of blocks.
function ResultTitle({ children }: { children: ReactNode }) {
  return (
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.resultTitle}>
      {children}
    </Text>
  );
}

// One result, written on the page like an entry in an address book: no box
// round it, only a faint rule under it. A column of identical rounded cards
// read as a database's rows.
function ResultRow({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.resultRow, pressed && styles.rowPressed]}>
      {children}
    </Pressable>
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
      setError(null);
      setIsSearching(false);
      return;
    }

    // Set once the query moves on. A slow answer to "ab" used to land after
    // the answer to "abc" and replace it, leaving results for what was no
    // longer in the field.
    let stale = false;
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        const result = await searchAll(query, session.user.id);
        if (stale) return;
        setBoards(result.boards);
        setTravelBooks(result.travelBooks);
        setUsers(result.users);

        // Pictures are extras. Their failing used to fail the search, and
        // put "Search failed." over results that had already arrived.
        try {
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
          if (stale) return;
          setCoverUrls(
            Object.fromEntries(
              Object.entries(photoIdByEntity)
                .map(([entityId, photoId]) => [entityId, resolvedCovers[photoId]])
                .filter(([, url]) => url != null)
            )
          );
        } catch {
          // The rows show without their pictures.
        }
      } catch (err) {
        if (stale) return;
        // The last query's results would otherwise stay, under a field
        // that now says something else.
        setBoards([]);
        setTravelBooks([]);
        setUsers([]);
        setError(userErrorMessage(err, 'Could not search just now. Try again.'));
      } finally {
        if (!stale) setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      stale = true;
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
      setError(userErrorMessage(err, 'Could not update that follow.'));
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
      <ResultRow key={user.id} onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}>
        <Avatar uri={avatarUrls[user.id]} name={user.name ?? user.handle} size={44} />
        <View style={styles.resultInfo}>
          <ResultTitle>{user.name ?? user.handle ?? 'Unnamed'}</ResultTitle>
          {user.handle && <Text style={styles.resultHandle}>@{user.handle}</Text>}
          {mutualLine && <Text style={styles.resultNote}>{mutualLine}</Text>}
        </View>
        <Pressable onPress={() => handleFollowToggle(user)} hitSlop={10}>
          <Text style={[styles.followAction, user.followStatus !== null && styles.followDone]}>
            {followLabel(user.followStatus)}
          </Text>
        </Pressable>
      </ResultRow>
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

          <CircledTabs
            items={RESULT_FILTERS}
            active={resultFilter === 'all' ? null : resultFilter}
            onChange={(key) => setResultFilter((current) => (current === key ? 'all' : key))}
          />

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}

          {!isPlaces ? (
            <>
              <TextField placeholder="Search people, boards, or travel books" value={query} onChangeText={setQuery} />

              {/* Not after a failed search, which has found nothing only
                  because it did not run. */}
              {!isSearching && !error && hasQuery && !hasAnyResults && (
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
                    <ResultRow
                      key={board.id}
                      onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
                      {coverUrls[board.id] && <Image source={{ uri: coverUrls[board.id] }} style={styles.resultThumbnail} />}
                      <View style={styles.resultInfo}>
                        <ResultTitle>{board.name}</ResultTitle>
                        <Text style={styles.resultHandle}>
                          by {board.creatorName}
                          {board.is_private ? ' · private' : ''}
                        </Text>
                      </View>
                    </ResultRow>
                  ))}

                {showTravelBooks &&
                  travelBooks.map((book) => (
                    <ResultRow
                      key={book.id}
                      onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: book.id } })}>
                      {coverUrls[book.id] && <Image source={{ uri: coverUrls[book.id] }} style={styles.resultThumbnail} />}
                      <View style={styles.resultInfo}>
                        <ResultTitle>{book.title}</ResultTitle>
                        <Text style={styles.resultHandle}>
                          by {book.creatorName}
                          {book.is_private ? ' · private' : ''}
                        </Text>
                      </View>
                    </ResultRow>
                  ))}

                {showPeople && users.map(renderUser)}
              </View>
            </>
          ) : (
            <Pressable onPress={() => setIsPickerOpen(true)}>
              <PaperPanel seed="explore-map" accentIndex={3} style={styles.locationsCard}>
                <ThemedText type="headlineWrapped">Search the map</ThemedText>
                <ThemedText type="caption">
                  Reviewed places near you, by rating, popularity and tags.
                </ThemedText>
              </PaperPanel>
            </Pressable>
          )}
        </Animated.ScrollView>
      </SafeAreaView>

      {session && (
        <MapSearch visible={isPickerOpen} onClose={() => setIsPickerOpen(false)} viewerId={session.user.id} />
      )}
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
  sectionLabel: {
    marginBottom: Spacing.one,
  },
  results: {
    gap: 0,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(234, 231, 207, 0.16)',
  },
  rowPressed: {
    opacity: 0.6,
  },
  resultHandle: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 13,
    color: 'rgba(234, 231, 207, 0.55)',
  },
  // Who you both know, noted beside the entry in pencil.
  resultNote: {
    fontFamily: BrandFonts.hand,
    fontSize: 16,
    color: 'rgba(160, 189, 145, 0.85)',
    marginTop: 2,
  },
  followAction: {
    fontFamily: BrandFonts.hand,
    fontSize: 19,
    color: BrandColors.sage,
  },
  followDone: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 13,
    color: 'rgba(234, 231, 207, 0.5)',
  },
  resultInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  resultTitle: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 26,
    color: BrandColors.cream,
  },
  // A print with its white border, like the review form's photos.
  resultThumbnail: {
    width: 46,
    height: 46,
    borderRadius: 1,
    borderWidth: 3,
    borderColor: '#f3eedb',
  },
  locationsCard: {
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
