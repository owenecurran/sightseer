import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSection } from '@/components/comments-section';
import { PhotoGrid } from '@/components/photo-grid';
import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { PageLoader } from '@/components/ui/page-loader';
import { VisitMenu } from '@/components/visit-menu';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getFeedVisits, likeVisit, unlikeVisit, type FeedVisit, type TaggedPlace } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import { useTheme } from '@/hooks/use-theme';

function formatAuthorLine(authorName: string, taggedUserNames: string[]): string {
  if (taggedUserNames.length === 0) return authorName;
  if (taggedUserNames.length === 1) return `${authorName} with ${taggedUserNames[0]}`;
  return `${authorName} with ${taggedUserNames[0]} + ${taggedUserNames.length - 1} other${taggedUserNames.length > 2 ? 's' : ''}`;
}

// Blue for water, brown for trails, red for food & drink — everything else
// (and unclassified places) stays the default secondary text color.
const CATEGORY_COLORS: Record<string, string> = {
  water: '#1E88E5',
  trail: '#8B5E3C',
  food_drink: '#D32F2F',
};

function categoryColor(category: TaggedPlace['category'], defaultColor: string): string {
  return (category && CATEGORY_COLORS[category]) || defaultColor;
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function HomeScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const [visits, setVisits] = useState<FeedVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [copiedVisitId, setCopiedVisitId] = useState<string | null>(null);
  const scrollHandler = useHideOnScrollHandler();

  // Refetch on every focus, not just on mount — tab navigators (native: a
  // PagerView, all 5 tabs mounted at once; web: a real Stack) keep sibling
  // screens mounted, so a plain useEffect(...,[session]) would never notice
  // a follow made on the People tab without this. See use-tab-pager.ts for
  // why this isn't plain useFocusEffect anymore.
  useTabFocusEffect(
    0,
    useCallback(() => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      getFeedVisits(session.user.id)
        .then(async (feedVisits) => {
          setVisits(feedVisits);
          const photoIds = feedVisits.flatMap((v) => v.photoIds);
          const authorIds = [...new Set(feedVisits.map((v) => v.user_id))];
          const [photos, avatars] = await Promise.all([
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
            authorIds.length > 0 ? getAvatarViewUrls(authorIds) : Promise.resolve({}),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your feed.'))
        .finally(() => {
          setIsLoading(false);
          setHasLoadedOnce(true);
        });
    }, [session])
  );

  async function handleToggleLike(visit: FeedVisit) {
    if (!session) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(session.user.id, visit.id);
      } else {
        await likeVisit(session.user.id, visit.id);
      }
      setVisits((prev) =>
        prev.map((v) =>
          v.id === visit.id
            ? {
                ...v,
                isLikedByMe: !v.isLikedByMe,
                likeCount: v.likeCount + (v.isLikedByMe ? -1 : 1),
              }
            : v
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that like.');
    }
  }

  function handleVisitDeleted(visitId: string) {
    setVisits((prev) => prev.filter((v) => v.id !== visitId));
  }

  async function handleShareVisit(visit: FeedVisit) {
    const message = `${visit.authorName} rated ${visit.placeName} ${visit.rating.toFixed(1)}/10${
      visit.note ? `: "${visit.note}"` : ''
    } on Alien App.`;
    const result = await shareText(message);

    if (result === 'unsupported') {
      setError('Sharing is not supported in this browser.');
      return;
    }
    if (result === 'error') {
      setError('Could not copy that visit — please try again.');
      return;
    }
    if (result === 'copied') {
      setCopiedVisitId(visit.id);
      setTimeout(() => setCopiedVisitId((current) => (current === visit.id ? null : current)), 2000);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif">Feed</ThemedText>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {!isLoading && visits.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No visits yet from people you follow. Follow someone from the People tab, or check back
            once they log a visit.
          </ThemedText>
        )}

        <Animated.FlatList
          data={visits}
          keyExtractor={(item: FeedVisit) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: FeedVisit }) => (
            <ThemedView type="backgroundElement" style={styles.card}>
              <View style={styles.headerRow}>
                <Pressable
                  style={styles.headerAuthor}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.user_id } })}>
                  <Avatar uri={avatarUrls[item.user_id]} name={item.authorName} size={28} />
                  <ThemedText type="smallBold" style={styles.headerText}>
                    {formatAuthorLine(item.authorName, item.taggedUserNames)}
                  </ThemedText>
                </Pressable>
                <VisitMenu
                  visitId={item.id}
                  isOwner={session?.user.id === item.user_id}
                  onDeleted={() => handleVisitDeleted(item.id)}
                />
              </View>
              <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}>
                <ThemedText type="headline">{item.placeName}</ThemedText>
                {item.taggedPlaces.length > 0 && (
                  <ThemedText type="small">
                    {item.taggedPlaces.map((place, index) => (
                      <ThemedText
                        key={place.name}
                        type="small"
                        style={{ color: categoryColor(place.category, theme.textSecondary) }}>
                        {index > 0 ? ' · ' : ''}
                        {place.name}
                      </ThemedText>
                    ))}
                  </ThemedText>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  {item.rating.toFixed(1)} ★
                  {item.visitNumber > 1 ? ` · ${ordinal(item.visitNumber)} visit` : ''}
                  {item.note ? ` · ${item.note}` : ''}
                </ThemedText>
              </Pressable>
              <PhotoGrid urls={item.photoIds.map((id) => photoUrls[id]).filter((url) => url != null)} />

              <View style={styles.actionsRow}>
                <Pressable onPress={() => handleToggleLike(item)}>
                  <ThemedText type="small" themeColor={item.isLikedByMe ? 'text' : 'textSecondary'}>
                    {item.isLikedByMe ? '♥' : '♡'} {item.likeCount}
                  </ThemedText>
                </Pressable>
                <Pressable onPress={() => handleShareVisit(item)}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {copiedVisitId === item.id ? 'Copied ✓' : '↗ Share'}
                  </ThemedText>
                </Pressable>
              </View>

              <CommentsSection
                visitId={item.id}
                visitOwnerId={item.user_id}
                initialCount={item.commentCount}
              />

              <SaveToBoard visitId={item.id} />
            </ThemedView>
          )}
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  // paddingBottom belongs on the FlatList's own scrollable content, not
  // this non-scrolling wrapper — putting it here (as it used to be) only
  // shrinks the FlatList's viewport height, it doesn't add space the list
  // can actually scroll into, so the last card had no clearance from the
  // floating nav bar once you scrolled all the way down.
  list: {
    gap: Spacing.three,
    paddingBottom: BottomTabInset,
  },
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerAuthor: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
