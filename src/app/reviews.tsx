import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ReviewBrowser } from '@/components/review-browser';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useAuth } from '@/lib/auth-context';
import { getMyVisitItems, type BoardVisitItem } from '@/lib/boards';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

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
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

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

        </View>

        <View style={styles.browser}>
          <ReviewBrowser
            items={items}
            photoUrls={photoUrls}
            viewerId={session?.user.id}
            isOwner={isSelf}
            onRemove={handleRemove}
            removeMessage="Delete this review? This can't be undone."
            contentPaddingBottom={bottomInset}
          />
        </View>
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
  // The browser owns its own scrolling, so it takes the rest of the screen
  // and keeps the same reading column the header sits in.
  browser: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
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
