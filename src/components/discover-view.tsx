import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { VisitCard } from '@/components/visit-card';
import { BrandColors, Spacing } from '@/constants/theme';
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

const PLACE_CARD_WIDTH = 176;
const PLACE_STAMP_SIZE = 38;

// Below this a place is near enough to describe in whole kilometres; above it
// the precision is a lie and the number just gets long.
const NEAR_KM = 10;

function distanceLabel(km: number | null): string | null {
  if (km == null) return null;
  if (km < 1) return 'Right here';
  if (km < NEAR_KM) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
}

export function DiscoverView() {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const { session } = useAuth();
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
  }, [viewerId]);

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
    <Animated.ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
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
          <ThemedText type="small" themeColor="textSecondary">
            Nothing to discover yet. As people review places, they show up here.
          </ThemedText>
        </View>
      )}

      {places.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Places to go</ThemedText>
          {/* Bled past the screen's gutter so the strip runs off the edge and
              reads as scrollable, instead of stopping short and looking like
              a list that happens to be cut off. The gutter is put back as
              padding on the row itself. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stripBleed}
            contentContainerStyle={styles.strip}>
            {places.map((place) => (
              <Pressable
                key={place.id}
                onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}>
                <ThemedView type="backgroundElement" style={styles.placeCard}>
                  <View style={styles.placePhotoWrap}>
                    {placePhotoUrls[place.id] ? (
                      <Image
                        source={{ uri: placePhotoUrls[place.id] }}
                        style={styles.placePhoto}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.placePhoto, styles.placePhotoEmpty]} />
                    )}
                    {place.avgRating != null && (
                      <View style={styles.placeStamp} pointerEvents="none">
                        <RatingGlassBadgeGated
                          rating={place.avgRating}
                          size={PLACE_STAMP_SIZE}
                          seed={place.id}
                        />
                      </View>
                    )}
                  </View>
                  <View style={styles.placeCaption}>
                    {/* Two lines, not one. At one line every long name in the
                        table came out as "GOLDEN GAT…", which cannot be told
                        from Golden Gate Park. */}
                    <ThemedText type="smallBold" numberOfLines={2}>
                      {place.name}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {distanceLabel(place.distanceKm) ??
                        placeRegions.get(place.id) ??
                        `${place.reviewCount} review${place.reviewCount === 1 ? '' : 's'}`}
                    </ThemedText>
                  </View>
                </ThemedView>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {reviews.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Reviews to read</ThemedText>
          <View style={styles.reviewList}>
            {reviews.map((visit) => (
              <VisitCard
                key={visit.id}
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
                {article.coverPhotoUrl ? (
                  <Image source={{ uri: article.coverPhotoUrl }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.rowLeading}>
                  <ThemedText type="headlineWrapped">{article.title}</ThemedText>
                  {article.subtitle && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
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
                {boardThumbnailUrls[board.id] ? (
                  <Image source={{ uri: boardThumbnailUrls[board.id] }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.rowLeading}>
                  <ThemedText type="headlineWrapped">{board.name}</ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: Spacing.five,
    paddingTop: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  loading: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
  },
  // Undoes the screen's own gutter (see discoverWrap in (tabs)/index.tsx) so
  // the strip can run to both edges, and puts it back inside as padding.
  stripBleed: {
    marginHorizontal: -Spacing.four,
  },
  strip: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  placeCard: {
    width: PLACE_CARD_WIDTH,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  placePhotoWrap: {
    width: '100%',
    // A postcard's own proportion, so these read as of a piece with the
    // review cards below rather than as a different kind of object.
    aspectRatio: 1.5,
  },
  placePhoto: {
    width: '100%',
    height: '100%',
  },
  placePhotoEmpty: {
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
  // Overlapping the photograph's bottom edge, the way a stamp sits on a card
  // rather than in a column of its own.
  placeStamp: {
    position: 'absolute',
    right: Spacing.two,
    bottom: -Spacing.two,
  },
  placeCaption: {
    padding: Spacing.three,
    gap: Spacing.half,
  },
  reviewList: {
    gap: Spacing.four,
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
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
});
