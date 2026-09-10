import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks';

// Its own screen rather than a block on Settings, because the list has no
// ceiling — one person blocked reads fine inline, thirty pushes everything
// below it off the page. Settings now shows only the count.
export default function BlockedAccountsScreen() {
  const { session } = useAuth();
  const scrollHandler = useHideOnScrollHandler();
  const bottomInset = useBottomTabInset();

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listBlockedUsers(session.user.id)
        .then(setBlockedUsers)
        .catch((err) =>
          setError(err instanceof Error ? err.message : 'Could not load blocked accounts.')
        )
        .finally(() => setHasLoadedOnce(true));
    }, [session])
  );

  async function handleUnblock(blockedId: string) {
    if (!session) return;
    setError(null);
    setUnblockingId(blockedId);
    try {
      await unblockUser(session.user.id, blockedId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unblock that account.');
    } finally {
      setUnblockingId(null);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="blocked-accounts" />

          <ThemedText type="displaySerif">Blocked</ThemedText>

          <ThemedText type="small" themeColor="textSecondary">
            Blocked accounts cannot see your profile or reviews, and you will not see theirs.
          </ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {blockedUsers.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              You have not blocked anyone.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {blockedUsers.map((user) => (
                <ThemedView key={user.id} type="backgroundElement" style={styles.card}>
                  <View style={styles.identity}>
                    <ThemedText type="smallBold">
                      {user.name ?? user.handle ?? 'Someone'}
                    </ThemedText>
                    {/* Only when it adds something — for an account with no
                        name the handle is already the line above. */}
                    {user.name && user.handle && (
                      <ThemedText type="small" themeColor="textSecondary">
                        @{user.handle}
                      </ThemedText>
                    )}
                  </View>
                  <Button
                    label="Unblock"
                    variant="secondary"
                    onPress={() => handleUnblock(user.id)}
                    loading={unblockingId === user.id}
                    style={styles.unblock}
                  />
                </ThemedView>
              ))}
            </View>
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
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  // Takes the slack so a long name wraps rather than pushing the button off
  // the row.
  identity: {
    flex: 1,
    gap: Spacing.half,
  },
  // Sized to its label instead of stretching across the row, which is what
  // a full-width Button would do inside a row-direction card.
  unblock: {
    flexShrink: 0,
  },
});
