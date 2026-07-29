import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileMap } from '@/components/profile-map';
import { ProfilePromptsSection } from '@/components/profile-prompts-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
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
import { getProfileShowcase, type ShowcaseVisit } from '@/lib/profile-showcase';
import { supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [totalVisits, setTotalVisits] = useState(0);
  const [latestVisit, setLatestVisit] = useState<ShowcaseVisit | null>(null);
  const [followCounts, setFollowCounts] = useState({ following: 0, followers: 0 });
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      (async () => {
        try {
          const [incoming, counts, showcase] = await Promise.all([
            listIncomingFollowRequests(session.user.id),
            getFollowCounts(session.user.id),
            getProfileShowcase(session.user.id),
          ]);
          setRequests(incoming);
          setFollowCounts(counts);
          setTotalVisits(showcase.totalVisits);
          setLatestVisit(showcase.latestVisit);

          if (profile?.avatar_r2_key) {
            const urls = await getAvatarViewUrls([session.user.id]);
            setAvatarUrl(urls[session.user.id] ?? null);
          } else {
            setAvatarUrl(null);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load your profile.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session, profile?.avatar_r2_key])
  );

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

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
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

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
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

            <Pressable onPress={() => router.push('/reviews')} style={styles.borderedBox}>
              <ThemedText type="sectionLabel">Latest reviews</ThemedText>
              <View style={styles.latestReviewRow}>
                <View style={styles.latestReviewText}>
                  <StretchText type="headline">{latestVisit?.places?.name ?? 'No reviews yet'}</StretchText>
                </View>
                <ThemedText type="headline">›</ThemedText>
              </View>
            </Pressable>

            <Pressable onPress={() => router.push('/edit-profile')}>
              <ThemedText type="small" themeColor="sage">
                Edit profile
              </ThemedText>
            </Pressable>

            {error && <ThemedText type="small">{error}</ThemedText>}

            {session && <ProfilePromptsSection userId={session.user.id} />}

            {session && profile?.show_map && (
              <ThemedView type="backgroundElement" style={styles.neutralCard}>
                <ProfileMap userId={session.user.id} />
              </ThemedView>
            )}

            {requests.length > 0 && (
              <View style={styles.section}>
                <ThemedText type="sectionLabel">Follow requests</ThemedText>
                {requests.map((request) => (
                  <ThemedView key={request.follower_id} type="backgroundElement" style={styles.requestRow}>
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
                  </ThemedView>
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
              <Button label="Sign out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
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
    paddingBottom: BottomTabInset + Spacing.four,
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
    gap: Spacing.half,
  },
  borderedBox: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  latestReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  latestReviewText: {
    flex: 1,
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
