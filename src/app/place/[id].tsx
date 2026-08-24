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
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getFollowedUserIds, getVisitsForPlace, type PlaceVisit } from '@/lib/feed';
import type { Database } from '@/lib/database.types';
import { getPlaceBreadcrumb } from '@/lib/places-cache';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type PlaceRow = Database['public']['Tables']['places']['Row'];

// Ratings run 0-10 here, so 5.0 is the midpoint the "good/bad" split hangs
// off — not a five-star scale's ceiling.
const RATING_SPLIT = 5;

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

// Sort and filter both want the same control, so it exists once. Selected
// state is passed in rather than derived — a sort chip is selected when it
// IS the mode, a filter chip when its filter is on, and those aren't the
// same question.
function ControlChip({
  label,
  isSelected,
  onPress,
}: {
  label: string;
  isSelected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <ThemedView
        type={isSelected ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.sortChip}>
        <ThemedText type="small" themeColor={isSelected ? 'text' : 'textSecondary'}>
          {label}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [place, setPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  // Specific-first by default: on a country or continent page essentially
  // every review belongs to somewhere inside it, and a review of an actual
  // venue says more than a review of the whole country.
  const [sortMode, setSortMode] = useState<SortMode>('specific');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('none');
  const [friendsOnly, setFriendsOnly] = useState(false);
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
        setBreadcrumb(await getPlaceBreadcrumb(placeData));
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

  // Filter first, then sort — sorting the discarded rows is wasted work, and
  // it keeps "5 of 24" style reasoning about the result straightforward.
  const visibleVisits = useMemo(() => {
    const filtered = visits.filter((visit) => {
      if (friendsOnly && !followedIds.has(visit.user_id)) return false;
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
  }, [visits, sortMode, ratingFilter, friendsOnly, followedIds]);

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

              <StretchText type="headline">{place?.name ?? 'Place'}</StretchText>
              {breadcrumb.length > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {breadcrumb}
                </ThemedText>
              )}
              <ThemedText type="default">
                {avgRating !== null
                  ? `${avgRating.toFixed(1)} ★ · ${reviewCount} review${reviewCount === 1 ? '' : 's'}`
                  : 'No reviews yet'}
              </ThemedText>

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
                  {/* Wrapped rather than put in a horizontal scroller: a
                      nested horizontal scroller inside the tab pager kept
                      handing the drag off to the pager, which is what the
                      trip stepper had to abandon swiping over. */}
                  <View style={styles.controlGroup}>
                    <ThemedText type="sectionLabel" themeColor="textSecondary" style={styles.controlLabel}>
                      Sort
                    </ThemedText>
                    <View style={styles.chipRow}>
                      {SORT_OPTIONS.map((option) => (
                        <ControlChip
                          key={option.key}
                          label={option.label}
                          isSelected={sortMode === option.key}
                          onPress={() => setSortMode(option.key)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={styles.controlGroup}>
                    <ThemedText type="sectionLabel" themeColor="textSecondary" style={styles.controlLabel}>
                      Filter
                    </ThemedText>
                    <View style={styles.chipRow}>
                      {/* Tapping the active one clears it, so there's no
                          separate "all" chip to keep in sync. */}
                      <ControlChip
                        label={`${RATING_SPLIT.toFixed(1)} and up`}
                        isSelected={ratingFilter === 'high'}
                        onPress={() => setRatingFilter((f) => (f === 'high' ? 'none' : 'high'))}
                      />
                      <ControlChip
                        label={`Under ${RATING_SPLIT.toFixed(1)}`}
                        isSelected={ratingFilter === 'low'}
                        onPress={() => setRatingFilter((f) => (f === 'low' ? 'none' : 'low'))}
                      />
                      <ControlChip
                        label="Friends"
                        isSelected={friendsOnly}
                        onPress={() => setFriendsOnly((on) => !on)}
                      />
                    </View>
                  </View>

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
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}
                style={styles.contentWrap}>
                <ThemedView type="backgroundElement" style={styles.visitCard}>
                  <PhotoGrid urls={visitPhotoUrls} aspectRatios={item.photoAspectRatios} />
                  <View style={styles.visitInfo}>
                    <ThemedText type="smallBold">
                      {isNested ? item.placeName : item.authorName}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {isNested ? `${item.authorName} · ` : ''}
                      {item.rating != null ? `${item.rating.toFixed(1)} ★` : 'Visited'}
                      {item.likeCount > 0 ? ` · ${item.likeCount} like${item.likeCount === 1 ? '' : 's'}` : ''}
                    </ThemedText>
                    {item.note && (
                      <ThemedText type="small" themeColor="textSecondary">
                        {item.note}
                      </ThemedText>
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
  controls: {
    gap: Spacing.two,
  },
  controlGroup: {
    gap: Spacing.one,
  },
  controlLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  sortChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  list: {
    gap: Spacing.two,
  },
  visitCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  visitInfo: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
});
