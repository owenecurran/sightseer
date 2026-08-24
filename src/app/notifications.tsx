import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';

function relativeTime(isoDate: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

// A real switch (not if/else) is a compile-time exhaustiveness check — the
// previous if/else version's `else` branch silently assumed "must be
// travel_book_item_added", which would have quietly mis-rendered every one
// of the 7 new types added in this batch had it been left as-is.
function describe(notification: AppNotification): string {
  switch (notification.type) {
    case 'board_item_added':
      return `${notification.actorName} added something new to "${notification.boardName ?? 'a board'}"`;
    case 'travel_book_item_added':
      return `${notification.actorName} added something new to "${notification.travelBookTitle ?? 'a travel book'}"`;
    case 'board_saved':
      return `${notification.actorName} saved your board "${notification.boardName ?? 'a board'}"`;
    case 'travel_book_saved':
      return `${notification.actorName} saved your travel book "${notification.travelBookTitle ?? 'a travel book'}"`;
    case 'like':
      return `${notification.actorName} liked your review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'comment':
      return `${notification.actorName} commented on your review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'friend_visit':
      return `${notification.actorName} posted a new review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'follow':
      return `${notification.actorName} started following you`;
    case 'nearby_review_digest':
      return `${notification.digestReviewCount ?? 0} new review${notification.digestReviewCount === 1 ? '' : 's'} at ${notification.digestPlaceCount ?? 0} place${notification.digestPlaceCount === 1 ? '' : 's'} you've been`;
  }
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      (async () => {
        try {
          const list = await listNotifications(session.user.id);
          setNotifications(list);
          // Mark-as-read on view, not on individual tap — matches this
          // screen's own purpose (a feed you check), not a to-do list.
          if (list.some((n) => !n.isRead)) {
            await markAllNotificationsRead(session.user.id);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load notifications.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session])
  );

  async function handlePress(notification: AppNotification) {
    if (!notification.isRead) {
      markNotificationRead(notification.id).catch(() => {});
    }
    switch (notification.type) {
      case 'board_item_added':
      case 'board_saved':
        if (notification.boardId) {
          router.push({ pathname: '/board/[id]', params: { id: notification.boardId } });
        }
        break;
      case 'travel_book_item_added':
      case 'travel_book_saved':
        if (notification.travelBookId) {
          router.push({ pathname: '/travel-book/[id]', params: { id: notification.travelBookId } });
        }
        break;
      case 'like':
      case 'comment':
      case 'friend_visit':
        if (notification.visitId) {
          router.push({ pathname: '/visit/[id]', params: { id: notification.visitId } });
        }
        break;
      case 'follow':
        if (notification.actorUserId) {
          router.push({ pathname: '/user/[id]', params: { id: notification.actorUserId } });
        }
        break;
      case 'nearby_review_digest':
        // Multi-place aggregate — no single natural destination to jump to.
        break;
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={notifications}
          keyExtractor={(item: AppNotification) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <>
              <BackLink seed="notifications" />
              <ThemedText type="displaySerif">Notifications</ThemedText>
              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}
            </>
          }
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary">
              No notifications yet. Save a board or travel book with notifications on to hear about new additions.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => handlePress(item)}>
              <ThemedView type={item.isRead ? 'backgroundElement' : 'backgroundSelected'} style={styles.row}>
                <ThemedText type="default">{describe(item)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {relativeTime(item.createdAt)}
                </ThemedText>
              </ThemedView>
            </Pressable>
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
  row: {
    gap: Spacing.half,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
