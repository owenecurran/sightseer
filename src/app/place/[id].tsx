import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { getVisitsForPlace, type FeedVisit } from '@/lib/feed';
import type { Database } from '@/lib/database.types';
import { getPlaceBreadcrumb } from '@/lib/places-cache';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type PlaceRow = Database['public']['Tables']['places']['Row'];
type SortMode = 'recent' | 'popular';

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [place, setPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [visits, setVisits] = useState<FeedVisit[]>([]);
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useEffect(() => {
    if (!id || !session) return;
    (async () => {
      setError(null);
      try {
        const [{ data: placeData, error: placeError }, { data: aggregate, error: aggregateError }, visitsData] =
          await Promise.all([
            supabase.from('places').select('*').eq('id', id).single(),
            supabase.rpc('get_place_aggregate_rating', { target_place_id: id }).single(),
            getVisitsForPlace(id, session.user.id),
          ]);
        if (placeError) throw placeError;
        if (aggregateError) throw aggregateError;

        setPlace(placeData);
        setBreadcrumb(await getPlaceBreadcrumb(placeData));
        setAvgRating(aggregate?.avg_rating ? Number(aggregate.avg_rating) : null);
        setReviewCount(aggregate?.review_count ? Number(aggregate.review_count) : 0);
        setVisits(visitsData);

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

  if (!hasLoadedOnce) return <PageLoader />;

  // Not a real "photo of the place" — no such source exists (places has no
  // photo column, Google Places field mask never requests one). Standing in
  // with the first photo of the most-recent review, the same fallback
  // already used for the map's preview card (nearby-places.ts).
  const heroPhotoId = visits[0]?.photoIds[0];
  const heroPhotoUrl = heroPhotoId ? photoUrls[heroPhotoId] : undefined;

  const sortedVisits =
    sortMode === 'popular' ? [...visits].sort((a, b) => b.likeCount - a.likeCount) : visits;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={sortedVisits}
          keyExtractor={(item: FeedVisit) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
              <Pressable onPress={() => router.back()}>
                <ThemedText type="link">← Back</ThemedText>
              </Pressable>

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
                <View style={styles.sortRow}>
                  {(['recent', 'popular'] as const).map((mode) => (
                    <Pressable key={mode} onPress={() => setSortMode(mode)}>
                      <ThemedView type={sortMode === mode ? 'backgroundSelected' : 'backgroundElement'} style={styles.sortChip}>
                        <ThemedText type="small" themeColor={sortMode === mode ? 'text' : 'textSecondary'}>
                          {mode === 'recent' ? 'Most recent' : 'Popular'}
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          }
          renderItem={({ item }: { item: FeedVisit }) => {
            const visitPhotoUrls = item.photoIds.map((photoId) => photoUrls[photoId]).filter((url) => url != null);
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}
                style={styles.contentWrap}>
                <ThemedView type="backgroundElement" style={styles.visitCard}>
                  <PhotoGrid urls={visitPhotoUrls} aspectRatios={item.photoAspectRatios} />
                  <View style={styles.visitInfo}>
                    <ThemedText type="smallBold">{item.authorName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.rating != null ? `${item.rating.toFixed(1)} ★` : 'Visited'}
                      {item.note ? ` · ${item.note}` : ''}
                      {item.likeCount > 0 ? ` · ${item.likeCount} like${item.likeCount === 1 ? '' : 's'}` : ''}
                    </ThemedText>
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
  sortRow: {
    flexDirection: 'row',
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
