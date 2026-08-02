import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { UserRow } from '@/components/user-row';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { listFollowers, listFollowing, removeFollower, type FollowListEntry } from '@/lib/follows';

export default function FollowListScreen() {
  const { type, userId, name } = useLocalSearchParams<{
    type: 'followers' | 'following';
    userId?: string;
    name?: string;
  }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [entries, setEntries] = useState<FollowListEntry[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const targetUserId = userId || session?.user.id;
  const isOwnFollowersList = type === 'followers' && targetUserId === session?.user.id;

  async function handleRemove(followerId: string) {
    if (!session) return;
    setError(null);
    setRemovingId(followerId);
    try {
      await removeFollower(session.user.id, followerId);
      setEntries((prev) => prev.filter((e) => e.id !== followerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that follower.');
    } finally {
      setRemovingId(null);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!targetUserId) return;
      setError(null);
      (async () => {
        try {
          const list =
            type === 'followers' ? await listFollowers(targetUserId) : await listFollowing(targetUserId);
          setEntries(list);
          const ids = list.map((u) => u.id);
          if (ids.length > 0) {
            setAvatarUrls(await getAvatarViewUrls(ids));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this list.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [targetUserId, type])
  );

  const title = name
    ? `${name}'s ${type === 'followers' ? 'followers' : 'following'}`
    : type === 'followers'
      ? 'Followers'
      : 'Following';

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={entries}
          keyExtractor={(item: FollowListEntry) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              <Pressable onPress={() => router.back()}>
                <ThemedText type="link">← Back</ThemedText>
              </Pressable>
              <ThemedText type="displaySerif">{title}</ThemedText>
              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}
            </>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              {type === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <UserRow
              name={item.name}
              handle={item.handle}
              avatarUrl={avatarUrls[item.id]}
              onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}
              trailing={
                isOwnFollowersList ? (
                  <Pressable onPress={() => handleRemove(item.id)} disabled={removingId === item.id} hitSlop={8}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Remove
                    </ThemedText>
                  </Pressable>
                ) : undefined
              }
            />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
});
