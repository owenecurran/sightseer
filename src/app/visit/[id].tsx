import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { VisitCard } from '@/components/visit-card';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getVisitsByIds, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import { goBack } from '@/lib/navigation';

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  // The full card shape rather than VisitDetail, which carries no card_*
  // columns — a postcard built from that would be printed on different stock
  // to the one in the feed, for the same review.
  const [visit, setVisit] = useState<FeedVisit | null | undefined>(undefined);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useEffect(() => {
    if (!id || !session) return;
    // Access is enforced by RLS either way, so an empty result means the same
    // thing getVisitDetail's null did: not available to this viewer.
    getVisitsByIds([id], session.user.id)
      .then(async ([result]) => {
        setVisit(result ?? null);
        if (!result) return;
        const [photos, avatars] = await Promise.all([
          result.photoIds.length > 0 ? getPhotoViewUrls(result.photoIds) : Promise.resolve({}),
          getAvatarViewUrls([result.user_id]),
        ]);
        setPhotoUrls(photos);
        setAvatarUrl(avatars[result.user_id] ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load that review.'));
  }, [id, session]);

  async function handleToggleLike() {
    if (!session || !visit) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(session.user.id, visit.id);
      } else {
        await likeVisit(session.user.id, visit.id);
      }
      setVisit((prev) =>
        prev
          ? { ...prev, isLikedByMe: !prev.isLikedByMe, likeCount: prev.likeCount + (prev.isLikedByMe ? -1 : 1) }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that like.');
    }
  }

  async function handleShare() {
    if (!visit) return;
    const message = `${visit.authorName} ${visit.rating != null ? `rated ${visit.placeName} ${visit.rating.toFixed(1)}/10` : `visited ${visit.placeName}`}${
      visit.note ? `: "${visit.note}"` : ''
    } on Sightseer.`;
    const result = await shareText(message);

    if (result === 'unsupported') {
      setError('Sharing is not supported in this browser.');
      return;
    }
    if (result === 'error') {
      setError('Could not copy that visit — please try again.');
      return;
    }
    if (result === 'copied') {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }

  if (visit === undefined) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
        <BackLink seed="[id]" />

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {visit === null && (
          <ThemedText type="small" themeColor="textSecondary">
            This review isn’t available.
          </ThemedText>
        )}

        {visit && (
          // The same postcard the feed draws, not a second assembly of the
          // same parts. This screen used to hand-build one — author row,
          // FeedCardHeaderText, a PhotoGrid or a map, an actions row, a
          // comments thread — which is precisely how the two drifted apart.
          // The card brings all of that with it.
          <VisitCard
            visit={visit}
            photoUrls={photoUrls}
            avatarUrl={avatarUrl ?? undefined}
            isOwner={session?.user.id === visit.user_id}
            isCopied={isCopied}
            onToggleLike={handleToggleLike}
            onShare={handleShare}
            onDeleted={() => goBack()}
            // Reaching this screen IS choosing a review, so the comments are
            // already open — the one behaviour worth keeping from the version
            // this replaced.
            initialCommentsOpen
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
  scrollContent: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
});
