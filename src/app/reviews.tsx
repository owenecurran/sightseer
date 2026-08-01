import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { VisitMenu } from '@/components/visit-menu';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type OwnVisit = {
  id: string;
  rating: number;
  note: string | null;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

function photoIdsFor(visit: OwnVisit): string[] {
  return [...visit.photos].sort((a, b) => a.position - b.position).map((p) => p.id);
}

export default function AllReviewsScreen() {
  const { session } = useAuth();
  const [visits, setVisits] = useState<OwnVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      (async () => {
        try {
          const { data, error: fetchError } = await supabase
            .from('visits')
            .select('id, rating, note, places!place_id(name), photos(id, position)')
            .eq('user_id', session.user.id)
            .order('created_at', { ascending: false });
          if (fetchError) throw fetchError;
          const ownVisits = data as unknown as OwnVisit[];
          setVisits(ownVisits);

          const photoIds = ownVisits.flatMap((v) => v.photos.map((p) => p.id));
          if (photoIds.length > 0) {
            setPhotoUrls(await getPhotoViewUrls(photoIds));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load your reviews.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session])
  );

  function handleVisitDeleted(visitId: string) {
    setVisits((prev) => prev.filter((v) => v.id !== visitId));
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={visits}
          keyExtractor={(item: OwnVisit) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
              <Pressable onPress={() => router.back()}>
                <ThemedText type="link">← Back</ThemedText>
              </Pressable>
              <ThemedText type="displaySerif">Your reviews</ThemedText>
              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.contentWrap, styles.visitRow]}>
              <Pressable
                style={styles.visitInfo}
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}>
                <ThemedText type="headline">{item.places?.name ?? 'Unknown place'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.rating.toFixed(1)} ★
                  {item.note ? ` · ${item.note}` : ''}
                </ThemedText>
                <PhotoGrid urls={photoIdsFor(item).map((id) => photoUrls[id]).filter((url) => url != null)} />
              </Pressable>
              <VisitMenu visitId={item.id} isOwner onDeleted={() => handleVisitDeleted(item.id)} />
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
  // paddingBottom belongs on the FlatList's own scrollable content, not the
  // non-scrolling safeArea wrapper above — same bug/fix as index.tsx/boards.tsx.
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  visitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  visitInfo: {
    flex: 1,
    gap: Spacing.half,
  },
});
