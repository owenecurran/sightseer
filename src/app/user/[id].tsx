import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileMap } from '@/components/profile-map';
import { ProfilePromptsSection } from '@/components/profile-prompts-section';
import { UserCollectionsSection } from '@/components/user-collections-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { blockUser, isBlocking, unblockUser } from '@/lib/blocks';
import type { Database } from '@/lib/database.types';
import { followUser, getFollowCounts, getFollowStatus, unfollowOrCancelRequest } from '@/lib/follows';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { parseDefaultCamera } from '@/lib/map-layers';
import { getProfileShowcase, type ShowcaseVisit } from '@/lib/profile-showcase';
import { supabase } from '@/lib/supabase';

type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

function followLabel(status: FollowStatus | null): string {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return 'Follow';
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [user, setUser] = useState<UserRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [followStatus, setFollowStatus] = useState<FollowStatus | null>(null);
  const [followCounts, setFollowCounts] = useState({ following: 0, followers: 0 });
  const [totalVisits, setTotalVisits] = useState(0);
  const [latestVisit, setLatestVisit] = useState<ShowcaseVisit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!id || !session) return;
      setError(null);
      (async () => {
        try {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', id)
            .single();
          if (userError) throw userError;
          setUser(userData);

          const [avatars, status, counts, showcase, blocked] = await Promise.all([
            userData.avatar_r2_key
              ? getAvatarViewUrls([id])
              : Promise.resolve<Record<string, string>>({}),
            getFollowStatus(session.user.id, id),
            getFollowCounts(id),
            getProfileShowcase(id),
            isBlocking(session.user.id, id),
          ]);
          setAvatarUrl(avatars[id] ?? null);
          setFollowStatus(status);
          setFollowCounts(counts);
          setTotalVisits(showcase.totalVisits);
          setLatestVisit(showcase.latestVisit);
          setIsBlocked(blocked);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this profile.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id, session])
  );

  async function handleFollowToggle() {
    if (!session || !user) return;
    setError(null);
    setIsUpdatingFollow(true);
    try {
      if (followStatus === null) {
        const status = await followUser({
          followerId: session.user.id,
          followeeId: user.id,
          followeeIsPrivate: user.is_private,
        });
        setFollowStatus(status);
      } else {
        await unfollowOrCancelRequest(session.user.id, user.id);
        setFollowStatus(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that follow.');
    } finally {
      setIsUpdatingFollow(false);
    }
  }

  async function handleBlock() {
    if (!session || !user) return;
    setError(null);
    setIsUpdatingBlock(true);
    try {
      await blockUser(session.user.id, user.id);
      setIsBlocked(true);
      setConfirmingBlock(false);
      setFollowStatus(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block that user.');
    } finally {
      setIsUpdatingBlock(false);
    }
  }

  async function handleUnblock() {
    if (!session || !user) return;
    setError(null);
    setIsUpdatingBlock(true);
    try {
      await unblockUser(session.user.id, user.id);
      setIsBlocked(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock that user.');
    } finally {
      setIsUpdatingBlock(false);
    }
  }

  const isSelf = session?.user.id === id;
  const canSeeContent = !isBlocked && (!user?.is_private || followStatus === 'accepted' || isSelf);

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <View style={styles.contentWrap}>
            <Pressable onPress={() => router.back()}>
              <ThemedText type="link">← Back</ThemedText>
            </Pressable>

            <View style={styles.headerRow}>
              <Avatar uri={avatarUrl} name={user?.name ?? user?.handle} size={72} />
              <View style={styles.headerInfo}>
                <ThemedText type="displaySerif">{user?.name ?? user?.handle ?? 'Profile'}</ThemedText>
                {user?.handle && (
                  <ThemedText type="displaySerif" style={styles.handleText}>
                    @{user.handle}
                  </ThemedText>
                )}
                <ThemedText type="roundedStat" themeColor="sage">
                  {totalVisits} sight{totalVisits === 1 ? '' : 's'} seen
                </ThemedText>
              </View>
            </View>

            {user?.bio && <ThemedText type="default">{user.bio}</ThemedText>}

            {!isSelf && isBlocked && (
              <Button label="Unblock" variant="secondary" onPress={handleUnblock} loading={isUpdatingBlock} />
            )}

            {!isSelf && !isBlocked && (
              <View style={styles.followRow}>
                <Button
                  label={followLabel(followStatus)}
                  variant={followStatus === 'accepted' ? 'secondary' : 'primary'}
                  onPress={handleFollowToggle}
                  loading={isUpdatingFollow}
                />
                {confirmingBlock ? (
                  <View style={styles.blockConfirmRow}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Block this user?
                    </ThemedText>
                    <Pressable onPress={handleBlock} disabled={isUpdatingBlock}>
                      <ThemedText type="smallBold">Confirm</ThemedText>
                    </Pressable>
                    <Pressable onPress={() => setConfirmingBlock(false)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Cancel
                      </ThemedText>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setConfirmingBlock(true)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Block
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}

            <View style={styles.statsRow}>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/follow-list',
                    params: { type: 'following', userId: user?.id ?? '', name: user?.name ?? user?.handle ?? '' },
                  })
                }>
                <ThemedText type="statLine">{followCounts.following} following</ThemedText>
              </Pressable>
              <Pressable
                onPress={() =>
                  router.push({
                    pathname: '/follow-list',
                    params: { type: 'followers', userId: user?.id ?? '', name: user?.name ?? user?.handle ?? '' },
                  })
                }>
                <ThemedText type="statLine">{followCounts.followers} followers</ThemedText>
              </Pressable>
            </View>

            {error && <ThemedText type="small">{error}</ThemedText>}

            {!canSeeContent && (
              <ThemedText type="small" themeColor="textSecondary">
                {isBlocked ? 'You’ve blocked this account.' : 'This account is private.'}
              </ThemedText>
            )}

            {canSeeContent && latestVisit && (
              <Pressable
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: latestVisit.id } })}
                style={styles.borderedBox}>
                <ThemedText type="sectionLabel">Latest reviews</ThemedText>
                <View style={styles.latestReviewRow}>
                  <View style={styles.latestReviewText}>
                    <StretchText type="headline" fill>{latestVisit.places?.name ?? 'Unknown place'}</StretchText>
                  </View>
                  <ThemedText type="headline">›</ThemedText>
                </View>
              </Pressable>
            )}

            {canSeeContent && user && <ProfilePromptsSection userId={user.id} />}

            {canSeeContent && user && <UserCollectionsSection userId={user.id} />}

            {canSeeContent && user?.show_map && (
              <ThemedView type="backgroundElement" style={styles.neutralCard}>
                <ProfileMap
                  userId={user.id}
                  defaultLayers={user.map_default_layers}
                  defaultCamera={parseDefaultCamera(user)}
                  isOwnProfile={session?.user.id === user.id}
                />
              </ThemedView>
            )}
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
  followRow: {
    gap: Spacing.two,
  },
  blockConfirmRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    alignItems: 'center',
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
});
