import { router } from 'expo-router';
import { Fragment, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';

import {
  PLACE_TAG_EDGE,
  PLACE_TAG_END,
  PLACE_TAG_GAP,
  PLACE_TAG_HEADROOM,
  PlaceTag,
  PlaceTagRail,
  placeStripWidth,
} from '@/components/place-tag';
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
import type { Coordinate } from '@/lib/current-location';
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
import { userErrorMessage } from '@/lib/user-error';
import { ErrorNotice } from '@/components/ui/error-notice';

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

// The places strip starts with this many, enough to fill it twice over, and
// fetches this many more each time it is scrolled near its end. It used to
// stop at the first ten for good, so a couple of flings ran it into a dead
// end however many places there were.
const PLACE_BATCH = 10;
// Never more than this on the strip. Each tag is three animated views and its
// own photograph, and a strip this long is already a lot of swiping.
const PLACE_MAX = 40;
// How far short of the strip's end the next batch is fetched, in points:
// about two tags, so on a steady swipe they are hanging by the time the strip
// gets there instead of arriving after it has stopped.
const PLACE_LOAD_AHEAD = 420;
// How long to wait after a fetch fails before scrolling near the end tries
// again, so a dropped connection is not retried on every frame of a scroll.
const PLACE_RETRY_MS = 4000;
// The "Places to go" label's line, and the band it takes at the top of the
// strip. The label sits inside the strip's own area, over its top band (see
// stripLabel), so a sideways swipe on the label or just above the twine
// scrolls the strip. It used to sit above the strip, where the same swipe did
// nothing at all.
const STRIP_LABEL_LINE = 16;
const STRIP_LABEL_BAND = STRIP_LABEL_LINE + Spacing.two;
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
  // The strip's full width, from how many tags it holds, and whether the next
  // batch has been asked for. Set from JS when the places change; read here,
  // on the UI thread, on every frame of a scroll.
  const stripWidth = useSharedValue(0);
  const moreRequested = useSharedValue(true);
  const loadMoreRef = useRef<() => void>(() => {});
  const requestMorePlaces = useCallback(() => loadMoreRef.current(), []);
  const stripScrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const x = event.contentOffset.x;
        stripMotion.set(momentary(x - stripX.get()));
        stripX.set(x);
        // Nearing the end: fetch the next places now, so they are hanging by
        // the time the strip gets there.
        const remaining = stripWidth.get() - (x + event.layoutMeasurement.width);
        if (!moreRequested.get() && remaining < PLACE_LOAD_AHEAD) {
          moreRequested.set(true);
          runOnJS(requestMorePlaces)();
        }
      },
    },
    [requestMorePlaces],
  );
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
  // Whether the strip holds every place there is to show (or as many as it
  // will hold). Until then the twine runs on past the last tag; after, it is
  // tied off there.
  const [placesEnded, setPlacesEnded] = useState(false);
  // Places added as the strip was scrolled whose photos are still being
  // looked up, and where each falls in its own batch's drop-in stagger.
  const [pendingPlacePhotos, setPendingPlacePhotos] = useState<Set<string>>(new Set());
  const [dropIndexes, setDropIndexes] = useState<Record<string, number>>({});
  // What fetching more places reads: the latest of each, without the fetch
  // having to be rebuilt (and the scroll handler with it) whenever one moves.
  const placesRef = useRef<DiscoverPlace[]>([]);
  const placesEndedRef = useRef(false);
  const viewerRef = useRef<Coordinate | null>(null);
  const loadingMorePlaces = useRef(false);
  // Bumped by every full reload, so a batch still in flight from before one
  // is dropped rather than appended to the new strip.
  const loadGeneration = useRef(0);
  // Whether the photographs and covers have been looked up, whether or not
  // every place turned out to have one. Until then a missing photo is still
  // on its way; after it, a place with none has none, and its tag should not
  // show a loading icon waiting on a picture that is not coming.
  const [decorationsLoaded, setDecorationsLoaded] = useState(false);
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
    loadGeneration.current += 1;
    moreRequested.set(true);

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
        viewerRef.current = viewer;

        const [placeList, reviewList, articleList, boardList] = await Promise.all([
          getDiscoverPlaces(PLACE_BATCH, viewer),
          getDiscoverReviews(REVIEW_COUNT, viewerId),
          listPublishedArticles(SHELF_COUNT),
          listFeaturedBoards(SHELF_COUNT),
        ]);
        if (cancelled) return;

        // Fewer than asked for is every place there is.
        const ended = placeList.length < PLACE_BATCH;
        placesRef.current = placeList;
        placesEndedRef.current = ended;
        setPlaces(placeList);
        setPlacesEnded(ended);
        setPendingPlacePhotos(new Set());
        setDropIndexes({});
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
        setDecorationsLoaded(true);
      } catch (err) {
        if (cancelled) return;
        setError(userErrorMessage(err, 'Could not load Discover.'));
        setLoading(false);
        // Nothing more is coming after a failure either.
        setDecorationsLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [viewerId, reloadNonce, moreRequested]);

  // The next batch of places, appended to the strip. See PLACE_BATCH.
  //
  // get_discover_places takes a limit and no offset, so this asks for the
  // first N again with N one batch larger, and keeps whatever is new. The
  // ranking can shift between calls (it decays with time), so new places are
  // told apart by id rather than by position.
  const loadMorePlaces = useCallback(async () => {
    if (loadingMorePlaces.current || placesEndedRef.current) return;
    loadingMorePlaces.current = true;
    const generation = loadGeneration.current;
    const have = placesRef.current;
    const limit = Math.min(have.length + PLACE_BATCH, PLACE_MAX);
    let failed = false;
    try {
      const list = await getDiscoverPlaces(limit, viewerRef.current);
      if (generation !== loadGeneration.current) return;
      const known = new Set(have.map((place) => place.id));
      const fresh = list.filter((place) => !known.has(place.id));
      const ended = list.length < limit || limit >= PLACE_MAX || fresh.length === 0;

      if (fresh.length > 0) {
        const next = [...have, ...fresh];
        placesRef.current = next;
        setPlaces(next);
        setDropIndexes((current) => ({
          ...current,
          ...Object.fromEntries(fresh.map((place, order) => [place.id, order])),
        }));
      }
      if (ended) {
        placesEndedRef.current = true;
        setPlacesEnded(true);
      }
      if (fresh.length === 0) return;

      // Their photos and region lines, as the first batch had.
      const ids = fresh.map((place) => place.id);
      setPendingPlacePhotos((current) => new Set([...current, ...ids]));
      try {
        const [photos, regions] = await Promise.all([getPlacePhotoUrls(ids), resolveStateCountries(ids)]);
        if (generation !== loadGeneration.current) return;
        setPlacePhotoUrls((current) => ({ ...current, ...photos }));
        setPlaceRegions((current) => new Map([...current, ...regions]));
      } finally {
        if (generation === loadGeneration.current) {
          setPendingPlacePhotos((current) => {
            const next = new Set(current);
            for (const id of ids) next.delete(id);
            return next;
          });
        }
      }
    } catch {
      failed = true;
    } finally {
      loadingMorePlaces.current = false;
      // Allowed to ask again once the strip has grown (the effect below
      // re-arms it along with the new width), or after a pause if this failed.
      if (failed && generation === loadGeneration.current && !placesEndedRef.current) {
        setTimeout(() => {
          if (generation === loadGeneration.current) moreRequested.set(false);
        }, PLACE_RETRY_MS);
      }
    }
  }, [moreRequested]);
  useEffect(() => {
    loadMoreRef.current = () => void loadMorePlaces();
  }, [loadMorePlaces]);

  // The strip's width follows the places it holds, and a strip that has
  // grown may ask for more again once it nears its new end. Set together, so
  // the scroll handler never compares against a width the strip has
  // outgrown.
  useEffect(() => {
    stripWidth.set(placeStripWidth(places.length));
    moreRequested.set(placesEnded || places.length === 0);
  }, [places.length, placesEnded, stripWidth, moreRequested]);

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
      {/* Its own reload rather than the screen's: Discover is one tab, and
          reloading the screen would reload every tab with it. */}
      {error && <ErrorNotice message={error} onRetry={() => setReloadNonce((n) => n + 1)} />}

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
            <PlaceTagRail
              count={places.length}
              motion={tagMotion}
              top={STRIP_LABEL_BAND}
              ended={placesEnded}
            />
            {places.map((place, index) => (
              <PlaceTag
                key={place.id}
                seed={place.id}
                index={index}
                dropIndex={dropIndexes[place.id]}
                motion={tagMotion}
                name={place.name}
                subtitle={
                  funDistanceLabel(place.distanceKm, place.id) ??
                  placeRegions.get(place.id) ??
                  `${place.reviewCount} review${place.reviewCount === 1 ? '' : 's'}`
                }
                photoUrl={placePhotoUrls[place.id]}
                photoPending={!decorationsLoaded || pendingPlacePhotos.has(place.id)}
                rating={place.avgRating}
                onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}
              />
            ))}
          </Animated.ScrollView>
          {/* Over the strip's top band rather than above the strip, and
              letting touches through to it. See STRIP_LABEL_BAND. Drawn after
              the strip, so it stays on top of a tag dropping in past it. */}
          <View pointerEvents="none" style={styles.stripLabel}>
            <ThemedText type="sectionLabel" style={styles.stripLabelText}>
              Places to go
            </ThemedText>
          </View>
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
                  // The cover arrives with the article, so none means none.
                  pending={false}
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
                  pending={!decorationsLoaded}
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
  // The label, laid over the strip's top band at the column's own edge.
  stripLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  stripLabelText: {
    lineHeight: STRIP_LABEL_LINE,
  },
  stripBleed: {
    marginHorizontal: -Spacing.four,
    // Unclipped, so a tag falling in from above, or swinging, is not cut off
    // at the strip's edge. (Android's horizontal scroll view honours this.)
    overflow: 'visible',
  },

  strip: {
    gap: PLACE_TAG_GAP,
    paddingLeft: PLACE_TAG_EDGE,
    // Room past the last tag for the twine to be tied off on its nail, with
    // bare wall after it: what shows the strip has ended. See PlaceTagRail.
    paddingRight: PLACE_TAG_END,
    // Room above the tags for the label, then the rail and their strings.
    paddingTop: STRIP_LABEL_BAND + PLACE_TAG_HEADROOM,
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
