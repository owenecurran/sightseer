import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { FilterSortMenu, type MenuGroup } from '@/components/ui/filter-sort-menu';
import { PageLoader } from '@/components/ui/page-loader';
import { TagStickerGraphic } from '@/components/ui/tag-sticker-graphic';
import { VisitCard } from '@/components/visit-card';
import { MaxContentWidth, ScrollScreenEdges, Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import type { Coordinate } from '@/lib/current-location';
import { resolveViewerLocation } from '@/lib/discover';
import { getFollowedUserIds, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import {
  HIGH_RATING,
  NO_TAG_FILTERS,
  getTaggedReviews,
  rankTaggedReviews,
  type TagFilters,
  type TagSort,
} from '@/lib/tag-reviews';
import { userErrorMessage } from '@/lib/user-error';
import { ErrorNotice } from '@/components/ui/error-notice';

// How many cards are drawn at a time. Postcards are heavy (two mounted faces
// each), so the rest wait for "Show more" rather than all mounting at once.
const PAGE_SIZE = 20;

const SORT_LABELS: Record<TagSort, string> = {
  recommended: 'Recommended',
  nearest: 'Nearest',
  highest: 'Highest rated',
  newest: 'Newest',
  popular: 'Most liked',
};

// Every review carrying one tag: where a second tap on a tag's sticker leads,
// from the back of any postcard.
//
// Ordered by default to put first what someone browsing a tag most likely
// wants: places near them, reviews rated highly, and reviews by people they
// follow (see rankTaggedReviews for how the three are weighed). It used to be
// the thirty newest, in date order, with no way to change it. Now the order
// and a few filters sit behind one menu, the same one the place page uses.
export default function TagScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const viewerId = session?.user.id;
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [label, setLabel] = useState<string | null>(null);
  const [visits, setVisits] = useState<FeedVisit[] | null>(null);
  // Where the viewer is, when known (never prompted for: see
  // resolveViewerLocation), and who they follow. Both feed the default order.
  const [viewer, setViewer] = useState<Coordinate | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<TagSort>('recommended');
  const [filters, setFilters] = useState<TagFilters>(NO_TAG_FILTERS);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !viewerId) return;
    let isActive = true;
    (async () => {
      try {
        // Location and follows are refinements: either failing leaves the
        // page ordered by rating rather than not loading at all.
        const [found, followed, location] = await Promise.all([
          getTaggedReviews(slug, viewerId),
          getFollowedUserIds(viewerId).catch(() => [] as string[]),
          resolveViewerLocation(viewerId).catch(() => null),
        ]);
        if (!isActive) return;
        setLabel(found.label);
        setFollowedIds(new Set(followed));
        setViewer(location);
        setVisits(found.visits);
      } catch (err) {
        if (isActive) setError(userErrorMessage(err, 'Could not load these reviews.'));
      }
    })();
    return () => {
      isActive = false;
    };
  }, [slug, viewerId]);

  const ranked = useMemo(
    () => rankTaggedReviews(visits ?? [], { sort, filters, viewer, followedIds }),
    [visits, sort, filters, viewer, followedIds],
  );
  const shown = useMemo(() => ranked.slice(0, shownCount), [ranked, shownCount]);

  // Photos for the cards on screen only. A tag can carry a couple of hundred
  // reviews, and signing every photo of every one of them up front was work
  // for cards nobody scrolls to. Already-signed ones come from the cache.
  const shownPhotoKey = shown.flatMap((visit) => visit.photoIds).join(',');
  useEffect(() => {
    if (!shownPhotoKey) return;
    let isActive = true;
    void getPhotoViewUrls(shownPhotoKey.split(','))
      .then((urls) => {
        if (isActive) setPhotoUrls((current) => ({ ...current, ...urls }));
      })
      .catch(() => {});
    return () => {
      isActive = false;
    };
  }, [shownPhotoKey]);

  function updateSort(next: TagSort) {
    setSort(next);
    setShownCount(PAGE_SIZE);
  }

  function toggleFilter(key: keyof TagFilters) {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
    setShownCount(PAGE_SIZE);
  }

  async function handleToggleLike(visit: FeedVisit) {
    if (!viewerId) return;
    const nowLiked = !visit.isLikedByMe;
    setVisits((current) =>
      (current ?? []).map((item) =>
        item.id === visit.id
          ? { ...item, isLikedByMe: nowLiked, likeCount: item.likeCount + (nowLiked ? 1 : -1) }
          : item,
      ),
    );
    try {
      if (nowLiked) await likeVisit(viewerId, visit.id);
      else await unlikeVisit(viewerId, visit.id);
    } catch {
      // Put it back as it was.
      setVisits((current) => (current ?? []).map((item) => (item.id === visit.id ? visit : item)));
    }
  }

  if (visits == null && !error) return <PageLoader />;

  const knowsWhere = viewer != null;
  // "Nearest" and "Nearby" mean nothing without knowing where the viewer is,
  // so they are only offered when that is known.
  const sortOptions: TagSort[] = knowsWhere
    ? ['recommended', 'nearest', 'highest', 'newest', 'popular']
    : ['recommended', 'highest', 'newest', 'popular'];
  const groups: MenuGroup[] = [
    {
      kind: 'single',
      key: 'sort',
      label: 'Sort',
      options: sortOptions.map((value) => ({ value, label: SORT_LABELS[value] })),
      value: sort,
      onChange: (value) => updateSort(value as TagSort),
    },
    {
      kind: 'multi',
      key: 'rating',
      label: 'Rating',
      options: [{ value: 'highRated', label: `${HIGH_RATING.toFixed(1)} and up` }],
      values: filters.highRated ? ['highRated'] : [],
      onToggle: () => toggleFilter('highRated'),
    },
    {
      kind: 'multi',
      key: 'people',
      label: 'People',
      options: [{ value: 'friendsOnly', label: 'Friends only' }],
      values: filters.friendsOnly ? ['friendsOnly'] : [],
      onToggle: () => toggleFilter('friendsOnly'),
    },
    ...(knowsWhere
      ? [
          {
            kind: 'multi' as const,
            key: 'distance',
            label: 'Distance',
            options: [{ value: 'nearby', label: 'Nearby' }],
            values: filters.nearby ? ['nearby'] : [],
            onToggle: () => toggleFilter('nearby'),
          },
        ]
      : []),
    {
      kind: 'multi',
      key: 'photos',
      label: 'Photos',
      options: [{ value: 'withPhotos', label: 'With photos' }],
      values: filters.withPhotos ? ['withPhotos'] : [],
      onToggle: () => toggleFilter('withPhotos'),
    },
  ];

  const total = visits?.length ?? 0;
  const isFiltered = Object.values(filters).some(Boolean);
  const countLine =
    total === 0
      ? 'Reviews tagged this way'
      : isFiltered
        ? `${ranked.length} of ${total} review${total === 1 ? '' : 's'} tagged this way`
        : `${total} review${total === 1 ? '' : 's'} tagged this way`;
  // Says what the default order is doing, so it does not look arbitrary.
  const orderNote =
    sort === 'recommended'
      ? knowsWhere
        ? "Nearby places, high ratings and friends' reviews first."
        : "High ratings and friends' reviews first."
      : null;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView edges={ScrollScreenEdges} style={styles.safeArea}>
        {/* Reanimated's ScrollView: the scroll handler runs on the UI thread,
            and handed to a plain ScrollView it threw "Object is not a
            function" on the first scroll. */}
        <Animated.ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed={`tag-${slug}`} />
          <View style={styles.title}>
            {/* Not pressable here: a second tap on a sticker leads to this
                very page. */}
            {slug && <TagStickerGraphic slug={slug} label={label ?? slug} size={52} interactive={false} />}
            <View style={styles.titleText}>
              <ThemedText type="displaySerif">{label ?? 'Tagged'}</ThemedText>
              <ThemedText type="caption">{countLine}</ThemedText>
            </View>
          </View>

          {total > 0 && (
            <View style={styles.controls}>
              <FilterSortMenu groups={groups} />
              {orderNote && (
                <ThemedText type="small" themeColor="textSecondary">
                  {orderNote}
                </ThemedText>
              )}
            </View>
          )}

          {error && <ErrorNotice message={error} />}
          {total === 0 && !error && (
            <ThemedText type="caption">No reviews you can see carry this tag yet.</ThemedText>
          )}
          {total > 0 && ranked.length === 0 && (
            <ThemedText type="caption">No reviews match these filters.</ThemedText>
          )}

          {shown.map((visit, index) => (
            // The stamp hangs below its card; ordering the siblings keeps the
            // overhang over the next card (see the feed's own note).
            <View key={visit.id} style={{ zIndex: shown.length - index }} collapsable={false}>
              <VisitCard
                visit={visit}
                photoUrls={photoUrls}
                isOwner={viewerId === visit.user_id}
                isCopied={false}
                onToggleLike={() => void handleToggleLike(visit)}
                onShare={() => {
                  void shareText(`${visit.placeName}\n${visit.note ?? ''}`.trim());
                }}
                onDeleted={() => setVisits((current) => (current ?? []).filter((item) => item.id !== visit.id))}
              />
            </View>
          ))}

          {ranked.length > shown.length && (
            <Button
              label={`Show more (${ranked.length - shown.length})`}
              variant="secondary"
              onPress={() => setShownCount((count) => count + PAGE_SIZE)}
            />
          )}
        </Animated.ScrollView>
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
  },
  list: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  titleText: {
    flex: 1,
    gap: Spacing.half,
  },
  controls: {
    gap: Spacing.two,
    // Up toward the title, which it belongs to more than the first card.
    marginTop: -Spacing.two,
  },
});
