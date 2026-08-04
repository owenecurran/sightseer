import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommentsThread } from '@/components/comments-section';
import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { VisitActionsRow } from '@/components/visit-actions-row';
import { VisitMenu } from '@/components/visit-menu';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { likeVisit, unlikeVisit, type TaggedPlace } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import { getVisitDetail, type VisitDetail } from '@/lib/visit-detail';
import { useTheme } from '@/hooks/use-theme';

const CATEGORY_COLORS: Record<string, string> = {
  water: '#1E88E5',
  trail: '#8B5E3C',
  food_drink: '#D32F2F',
};

function categoryColor(category: TaggedPlace['category'], defaultColor: string): string {
  return (category && CATEGORY_COLORS[category]) || defaultColor;
}

function formatAuthorLine(authorName: string, taggedUserNames: string[]): string {
  if (taggedUserNames.length === 0) return authorName;
  if (taggedUserNames.length === 1) return `${authorName} with ${taggedUserNames[0]}`;
  return `${authorName} with ${taggedUserNames[0]} + ${taggedUserNames.length - 1} other${taggedUserNames.length > 2 ? 's' : ''}`;
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const theme = useTheme();
  const [visit, setVisit] = useState<VisitDetail | null | undefined>(undefined);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [isCopied, setIsCopied] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useEffect(() => {
    if (!id || !session) return;
    getVisitDetail(id, session.user.id)
      .then(async (result) => {
        setVisit(result);
        if (!result) return;
        setCommentCount(result.commentCount);
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
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

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
          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.headerRow}>
              <Avatar uri={avatarUrl} name={visit.authorName} size={32} />
              <ThemedText type="smallBold" style={styles.headerText}>
                {formatAuthorLine(visit.authorName, visit.taggedUserNames)}
              </ThemedText>
              <VisitMenu
                visitId={visit.id}
                isOwner={session?.user.id === visit.user_id}
                onDeleted={() => router.back()}
              />
            </View>

            <StretchText type="headline" fill>{visit.placeName}</StretchText>
            {visit.taggedPlaces.length > 0 && (
              <ThemedText type="small">
                {visit.taggedPlaces.map((place, index) => (
                  <ThemedText
                    key={place.name}
                    type="small"
                    style={{ color: categoryColor(place.category, theme.textSecondary) }}>
                    {index > 0 ? ' · ' : ''}
                    {place.name}
                  </ThemedText>
                ))}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {visit.rating != null ? `${visit.rating.toFixed(1)} ★` : 'Visited'}
              {visit.note ? ` · ${visit.note}` : ''}
            </ThemedText>

            {(() => {
              const photos = visit.photoIds
                .map((id, i) => ({ url: photoUrls[id], ratio: visit.photoAspectRatios[i] }))
                .filter((p): p is { url: string; ratio: number | null } => p.url != null);
              return <PhotoGrid urls={photos.map((p) => p.url)} aspectRatios={photos.map((p) => p.ratio)} />;
            })()}

            <VisitActionsRow
              visitId={visit.id}
              isLiked={visit.isLikedByMe}
              likeCount={visit.likeCount}
              onToggleLike={handleToggleLike}
              onShare={handleShare}
              isCopied={isCopied}
              isOwnerOrTagged={session?.user.id === visit.user_id || visit.isViewerTagged}
              commentCount={commentCount}
              isCommentsOpen={isCommentsOpen}
              onToggleComments={() => setIsCommentsOpen((prev) => !prev)}
            />

            {isCommentsOpen && (
              <CommentsThread visitId={visit.id} visitOwnerId={visit.user_id} onCountChange={setCommentCount} />
            )}
          </ThemedView>
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
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
});
