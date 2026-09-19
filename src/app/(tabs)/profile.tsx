import { router } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileMap } from '@/components/profile-map';
import { ProfilePromptsSection } from '@/components/profile-prompts-section';
import { UserCollectionsSection } from '@/components/user-collections-section';
import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { TeaserCard } from '@/components/ui/teaser-card';
import { VisitCard } from '@/components/visit-card';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls, uploadAvatar } from '@/lib/avatar';
import {
  acceptFollowRequest,
  getFollowCounts,
  listIncomingFollowRequests,
  rejectFollowRequest,
  type IncomingFollowRequest,
} from '@/lib/follows';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { parseDefaultCamera } from '@/lib/map-layers';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { parseSectionOrder, type ProfileSectionKey } from '@/lib/profile-sections';
import { firstPhotoId, getProfileShowcase, type ShowcaseVisit } from '@/lib/profile-showcase';
import { getTaggedInShowcase, type TaggedVisit } from '@/lib/tagged-visits';
import { getVisitsByIds, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { shareText } from '@/lib/share';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [latestVisit, setLatestVisit] = useState<ShowcaseVisit | null>(null);
  const [latestTagged, setLatestTagged] = useState<TaggedVisit | null>(null);
  const [teaserPhotoUrls, setTeaserPhotoUrls] = useState<Record<string, string>>({});
  // The latest review as the real card rather than a tile. Hydrated
  // separately because a ShowcaseVisit is a name and a photo id — a postcard
  // needs the likes, tags and card stock too.
  const [latestCard, setLatestCard] = useState<FeedVisit | null>(null);
  const [latestCardPhotos, setLatestCardPhotos] = useState<Record<string, string>>({});
  const [followCounts, setFollowCounts] = useState({ following: 0, followers: 0 });
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  // The postcard for the reviews section, hydrated once the showcase knows
  // which review it is.
  //
  // Its own effect rather than a few more lines inside loadProfile: a nested
  // try/catch in there cost that callback its memoization outright (React
  // Compiler: "Existing memoization could not be preserved"), and the two
  // are separate concerns anyway — the profile can finish loading while its
  // card is still on the way.
  useEffect(() => {
    const latestId = latestVisit?.id;
    if (!session || !latestId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [hydrated] = await getVisitsByIds([latestId], session.user.id);
        if (cancelled) return;
        setLatestCard(hydrated ?? null);
        if (hydrated && hydrated.photoIds.length > 0) {
          const urls = await getPhotoViewUrls(hydrated.photoIds);
          if (!cancelled) setLatestCardPhotos(urls);
        }
      } catch {
        // The section falls back to its tile, which is what it always was.
        if (!cancelled) setLatestCard(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, latestVisit?.id]);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const [incoming, counts, showcase, taggedShowcase] = await Promise.all([
        listIncomingFollowRequests(session.user.id),
        getFollowCounts(session.user.id),
        getProfileShowcase(session.user.id),
        getTaggedInShowcase(session.user.id),
      ]);
      setRequests(incoming);
      setFollowCounts(counts);
      setTotalVisits(showcase.totalVisits);
      setLatestVisit(showcase.latestVisit);
      setLatestTagged(taggedShowcase.latestTagged);

      const teaserPhotoIds = [firstPhotoId(showcase.latestVisit), taggedShowcase.latestTagged?.photoIds?.[0]].filter(
        (id): id is string => id != null
      );
      setTeaserPhotoUrls(teaserPhotoIds.length > 0 ? await getPhotoViewUrls(teaserPhotoIds) : {});

      if (profile?.avatar_r2_key) {
        const urls = await getAvatarViewUrls([session.user.id]);
        setAvatarUrl(urls[session.user.id] ?? null);
      } else {
        setAvatarUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your profile.');
    }
  }, [session, profile?.avatar_r2_key]);

  useTabFocusEffect(
    4,
    useCallback(() => {
      loadProfile().finally(() => setHasLoadedOnce(true));
    }, [loadProfile])
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadProfile();
    setIsRefreshing(false);
  }

  async function handleAccept(followerId: string) {
    if (!session) return;
    setError(null);
    try {
      await acceptFollowRequest(followerId, session.user.id);
      setRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept that request.');
    }
  }

  async function handleReject(followerId: string) {
    if (!session) return;
    setError(null);
    try {
      await rejectFollowRequest(followerId, session.user.id);
      setRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject that request.');
    }
  }

  async function handlePickAvatar() {
    if (!session) return;
    setError(null);
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required to set a profile picture.');
      return;
    }
    if (!result) return;

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar({ userId: session.user.id, uri: result.uri, mimeType: result.mimeType });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const sectionMap: Record<ProfileSectionKey, ReactNode> = {
    // The real postcard, not a tile of one — the same card the feed and a
    // board draw. The tile is kept for the case where there is nothing to
    // draw yet, or where hydrating it did not work.
    latest_reviews: latestCard ? (
      <View key="latest_reviews" style={styles.section}>
        <ThemedText type="sectionLabel">Latest reviews</ThemedText>
        <VisitCard
          visit={latestCard}
          photoUrls={latestCardPhotos}
          isOwner={latestCard.user_id === session?.user.id}
          isCopied={false}
          onToggleLike={() => {
            if (!session) return;
            const nowLiked = !latestCard.isLikedByMe;
            setLatestCard({
              ...latestCard,
              isLikedByMe: nowLiked,
              likeCount: latestCard.likeCount + (nowLiked ? 1 : -1),
            });
            void (nowLiked
              ? likeVisit(session.user.id, latestCard.id)
              : unlikeVisit(session.user.id, latestCard.id));
          }}
          onShare={() => {
            void shareText(`${latestCard.placeName}
${latestCard.note ?? ''}`.trim());
          }}
          onDeleted={() => setLatestCard(null)}
        />
        {/* The way through to the rest of them.
            The section used to BE the link — the whole tile pushed /reviews —
            but the postcard's own surface is spoken for now: it flips, its
            photograph zooms, and two taps like it. So the way on has to be
            its own control, and a real button rather than the small "See all"
            this first had beside the heading, which was easy to miss. */}
        <Button
          label="See all reviews"
          variant="secondary"
          onPress={() => router.push('/reviews')}
        />
      </View>
    ) : (
      <TeaserCard
        key="latest_reviews"
        label="Latest reviews"
        title={latestVisit?.places?.name ?? 'No reviews yet'}
        thumbnailUrl={teaserPhotoUrls[firstPhotoId(latestVisit) ?? '']}
        onPress={() => router.push('/reviews')}
      />
    ),
    tagged_in: (
      <TeaserCard
        key="tagged_in"
        label="Tagged in"
        title={latestTagged?.placeName ?? 'Not tagged in anything yet'}
        thumbnailUrl={teaserPhotoUrls[latestTagged?.photoIds?.[0] ?? '']}
        onPress={() => router.push('/tagged-in')}
      />
    ),
    prompts: session ? <ProfilePromptsSection key="prompts" userId={session.user.id} /> : null,
    collections: session ? <UserCollectionsSection key="collections" userId={session.user.id} /> : null,
    map:
      session && profile?.show_map ? (
        <PaperPanel key="map" seed="profile-map" style={styles.neutralCard}>
          <ProfileMap
            userId={session.user.id}
            defaultLayers={profile.map_default_layers}
            defaultCamera={parseDefaultCamera(profile)}
            isOwnProfile
            onCameraLocked={refreshProfile}
          />
        </PaperPanel>
      ) : null,
  };
  const sectionOrder = parseSectionOrder(profile?.profile_section_order);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset + Spacing.four }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor={theme.sage} />
          }>
          <View style={styles.contentWrap}>
            <View style={styles.headerRow}>
              <Pressable onPress={handlePickAvatar} disabled={isUploadingAvatar}>
                <Avatar uri={avatarUrl} name={profile?.name ?? profile?.handle} size={72} />
              </Pressable>

              <View style={styles.headerInfo}>
                <ThemedText type="displaySerif">{profile?.name ?? profile?.handle ?? 'Profile'}</ThemedText>
                {profile?.handle && <ThemedText type="displaySerif" style={styles.handleText}>@{profile.handle}</ThemedText>}
                <ThemedText type="roundedStat" themeColor="sage">
                  {totalVisits} sight{totalVisits === 1 ? '' : 's'} seen
                </ThemedText>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Pressable onPress={() => router.push({ pathname: '/follow-list', params: { type: 'following' } })}>
                <ThemedText type="statLine">{followCounts.following} following</ThemedText>
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/follow-list', params: { type: 'followers' } })}>
                <ThemedText type="statLine">{followCounts.followers} followers</ThemedText>
              </Pressable>
            </View>

            {profile?.bio && <ThemedText type="default">{profile.bio}</ThemedText>}

            <Pressable onPress={() => router.push('/edit-profile')}>
              <ThemedText type="small" themeColor="sage">
                Edit profile
              </ThemedText>
            </Pressable>

            {error && <ThemedText type="small">{error}</ThemedText>}

            {sectionOrder.map((key) => sectionMap[key])}

            {requests.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="sectionLabel">Follow requests</ThemedText>
                {requests.map((request) => (
                  <PaperPanel key={request.follower_id} seed={`request-${request.follower_id}`} style={styles.requestRow}>
                    <ThemedText type="default">{request.users?.name ?? request.users?.handle ?? 'Someone'}</ThemedText>
                    <View style={styles.requestActions}>
                      <Pressable onPress={() => handleAccept(request.follower_id)}>
                        <ThemedText type="smallBold" themeColor="sage">
                          Accept
                        </ThemedText>
                      </Pressable>
                      <Pressable onPress={() => handleReject(request.follower_id)}>
                        <ThemedText type="small">Reject</ThemedText>
                      </Pressable>
                    </View>
                  </PaperPanel>
                ))}
              </View>
            )}

            <View style={styles.footerSection}>
              {profile?.is_admin && (
                <Pressable onPress={() => router.push('/moderation')}>
                  <ThemedText type="small" themeColor="sage">
                    Reports
                  </ThemedText>
                </Pressable>
              )}
              {profile?.is_admin && (
                <Pressable onPress={() => router.push('/admin/articles')}>
                  <ThemedText type="small" themeColor="sage">
                    Articles
                  </ThemedText>
                </Pressable>
              )}
              <Button label="Settings" variant="secondary" onPress={() => router.push('/settings')} />
            </View>
          </View>
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  contentWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: Spacing.half,
  },
  handleText: {
    fontSize: 16,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  neutralCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  footerSection: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
});
