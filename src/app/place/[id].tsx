import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { Database } from '@/lib/database.types';
import { getPlaceBreadcrumb } from '@/lib/places-cache';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type PlaceRow = Database['public']['Tables']['places']['Row'];

type PlaceVisit = {
  id: string;
  rating: number;
  note: string | null;
  users: { handle: string | null; name: string | null } | null;
  photos: { id: string; position: number }[];
};

export default function PlaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<PlaceRow | null>(null);
  const [breadcrumb, setBreadcrumb] = useState('');
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [visits, setVisits] = useState<PlaceVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setError(null);
      try {
        const [{ data: placeData, error: placeError }, { data: aggregate, error: aggregateError }, { data: visitsData, error: visitsError }] =
          await Promise.all([
            supabase.from('places').select('*').eq('id', id).single(),
            supabase.rpc('get_place_aggregate_rating', { target_place_id: id }).single(),
            supabase
              .from('visits')
              .select('id, rating, note, users!user_id(handle, name), photos(id, position)')
              .eq('place_id', id)
              .order('created_at', { ascending: false }),
          ]);
        if (placeError) throw placeError;
        if (aggregateError) throw aggregateError;
        if (visitsError) throw visitsError;

        setPlace(placeData);
        setBreadcrumb(await getPlaceBreadcrumb(placeData));
        setAvgRating(aggregate?.avg_rating ? Number(aggregate.avg_rating) : null);
        setReviewCount(aggregate?.review_count ? Number(aggregate.review_count) : 0);

        const typedVisits = visitsData as unknown as PlaceVisit[];
        setVisits(typedVisits);
        const photoIds = typedVisits.flatMap((v) => v.photos.map((p) => p.id));
        if (photoIds.length > 0) {
          setPhotoUrls(await getPhotoViewUrls(photoIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this place.');
      }
    })();
  }, [id]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">{place?.name ?? 'Place'}</ThemedText>
        {breadcrumb.length > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {breadcrumb}
          </ThemedText>
        )}
        <ThemedText type="default">
          {avgRating !== null ? `${avgRating.toFixed(1)} ★ · ${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'No reviews yet'}
        </ThemedText>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const visitPhotoUrls = [...item.photos]
              .sort((a, b) => a.position - b.position)
              .map((p) => photoUrls[p.id])
              .filter((url) => url != null);
            return (
              <ThemedView type="backgroundElement" style={styles.visitCard}>
                <PhotoGrid urls={visitPhotoUrls} />
                <View style={styles.visitInfo}>
                  <ThemedText type="smallBold">
                    {item.users?.name ?? item.users?.handle ?? 'Someone'}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.rating.toFixed(1)} ★
                    {item.note ? ` · ${item.note}` : ''}
                  </ThemedText>
                </View>
              </ThemedView>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
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
