import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UserRow } from '@/components/user-row';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { listFollowers, listFollowing, type FollowListEntry } from '@/lib/follows';

export default function FollowListScreen() {
  const { type, userId, name } = useLocalSearchParams<{
    type: 'followers' | 'following';
    userId?: string;
    name?: string;
  }>();
  const { session } = useAuth();
  const [entries, setEntries] = useState<FollowListEntry[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const targetUserId = userId || session?.user.id;

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
        }
      })();
    }, [targetUserId, type])
  );

  const title = name
    ? `${name}'s ${type === 'followers' ? 'followers' : 'following'}`
    : type === 'followers'
      ? 'Followers'
      : 'Following';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
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
