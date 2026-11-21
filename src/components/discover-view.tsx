import { router } from 'expo-router';
import { Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';

import { PLACE_TAG_EDGE, PLACE_TAG_GAP, PLACE_TAG_HEADROOM, PlaceTag, PlaceTagRail } from '@/components/place-tag';
import { DealIn } from '@/components/ui/deal-in';
import { ScrollStageProvider, useScrollStage } from '@/components/ui/scroll-stage';
import { JourneyLine } from '@/components/ui/journey-line';
import { LoadableImage } from '@/components/ui/loadable-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VisitCard } from '@/components/visit-card';
import { BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { listPublishedArticles, type ArticleListItem } from '@/lib/articles';
import { listFeaturedBoards } from '@/lib/boards';
import { getBoardThumbnailUrls } from '@/lib/collection-thumbnails';
import type { Database } from '@/lib/database.types';
import {
  getDiscoverPlaces,
  getDiscoverReviews,
  getPlacePhotoUrls,
  resolveViewerLocation,
  type DiscoverPlace,
} from '@/lib/discover';
import { likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { funDistanceLabel } from '@/lib/fun-distance';
import { stopOf } from '@/lib/journey';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { resolveStateCountries } from '@/lib/places-cache';
import { shareText } from '@/lib/share';

type BoardRow = Database['public']['Tables']['boards']['Row'];

// Discover: somewhere to go, and something to read.
//
// It used to be three stacked lists of rows — articles, featured boards, and
// a "Top locations" leaderboard — of which only the last ever drew anything,
// because the database holds no published articles and no featured board. So
// the whole tab was five rows and then empty screen, in the flat row-and-
// hairline style the rest of the app has since left behind for printed cards.
//
// Worse, the one live list was wrong in a way you could see: it ordered by
// raw review count while leading each row with the RATING stamp, so a 5.0
// with two reviews sat above a 10.0 with one and it read as broken. Both
// rankings now live in SQL and are scored on what the card actually shows —
// see the 20260918120000_discover migration.
//
// Articles and featured boards are kept exactly as they were, deliberately:
// they cost one query each and light up the day there is something to put in
// them, without anyone having to remember to rebuild the section.

// Enough to fill a horizontal strip twice over without paying for a long tail
// nobody scrolls to.
const PLACE_COUNT = 10;
// Postcards are expensive — each is two mounted faces and a Skia stamp — and
// this is the second section down. Five is a look at what is out there, not a
// second feed.
const REVIEW_COUNT = 5;
const SHELF_COUNT = 5;

// A movement reading that lapses to nothing shortly after it is taken.
function momentary(value: number) {
  'worklet';
  return withSequence(withTiming(value, { duration: 0 }), withDelay(90, withTiming(0, { duration: 0 })));
}

// What the Home tab can ask of Discover when it is tapped while already
// showing it: go back to the top and fetch the shelves again.
export type DiscoverViewHandle = { refresh: () => void };

export function DiscoverView({ ref }: { ref?: Ref<DiscoverViewHandle> }) {
  const bottomInset = useBottomTabInset();
  // Where each review and route on the page is on screen, for the reviews
  // dealt in as they arrive and the routes drawn between them.
  const scrollRef = useRef<ScrollView>(null);
  const { stage, scrollProps } = useScrollStage(scrollRef);
  const scrollHandler = useHideOnScrollHandler(stage.scrollY);
  const { session } = useAuth();

  // How the places strip and the page are moving, in points a frame, for the
  // hung tags to swing and bob with. Each reading falls back to nothing a
  // moment after the last, so a scroll that stops dead does not leave the
  // tags leaning into a movement that has ended.
  //
  // Only while the strip is on screen. Every animated view here costs a
  // commit of the whole page on each frame (see place-tag.tsx), and the tags
  // bobbing to a scroll that had long since carried them out of sight was
  // most of what made scrolling Discover stutter.
  const stripMotion = useSharedValue(0);
  const pageMotion = useSharedValue(0);
  const stripX = useSharedValue(0);
  // Where the strip's section ends, down the page.
  const stripBottom = useSharedValue(0);
  const tagMotion = useMemo(
    () => ({ strip: stripMotion, page: pageMotion, offset: stripX }),
    [stripMotion, pageMotion, stripX],
  );
  const stripScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const x = event.contentOffset.x;
      stripMotion.set(momentary(x - stripX.get()));
      stripX.set(x);
    },
  });
  // Only the scroll position goes into the worklet: the stage itself holds
  // the scroll view's ref, and a ref passed to a worklet is frozen.
  const pageScrollY = stage.scrollY;
  useAnimatedReaction(
    () => pageScrollY.value,
    (y, previous) => {
      if (previous == null) return;
      if (y > stripBottom.value) return;
      pageMotion.set(momentary(y - previous));
    },
  );
  const viewerId = session?.user.id;

  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<DiscoverPlace[]>([]);
  const [placePhotoUrls, setPlacePhotoUrls] = useState<Record<string, string>>({});
  const [placeRegions, setPlaceRegions] = useState<Map<string, string | null>>(new Map());
  const [reviews, setReviews] = useState<FeedVisit[]>([]);
  const [reviewPhotoUrls, setReviewPhotoUrls] = useState<Record<string, string>>({});
  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [featuredBoards, setFeaturedBoards] = useState<BoardRow[]>([]);
  const [boardThumbnailUrls, setBoardThumbnailUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // A counter rather than a second copy of the loader. Everything below
  // already runs on viewerId changing, and cancels itself properly when it
  // is superseded; adding the nonce to that effect's inputs re-runs exactly
  // that, with none of it written twice.
  const [reloadNonce, setReloadNonce] = useState(0);

  useImperativeHandle(ref, () => ({
    refresh: () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setReloadNonce((n) => n + 1);
    },
  }));

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;

    void (async () => {
      // Inside the async body rather than in the effect's own, which React's
      // lint rejects: a setState run synchronously while the effect is
      // committing schedules a second render before the first has finished.
      // Both of these are already the initial state, so this only actually
      // does anything when the viewer changes under a mounted view.
      setError(null);
      setLoading(true);
      try {
        // Where the viewer is decides the places ranking, so it has to be
        // settled before that call rather than alongside it. It never blocks
        // for long: it only reads the device when permission is already
        // granted, and otherwise it is one row from `users`.
        const viewer = await resolveViewerLocation(viewerId);
        if (cancelled) return;

        const [placeList, reviewList, articleList, boardList] = await Promise.all([
          getDiscoverPlaces(PLACE_COUNT, viewer),
          getDiscoverReviews(REVIEW_COUNT, viewerId),
          listPublishedArticles(SHELF_COUNT),
          listFeaturedBoards(SHELF_COUNT),
        ]);
        if (cancelled) return;

        setPlaces(placeList);
        setReviews(reviewList);
        setArticles(articleList);
        setFeaturedBoards(boardList);
        setLoading(false);

        // The decorations — photographs, region lines, board covers. Second
        // pass on purpose: every one of them depends on what the first pass
        // returned, and none of them is worth holding the whole tab blank for.
        const reviewPhotoIds = reviewList.flatMap((visit) => visit.photoIds);
        const [photos, regions, thumbnails, reviewPhotos] = await Promise.all([
          getPlacePhotoUrls(placeList.map((place) => place.id)),
          resolveStateCountries(placeList.map((place) => place.id)),
          getBoardThumbnailUrls(boardList),
          reviewPhotoIds.length > 0 ? getPhotoViewUrls(reviewPhotoIds) : Promise.resolve({}),
        ]);
        if (cancelled) return;

        setPlacePhotoUrls(photos);
        setPlaceRegions(regions);
        setBoardThumbnailUrls(thumbnails);
        setReviewPhotoUrls(reviewPhotos);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load Discover.');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerId, reloadNonce]);

  const handleToggleLike = useCallback(
    async (visit: FeedVisit) => {
      if (!viewerId) return;
      const nowLiked = !visit.isLikedByMe;
      // Optimistic and reverted on failure — the same bargain the feed makes,
      // so a like feels identical wherever it is pressed.
      setReviews((current) =>
        current.map((item) =>
          item.id === visit.id
            ? {
                ...item,
                isLikedByMe: nowLiked,
                likeCount: item.likeCount + (nowLiked ? 1 : -1),
              }
            : item,
        ),
      );
      try {
        if (nowLiked) await likeVisit(viewerId, visit.id);
        else await unlikeVisit(viewerId, visit.id);
      } catch {
        setReviews((current) => current.map((item) => (item.id === visit.id ? visit : item)));
      }
    },
    [viewerId],
  );

  const isEmpty =
    !loading &&
    places.length === 0 &&
    reviews.length === 0 &&
    articles.length === 0 &&
    featuredBoards.length === 0;

  return (
    <ScrollStageProvider stage={stage}>
    <KeyboardAwareScroll
      ref={scrollRef}
      {...scrollProps}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}>
      {error && (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      )}

      {loading && (
        <View style={styles.loading}>
          <ActivityIndicator color={BrandColors.sage} />
        </View>
      )}

      {isEmpty && (
        <View style={styles.loading}>
          <ThemedText type="caption">
            Nothing to discover yet. As people review places, they show up here.
          </ThemedText>
        </View>
      )}

      {places.length > 0 && (
        <View
          style={styles.section}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            stripBottom.set(y + height);
          }}>
          <ThemedText type="sectionLabel">Places to go</ThemedText>
          {/* Bled past the screen's gutter so the strip runs off the edge and
              reads as scrollable, instead of stopping short and looking like
              a list that happens to be cut off. The gutter is put back as
              padding on the row itself. */}
          <Animated.ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripBleed}
            contentContainerStyle={styles.strip}
            onScroll={stripScrollHandler}
            scrollEventThrottle={16}>
            <PlaceTagRail count={places.length} motion={tagMotion} />
            {places.map((place, index) => (
              <PlaceTag
                key={place.id}
                seed={place.id}
                index={index}
                motion={tagMotion}
                name={place.name}
                subtitle={
                  funDistanceLabel(place.distanceKm, place.id) ??
                  placeRegions.get(place.id) ??
                  `${place.reviewCount} review${place.reviewCount === 1 ? '' : 's'}`
                }
                photoUrl={placePhotoUrls[place.id]}
                rating={place.avgRating}
                onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}
              />
            ))}
          </Animated.ScrollView>
        </View>
      )}

      {reviews.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Reviews to read</ThemedText>
          <View style={styles.reviewList}>
            {reviews.map((visit, index) => (
              <Fragment key={visit.id}>
                {index > 0 && (
                  <JourneyLine
                    from={stopOf(reviews[index - 1])}
                    to={stopOf(visit)}
                    seed={`${reviews[index - 1].id}-${visit.id}`}
                    style={styles.journey}
                  />
                )}
                <DealIn seed={visit.id}>
                  <VisitCard
                    visit={visit}
                    photoUrls={reviewPhotoUrls}
                    isOwner={false}
                    isCopied={false}
                    onToggleLike={() => void handleToggleLike(visit)}
                    onShare={() => {
                      void shareText(`${visit.placeName}\n${visit.note ?? ''}`.trim());
                    }}
                    onDeleted={() =>
                      setReviews((current) => current.filter((item) => item.id !== visit.id))
                    }
                  />
                </DealIn>
              </Fragment>
            ))}
          </View>
        </View>
      )}

      {articles.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Articles</ThemedText>
          {articles.map((article) => (
            <Pressable
              key={article.id}
              onPress={() =>
                router.push({ pathname: '/article/[id]', params: { id: article.id } })
              }>
              <ThemedView type="backgroundElement" style={styles.row}>
                <LoadableImage
                  source={article.coverPhotoUrl ? { uri: article.coverPhotoUrl } : undefined}
                  style={styles.thumbnail}
                />
                <View style={styles.rowLeading}>
                  <ThemedText type="headlineWrapped">{article.title}</ThemedText>
                  {article.subtitle && (
                    <ThemedText type="caption" numberOfLines={2}>
                      {article.subtitle}
                    </ThemedText>
                  )}
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}

      {featuredBoards.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Featured boards</ThemedText>
          {featuredBoards.map((board) => (
            <Pressable
              key={board.id}
              onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <LoadableImage
                  source={boardThumbnailUrls[board.id] ? { uri: boardThumbnailUrls[board.id] } : undefined}
                  style={styles.thumbnail}
                />
                <View style={styles.rowLeading}>
                  <ThemedText type="headlineWrapped">{board.name}</ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}
    </KeyboardAwareScroll>
    </ScrollStageProvider>
  );
}

const styles = StyleSheet.create({
  // The gutter and the column's width cap are on the content, inside the
  // scroll view, so the scroll view itself runs to the screen's edges and
  // anything leaning past a card (a stamp, the places strip) is cut off by
  // the screen rather than short of it.
  scrollContent: {
    gap: Spacing.five,
    paddingTop: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  loading: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  // Undoes the content's gutter (see scrollContent) so the strip can run to
  // both edges, and puts it back inside as padding.
  stripBleed: {
    marginHorizontal: -Spacing.four,
    // Unclipped, so a tag falling in from above, or swinging, is not cut off
    // at the strip's edge. (Android's horizontal scroll view honours this.)
    overflow: 'visible',
  },

  strip: {
    gap: PLACE_TAG_GAP,
    paddingHorizontal: PLACE_TAG_EDGE,
    // Room above the tags for the rail and their strings.
    paddingTop: PLACE_TAG_HEADROOM,
    // And below, for the slight swing of the last row of a tag.
    paddingBottom: Spacing.two,
    alignItems: 'flex-start',
  },
  reviewList: {
    gap: Spacing.four,
  },
  // Into the list's gaps on both sides, so the route runs from the post
  // above to the next one's avatar with nothing between.
  journey: {
    marginVertical: -Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowLeading: {
    flex: 1,
    gap: Spacing.half,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
});
