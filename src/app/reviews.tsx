import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { BoardMapView } from '@/components/board-views/map-view';
import { FullReviewsView } from '@/components/board-views/full-reviews-view';
import { ImagesGridView } from '@/components/board-views/images-grid-view';
import { ListView } from '@/components/board-views/list-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getMyVisitItems, type BoardVisitItem } from '@/lib/boards';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type ViewMode = 'list' | 'full' | 'images' | 'map';

const VIEW_MODES: { key: ViewMode; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'full', label: 'Full reviews' },
  { key: 'images', label: 'Images' },
  { key: 'map', label: 'Map' },
];

// `userId` optional (not a required route param the way collections/[userId]
// needs one) — plain `/reviews` from profile.tsx's own "Latest reviews"
// still means "mine", same as before this screen could show anyone else's;
// user/[id].tsx's own "Latest reviews" now passes its target explicitly
// instead of that screen needing a second, near-duplicate route file.
export default function AllReviewsScreen() {
  const { userId: routeUserId } = useLocalSearchParams<{ userId?: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [targetUserName, setTargetUserName] = useState<string | null>(null);
  const [items, setItems] = useState<BoardVisitItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const targetUserId = routeUserId ?? session?.user.id;
  const isSelf = Boolean(session && targetUserId === session.user.id);

  useFocusEffect(
    useCallback(() => {
      if (!session || !targetUserId) return;
      setError(null);
      (async () => {
        try {
          const [myItems] = await Promise.all([
            getMyVisitItems(targetUserId),
            isSelf
              ? Promise.resolve()
              : supabase
                  .from('users')
                  .select('name, handle')
                  .eq('id', targetUserId)
                  .single()
                  .then(({ data }) => setTargetUserName(data?.name ?? data?.handle ?? null)),
          ]);
          setItems(myItems);

          const photoIds = myItems.flatMap((item) => item.photoIds);
          if (photoIds.length > 0) {
            setPhotoUrls(await getPhotoViewUrls(photoIds));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load these reviews.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session, targetUserId, isSelf])
  );

  async function handleRemove(visitId: string) {
    setError(null);
    const { error: deleteError } = await supabase.from('visits').delete().eq('id', visitId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== visitId));
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackLink seed="reviews" />

          <ThemedText type="displaySerif">
            {isSelf ? 'Your reviews' : targetUserName ? `${targetUserName}'s reviews` : 'Reviews'}
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <View style={styles.modeRow}>
            {VIEW_MODES.map((mode) => (
              <Pressable key={mode.key} onPress={() => setViewMode(mode.key)}>
                <ThemedView type={viewMode === mode.key ? 'backgroundSelected' : 'backgroundElement'} style={styles.modeChip}>
                  <ThemedText type="small" themeColor={viewMode === mode.key ? 'text' : 'textSecondary'}>
                    {mode.label}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <ThemedText type="small" themeColor="textSecondary">
              No reviews yet.
            </ThemedText>
          </View>
        ) : viewMode === 'full' ? (
          <FullReviewsView items={items} photoUrls={photoUrls} />
        ) : viewMode === 'map' ? (
          <BoardMapView items={items} />
        ) : (
          <Animated.ScrollView
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
            showsVerticalScrollIndicator={false}
            onScroll={scrollHandler}
            scrollEventThrottle={16}>
            {viewMode === 'images' ? (
              <ImagesGridView items={items} photoUrls={photoUrls} />
            ) : (
              <ListView
                items={items}
                photoUrls={photoUrls}
                isOwner={isSelf}
                onRemove={handleRemove}
                removeMessage="Delete this review? This can't be undone."
              />
            )}
          </Animated.ScrollView>
        )}
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
    paddingTop: Spacing.four + TopTabInset,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  modeChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
