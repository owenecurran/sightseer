import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsSection } from '@/components/comments-section';
import { PhotoGrid } from '@/components/photo-grid';
import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { VisitMenu } from '@/components/visit-menu';
import { BrandColors, BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getFeedItems, likeVisit, unlikeVisit, type FeedItem, type FeedVisit, type TaggedPlace } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getRecapCoverUrls, type FeedRecap } from '@/lib/travel-book-recaps';
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
  const [items, setItems] = useState<FeedItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [recapCoverUrls, setRecapCoverUrls] = useState<Record<string, string>>({});
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
      getFeedItems(session.user.id)
        .then(async (feedItems) => {
          setItems(feedItems);
          const feedVisits = feedItems.flatMap((item) => (item.type === 'visit' ? [item.visit] : []));
          const feedRecaps = feedItems.flatMap((item) => (item.type === 'recap' ? [item.recap] : []));
          const photoIds = feedVisits.flatMap((v) => v.photoIds);
          const authorIds = [...new Set([...feedVisits.map((v) => v.user_id), ...feedRecaps.map((r) => r.authorId)])];
          const [photos, avatars, recapCovers] = await Promise.all([
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
            authorIds.length > 0 ? getAvatarViewUrls(authorIds) : Promise.resolve({}),
            feedRecaps.length > 0 ? getRecapCoverUrls(feedRecaps.map((r) => r.id)) : Promise.resolve({}),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
          setRecapCoverUrls(recapCovers);
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
      setItems((prev) =>
        prev.map((item) =>
          item.type === 'visit' && item.visit.id === visit.id
            ? {
                ...item,
                visit: {
                  ...item.visit,
                  isLikedByMe: !item.visit.isLikedByMe,
                  likeCount: item.visit.likeCount + (item.visit.isLikedByMe ? -1 : 1),
                },
              }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that like.');
    }
  }

  function handleVisitDeleted(visitId: string) {
    setItems((prev) => prev.filter((item) => !(item.type === 'visit' && item.visit.id === visitId)));
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

        {!isLoading && items.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No visits yet from people you follow. Follow someone from the People tab, or check back
            once they log a visit.
          </ThemedText>
        )}

        <Animated.FlatList
          data={items}
          keyExtractor={(item: FeedItem) => (item.type === 'visit' ? `visit-${item.visit.id}` : `recap-${item.recap.id}`)}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          renderItem={({ item }: { item: FeedItem }) =>
            item.type === 'recap' ? (
              <RecapCard recap={item.recap} avatarUrl={avatarUrls[item.recap.authorId]} coverUrl={recapCoverUrls[item.recap.id]} />
            ) : (
              <VisitCard
                visit={item.visit}
                photoUrls={photoUrls}
                avatarUrl={avatarUrls[item.visit.user_id]}
                isOwner={session?.user.id === item.visit.user_id}
                isCopied={copiedVisitId === item.visit.id}
                onToggleLike={() => handleToggleLike(item.visit)}
                onShare={() => handleShareVisit(item.visit)}
                onDeleted={() => handleVisitDeleted(item.visit.id)}
                theme={theme}
              />
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

type VisitCardProps = {
  visit: FeedVisit;
  photoUrls: Record<string, string>;
  avatarUrl?: string;
  isOwner: boolean;
  isCopied: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onDeleted: () => void;
  theme: ReturnType<typeof useTheme>;
};

function VisitCard({ visit, photoUrls, avatarUrl, isOwner, isCopied, onToggleLike, onShare, onDeleted, theme }: VisitCardProps) {
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  // Instagram-style double-tap: like-only, never unlikes an already-liked
  // post (so a stray extra tap can't accidentally undo a like) — the heart
  // still bursts every time as a tap acknowledgement, even when it's a
  // visual-only no-op on the like state itself.
  function handleDoubleTap() {
    if (!visit.isLikedByMe) onToggleLike();
    heartScale.value = 0.6;
    heartOpacity.value = 1;
    heartScale.value = withSequence(withTiming(1.15, { duration: 180 }), withTiming(1, { duration: 120 }));
    heartOpacity.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 400 }));
  }

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      'worklet';
      runOnJS(handleDoubleTap)();
    });

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable
          style={styles.headerAuthor}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: visit.user_id } })}>
          <Avatar uri={avatarUrl} name={visit.authorName} size={28} />
          <ThemedText type="smallBold" style={styles.headerText}>
            {formatAuthorLine(visit.authorName, visit.taggedUserNames)}
          </ThemedText>
        </Pressable>
        <VisitMenu visitId={visit.id} isOwner={isOwner} onDeleted={onDeleted} />
      </View>
      <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: visit.id } })}>
        <ThemedText type="headline">{visit.placeName}</ThemedText>
        {visit.taggedPlaces.length > 0 && (
          <ThemedText type="small">
            {visit.taggedPlaces.map((place, index) => (
              <ThemedText key={place.name} type="small" style={{ color: categoryColor(place.category, theme.textSecondary) }}>
                {index > 0 ? ' · ' : ''}
                {place.name}
              </ThemedText>
            ))}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {visit.rating.toFixed(1)} ★
          {visit.visitNumber > 1 ? ` · ${ordinal(visit.visitNumber)} visit` : ''}
          {visit.note ? ` · ${visit.note}` : ''}
        </ThemedText>
      </Pressable>

      <GestureDetector gesture={doubleTap}>
        <View>
          <PhotoGrid urls={visit.photoIds.map((id) => photoUrls[id]).filter((url) => url != null)} />
          <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
            <Ionicons name="heart" size={72} color={BrandColors.cream} />
          </Animated.View>
        </View>
      </GestureDetector>

      <View style={styles.actionsRow}>
        <Pressable onPress={onToggleLike} hitSlop={8} style={styles.actionButton}>
          <Ionicons
            name={visit.isLikedByMe ? 'heart' : 'heart-outline'}
            size={24}
            color={visit.isLikedByMe ? theme.text : theme.textSecondary}
          />
          <ThemedText type="small" themeColor={visit.isLikedByMe ? 'text' : 'textSecondary'}>
            {visit.likeCount}
          </ThemedText>
        </Pressable>
        <Pressable onPress={onShare} hitSlop={8} style={styles.actionButton}>
          <Ionicons name="arrow-redo-outline" size={24} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {isCopied ? 'Copied ✓' : 'Share'}
          </ThemedText>
        </Pressable>
      </View>

      <CommentsSection visitId={visit.id} visitOwnerId={visit.user_id} initialCount={visit.commentCount} />

      <SaveToBoard visitId={visit.id} />
    </ThemedView>
  );
}

function RecapCard({ recap, avatarUrl, coverUrl }: { recap: FeedRecap; avatarUrl?: string; coverUrl?: string }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: recap.travelBookId } })}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerAuthor}>
            <Avatar uri={avatarUrl} name={recap.authorName} size={28} />
            <ThemedText type="smallBold" style={styles.headerText}>
              {recap.authorName} shared a trip recap
            </ThemedText>
          </View>
        </View>
        {coverUrl && <LoadableImage source={{ uri: coverUrl }} style={styles.recapCover} />}
        <ThemedText type="headline">{recap.title}</ThemedText>
        {recap.rating != null && (
          <ThemedText type="small" themeColor="textSecondary">
            {recap.rating.toFixed(1)} ★
          </ThemedText>
        )}
        {recap.body && (
          <ThemedText type="small" numberOfLines={3}>
            {recap.body}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
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
    gap: Spacing.four,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  heartBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapCover: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
});
