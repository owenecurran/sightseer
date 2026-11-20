import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { PageLoader } from '@/components/ui/page-loader';
import { TagStickerGraphic } from '@/components/ui/tag-sticker-graphic';
import { VisitCard } from '@/components/visit-card';
import { MaxContentWidth, ScrollScreenEdges, Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import { getVisitsWithTag } from '@/lib/visit-tags';

// Every review carrying one tag: where a second tap on a tag's sticker leads,
// from the back of any postcard.
export default function TagScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session } = useAuth();
  const viewerId = session?.user.id;
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [label, setLabel] = useState<string | null>(null);
  const [visits, setVisits] = useState<FeedVisit[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !viewerId) return;
    let isActive = true;
    (async () => {
      try {
        const found = await getVisitsWithTag(slug, viewerId);
        if (!isActive) return;
        setLabel(found.label);
        setVisits(found.visits);
        const photoIds = found.visits.flatMap((visit) => visit.photoIds);
        if (photoIds.length > 0) {
          const urls = await getPhotoViewUrls(photoIds);
          if (isActive) setPhotoUrls(urls);
        }
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : 'Could not load these reviews.');
      }
    })();
    return () => {
      isActive = false;
    };
  }, [slug, viewerId]);

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

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView edges={ScrollScreenEdges} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed={`tag-${slug}`} />
          <View style={styles.title}>
            {slug && <TagStickerGraphic slug={slug} label={label ?? slug} size={52} />}
            <View style={styles.titleText}>
              <ThemedText type="displaySerif">{label ?? 'Tagged'}</ThemedText>
              <ThemedText type="caption">
                {visits && visits.length > 0
                  ? `${visits.length} review${visits.length === 1 ? '' : 's'} tagged this way`
                  : 'Reviews tagged this way'}
              </ThemedText>
            </View>
          </View>

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
          {visits?.length === 0 && !error && (
            <ThemedText type="caption">No reviews you can see carry this tag yet.</ThemedText>
          )}

          {visits?.map((visit, index) => (
            // The stamp hangs below its card; ordering the siblings keeps the
            // overhang over the next card (see the feed's own note).
            <View key={visit.id} style={{ zIndex: visits.length - index }} collapsable={false}>
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
        </ScrollView>
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
});
