import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { StretchText } from '@/components/ui/stretch-text';
import { TagSticker } from '@/components/ui/tag-sticker';
import { FilterSortMenu, type MenuOption } from '@/components/ui/filter-sort-menu';
import { BrandColors, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getFollowedUserIds, getVisitsForPlace, type PlaceVisit } from '@/lib/feed';
import type { Database } from '@/lib/database.types';
import { getPlaceAncestors, type PlaceAncestor } from '@/lib/places-cache';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';
import { countTagsForVisits } from '@/lib/visit-tags';

type PlaceRow = Database['public']['Tables']['places']['Row'];

// Ratings run 0-10 here, so 5.0 is the midpoint the "good/bad" split hangs
// off — not a five-star scale's ceiling.
const RATING_SPLIT = 5;

// The stamp is the app's rating display everywhere else (feed cards, the
// harmony breakdown), so these pages use it too rather than a "8.6 ★" that
// appeared nowhere else. Row stamps are smaller than the header's, which is
// summarising the whole place.
const ROW_STAMP_SIZE = 44;
const HEADER_STAMP_SIZE = 52;

// How many tag filters to offer. A country page surfaces well over a dozen,
// which at two stickers per row pushed the reviews themselves most of a
// screen further down — and the tail of that list matches one or two
// reviews each, so it costs the most space for the least filtering. The
// commonest tags are the ones worth sifting by.
const MAX_TAG_FILTERS = 8;

type SortMode = 'specific' | 'recent' | 'popular' | 'highest' | 'lowest';
// Mutually exclusive by nature: nothing is both at-or-above and below the
// split, so these are one setting rather than two independent toggles.
type RatingFilter = 'none' | 'high' | 'low';

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'specific', label: 'Most specific' },
  { key: 'recent', label: 'Newest' },
  { key: 'popular', label: 'Most liked' },
  { key: 'highest', label: 'Highest rated' },
  { key: 'lowest', label: 'Lowest rated' },
];

// Unrated visits sort to the bottom of both rating orders rather than
// counting as a zero, which would put every "just visited" entry above every
// genuinely bad review in the lowest-first order.
function byRating(a: PlaceVisit, b: PlaceVisit, direction: 1 | -1): number {
  if (a.rating == null && b.rating == null) return 0;
  if (a.rating == null) return 1;
  if (b.rating == null) return -1;
  return (b.rating - a.rating) * direction;
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [place, setPlace] = useState<PlaceRow | null>(null);
  const [ancestors, setAncestors] = useState<PlaceAncestor[]>([]);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  // Specific-first by default: on a country or continent page essentially
  // every review belongs to somewhere inside it, and a review of an actual
  // venue says more than a review of the whole country.
  const [sortMode, setSortMode] = useState<SortMode>('specific');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('none');
  const [friendsOnly, setFriendsOnly] = useState(false);
  // Tag filters are additive (AND): picking "Cozy" and "Affordable" asks for
  // places that were both, which is how someone actually searches — not for
  // anything that was either.
  const [tagSlugs, setTagSlugs] = useState<string[]>([]);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useEffect(() => {
    if (!id || !session) return;
    (async () => {
      setError(null);
      try {
        const [
          { data: placeData, error: placeError },
          { data: aggregate, error: aggregateError },
          visitsData,
          followed,
        ] = await Promise.all([
          supabase.from('places').select('*').eq('id', id).single(),
          supabase.rpc('get_place_aggregate_rating', { target_place_id: id }).single(),
          getVisitsForPlace(id, session.user.id),
          // Fetched up front rather than when the filter is first switched
          // on, so toggling it is instant and can't fail on its own.
          getFollowedUserIds(session.user.id),
        ]);
        if (placeError) throw placeError;
        if (aggregateError) throw aggregateError;

        setPlace(placeData);
        setAncestors(await getPlaceAncestors(id));
        setAvgRating(aggregate?.avg_rating ? Number(aggregate.avg_rating) : null);
        setReviewCount(aggregate?.review_count ? Number(aggregate.review_count) : 0);
        setVisits(visitsData);
        setFollowedIds(new Set(followed));

        const photoIds = visitsData.flatMap((v) => v.photoIds);
        if (photoIds.length > 0) {
          setPhotoUrls(await getPhotoViewUrls(photoIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this place.');
      } finally {
        setHasLoadedOnce(true);
      }
    })();
  }, [id, session]);

  // Only the tags actually present on this place's reviews, commonest
  // first. Offering the whole vocabulary would mostly be filters that
  // produce nothing, which is worse than not offering them.
  const availableTags = useMemo(() => {
    const counted = countTagsForVisits(visits.map((visit) => visit.tags));
    // An active filter always stays visible, even if it falls outside the
    // cut — otherwise turning one on could hide the control that turns it
    // back off.
    const shown = counted.slice(0, MAX_TAG_FILTERS);
    const missing = counted.filter(
      (tag) => tagSlugs.includes(tag.slug) && !shown.includes(tag)
    );
    return [...shown, ...missing];
  }, [visits, tagSlugs]);

  // Filter first, then sort — sorting the discarded rows is wasted work, and
  // it keeps "5 of 24" style reasoning about the result straightforward.
  const visibleVisits = useMemo(() => {
    const filtered = visits.filter((visit) => {
      if (friendsOnly && !followedIds.has(visit.user_id)) return false;
      if (tagSlugs.length > 0) {
        const own = new Set(visit.tags.map((tag) => tag.slug));
        if (!tagSlugs.every((slug) => own.has(slug))) return false;
      }
      if (ratingFilter === 'high') return visit.rating != null && visit.rating >= RATING_SPLIT;
      if (ratingFilter === 'low') return visit.rating != null && visit.rating < RATING_SPLIT;
      return true;
    });

    // getVisitsForPlace already returns newest-first, so 'recent' needs no
    // work and every other order tie-breaks on that existing order for free.
    switch (sortMode) {
      case 'specific':
        return [...filtered].sort((a, b) => b.placeDepth - a.placeDepth);
      case 'popular':
        return [...filtered].sort((a, b) => b.likeCount - a.likeCount);
      case 'highest':
        return [...filtered].sort((a, b) => byRating(a, b, 1));
      case 'lowest':
        return [...filtered].sort((a, b) => byRating(a, b, -1));
      default:
        return filtered;
    }
  }, [visits, sortMode, ratingFilter, friendsOnly, followedIds, tagSlugs]);

  if (!hasLoadedOnce) return <PageLoader />;

  // Not a real "photo of the place" — no such source exists (places has no
  // photo column, Google Places field mask never requests one). Standing in
  // with the first photo of the most-recent review, the same fallback
  // already used for the map's preview card (nearby-places.ts).
  const heroPhotoId = visits[0]?.photoIds[0];
  const heroPhotoUrl = heroPhotoId ? photoUrls[heroPhotoId] : undefined;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={visibleVisits}
          keyExtractor={(item: PlaceVisit) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          // Every row draws a rating stamp, and each stamp is a Skia canvas
          // holding its own GL surface. These rows are short — eight or so
          // fit on a screen — so FlatList's default window (21 screens'
          // worth) would mount dozens of live GL contexts at once on a
          // country or continent page. That is the same shape of load that
          // faulted the host OpenGL driver on the harmony screen, and it is
          // wasted work regardless of which machine it runs on: the feed
          // gets away with the default only because its cards are a full
          // screen each, so few exist at a time. These numbers keep roughly
          // a screen either side live, which is what smooth scrolling
          // actually needs.
          initialNumToRender={5}
          maxToRenderPerBatch={5}
          windowSize={5}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
              <BackLink seed="[id]" />

              {heroPhotoUrl && (
                <View style={styles.heroWrap}>
                  <LoadableImage source={{ uri: heroPhotoUrl }} style={styles.hero} />
                </View>
              )}

              {/* Never truncated here, unlike a compact list row: this page
                  is ABOUT this one place, so its full name is the whole
                  point. Without `fill` there's no vertical stretch to fight
                  either — a long name simply wraps onto a second line
                  instead of ending in an ellipsis you can't expand. */}
              <StretchText type="headline" truncateLongText={false}>
                {place?.name ?? 'Place'}
              </StretchText>

              {/* The containing scopes, broadest first, each one a link.
                  This was a flat "North America > United States" string
                  before — correct, and a dead end: the one page where
                  widening out to the country or continent is the obvious
                  next move had no way to do it. */}
              {ancestors.length > 0 && (
                <View style={styles.scopeRow}>
                  {ancestors.map((ancestor, index) => (
                    <View key={ancestor.id} style={styles.scopeItem}>
                      {index > 0 && (
                        <ThemedText type="small" themeColor="textSecondary">
                          ›
                        </ThemedText>
                      )}
                      <Pressable
                        onPress={() =>
                          router.push({ pathname: '/place/[id]', params: { id: ancestor.id } })
                        }
                        hitSlop={6}>
                        <ThemedText type="small" themeColor="sage">
                          {ancestor.name}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
              {/* Count decides whether anything is here; the average only
                  decides whether a score is worth showing. Keyed off the
                  average alone, a place whose only visits were logged
                  WITHOUT a rating (avg_rating comes back null, review_count
                  does not) announced "No reviews yet" directly above the
                  list of them. */}
              <View style={styles.aggregateRow}>
                {avgRating !== null && (
                  <RatingGlassBadgeGated rating={avgRating} size={HEADER_STAMP_SIZE} />
                )}
                <ThemedText type="default">
                  {reviewCount === 0
                    ? 'No reviews yet'
                    : `${reviewCount} review${reviewCount === 1 ? '' : 's'}`}
                </ThemedText>
              </View>

              <Button
                label="Add your review"
                onPress={() => router.push({ pathname: '/review-form', params: { placeId: id } })}
              />

              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}

              {visits.length > 0 && (
                <View style={styles.controls}>
                  {/* One trigger rather than a row of chips per group. See
                      FilterSortMenu: this page carries three groups and the
                      tag group alone can be eight options, which as chips
                      filled the screen between the header and the reviews. */}
                  <FilterSortMenu
                    groups={[
                      {
                        kind: 'single',
                        key: 'sort',
                        label: 'Sort',
                        options: SORT_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
                        value: sortMode,
                        onChange: (value) => setSortMode(value as SortMode),
                      },
                      {
                        kind: 'multi',
                        key: 'rating',
                        // Mutually exclusive in effect — picking one clears
                        // the other — but modelled as a multi group so both
                        // read as filters rather than as a second sort.
                        label: 'Rating',
                        options: [
                          { value: 'high', label: `${RATING_SPLIT.toFixed(1)} and up` },
                          { value: 'low', label: `Under ${RATING_SPLIT.toFixed(1)}` },
                        ],
                        values: ratingFilter === 'none' ? [] : [ratingFilter],
                        onToggle: (value) =>
                          setRatingFilter((current) =>
                            current === value ? 'none' : (value as RatingFilter)
                          ),
                      },
                      {
                        kind: 'multi',
                        key: 'people',
                        label: 'People',
                        options: [{ value: 'friends', label: 'Friends only' }],
                        values: friendsOnly ? ['friends'] : [],
                        onToggle: () => setFriendsOnly((on) => !on),
                      },
                      ...(availableTags.length > 0
                        ? ([
                            {
                              kind: 'multi' as const,
                              key: 'tags',
                              label: 'Tags',
                              options: availableTags.map((tag) => ({
                                value: tag.slug,
                                label: tag.label,
                                count: tag.count,
                              })),
                              values: tagSlugs,
                              onToggle: (value: string) =>
                                setTagSlugs((prev) =>
                                  prev.includes(value)
                                    ? prev.filter((s) => s !== value)
                                    : [...prev, value]
                                ),
                              // Tags keep their sticker in the sheet — they
                              // are the same objects that appear on reviews,
                              // and the colour is how you recognise them.
                              renderOption: (option: MenuOption) => (
                                <TagSticker
                                  slug={option.value}
                                  label={
                                    option.count != null
                                      ? `${option.label} ${option.count}`
                                      : option.label
                                  }
                                />
                              ),
                            },
                          ] as const)
                        : []),
                    ]}
                  />

                  {visibleVisits.length !== visits.length && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Showing {visibleVisits.length} of {visits.length}
                    </ThemedText>
                  )}
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.contentWrap}>
              <ThemedText type="small" themeColor="textSecondary">
                {visits.length === 0 ? 'No reviews yet.' : 'No reviews match these filters.'}
              </ThemedText>
            </View>
          }
          renderItem={({ item }: { item: PlaceVisit }) => {
            const visitPhotoUrls = item.photoIds.map((photoId) => photoUrls[photoId]).filter((url) => url != null);
            // On a state, country or continent page every row is somewhere
            // else inside it, so the row has to lead with where it actually
            // is — otherwise the list reads as unattributed reviews of the
            // whole country. On a venue's own page that would just repeat
            // the title above, so there the author leads instead.
            const isNested = item.placeDepth > 0;
            const metaLine = [
              isNested ? item.authorName : null,
              item.rating == null ? 'Visited' : null,
              item.likeCount > 0
                ? `${item.likeCount} like${item.likeCount === 1 ? '' : 's'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}
                style={styles.contentWrap}>
                <ThemedView type="backgroundElement" style={styles.visitCard}>
                  <PhotoGrid urls={visitPhotoUrls} aspectRatios={item.photoAspectRatios} />
                  <View style={styles.visitInfo}>
                    <View style={styles.visitText}>
                      <ThemedText type="smallBold">
                        {isNested ? item.placeName : item.authorName}
                      </ThemedText>
                      {/* The rating has moved to the stamp beside this, so
                          the line carries only what the stamp can't say —
                          and "Visited" only where there is no stamp to
                          replace it. Joined rather than concatenated so it
                          can't render a stray leading separator when the
                          pieces before it happen to be absent. */}
                      {metaLine.length > 0 && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {metaLine}
                        </ThemedText>
                      )}
                      {item.note && (
                        <ThemedText type="small" themeColor="textSecondary">
                          {item.note}
                        </ThemedText>
                      )}
                    </View>
                    {item.rating != null && (
                      <RatingGlassBadgeGated rating={item.rating} size={ROW_STAMP_SIZE} seed={item.id} />
                    )}
                  </View>
                </ThemedView>
              </Pressable>
            );
          }}
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
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  contentWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerSection: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  heroWrap: {
    width: '100%',
    height: 180,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  // Wraps: a venue can sit under city > state > country > continent, which
  // doesn't fit one phone-width line.
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.one,
  },
  scopeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  controls: {
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.two,
  },
  visitCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  aggregateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Row layout: text takes the slack, the stamp keeps its natural size at
  // the end of the row.
  visitInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  visitText: {
    flex: 1,
    gap: Spacing.half,
  },
});
