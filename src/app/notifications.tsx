import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { LoadableImage } from '@/components/ui/loadable-image';
import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getPhotoThumbUrls } from '@/lib/photo-view';
import { followUser, listFollowing } from '@/lib/follows';
import {
  actorSummary,
  groupNotifications,
  listNotifications,
  type NotificationGroup,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from '@/lib/notifications';

// How many faces a grouped row shows before the names take over.
const MAX_FACES = 3;
const AVATAR_SIZE = 34;
const PREVIEW_SIZE = 48;

// 'working' is its own state rather than a separate boolean: the button has
// to stop being pressable the moment it is pressed, and a private account
// lands on 'pending' rather than 'following'.
type FollowState = 'none' | 'following' | 'pending' | 'working';

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
function describe(notification: AppNotification, actors: { name: string }[]): string {
  // Likes are the one type that can carry several people — see
  // groupNotifications. Everything else names its single actor.
  if (notification.type === 'like') {
    return `${actorSummary(actors)} liked your review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
  }

  switch (notification.type) {
    case 'board_item_added':
      return `${notification.actorName} added something new to "${notification.boardName ?? 'a board'}"`;
    case 'travel_book_item_added':
      return `${notification.actorName} added something new to "${notification.travelBookTitle ?? 'a travel book'}"`;
    case 'board_saved':
      return `${notification.actorName} saved your board "${notification.boardName ?? 'a board'}"`;
    case 'travel_book_saved':
      return `${notification.actorName} saved your travel book "${notification.travelBookTitle ?? 'a travel book'}"`;
    case 'comment':
      return `${notification.actorName} commented on your review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'friend_visit':
      return `${notification.actorName} posted a new review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'tagged':
      return `${notification.actorName} tagged you in a review${notification.visitPlaceName ? ` of ${notification.visitPlaceName}` : ''}`;
    case 'follow':
      return `${notification.actorName} started following you`;
    case 'friend_review_digest': {
      const missed = notification.digestReviewCount ?? 0;
      return `You missed ${missed} review${missed === 1 ? '' : 's'} from people you follow`;
    }
    case 'nearby_review_digest':
      return `${notification.digestReviewCount ?? 0} new review${notification.digestReviewCount === 1 ? '' : 's'} at ${notification.digestPlaceCount ?? 0} place${notification.digestPlaceCount === 1 ? '' : 's'} you've been`;
  }
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  // Keyed by photo id. Thumbnails, not originals — these are 48pt squares,
  // and the backfill means the small copies actually exist for the backlog.
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  // Who the viewer already follows, of the people who appear here. Drives the
  // follow-back button: someone who followed you and whom you already follow
  // needs no button, only the word for it.
  const [followBack, setFollowBack] = useState<Record<string, FollowState>>({});
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

          // Faces, and who is already followed. Second pass on purpose:
          // neither is worth holding the list blank for, and both depend on
          // who turned out to be in it.
          const actorIds = [
            ...new Set(list.map((n) => n.actorUserId).filter((id): id is string => id != null)),
          ];
          const previewPhotoIds = [
            ...new Set(list.map((n) => n.visitPhotoId).filter((id): id is string => id != null)),
          ];
          if (actorIds.length > 0) {
            const [avatars, following, previews] = await Promise.all([
              getAvatarViewUrls(actorIds),
              listFollowing(session.user.id),
              previewPhotoIds.length > 0
                ? getPhotoThumbUrls(previewPhotoIds)
                : Promise.resolve({}),
            ]);
            setAvatarUrls(avatars);
            setPreviewUrls(previews);
            const followed = new Set(following.map((entry) => entry.id));
            setFollowBack(
              Object.fromEntries(
                list
                  .filter((n) => n.type === 'follow' && n.actorUserId)
                  .map((n) => [n.actorUserId!, followed.has(n.actorUserId!) ? 'following' : 'none']),
              ),
            );
          }
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

  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  async function handleFollowBack(notification: AppNotification) {
    const actorId = notification.actorUserId;
    if (!session || !actorId) return;
    setFollowBack((current) => ({ ...current, [actorId]: 'working' }));
    try {
      const status = await followUser({
        followerId: session.user.id,
        followeeId: actorId,
        followeeIsPrivate: notification.actorIsPrivate,
      });
      // A private account turns the press into a REQUEST, not a follow, and
      // the row has to say so — otherwise it reads as done when it is not.
      setFollowBack((current) => ({
        ...current,
        [actorId]: status === 'accepted' ? 'following' : 'pending',
      }));
    } catch {
      setFollowBack((current) => ({ ...current, [actorId]: 'none' }));
    }
  }

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
      case 'tagged':
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
          data={groups}
          keyExtractor={(item: NotificationGroup) => item.key}
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
          renderItem={({ item }: { item: NotificationGroup }) => {
            const actorId = item.latest.actorUserId;
            const state = actorId ? followBack[actorId] : undefined;
            return (
              <Pressable onPress={() => handlePress(item.latest)}>
                <ThemedView
                  type={item.isRead ? 'backgroundElement' : 'backgroundSelected'}
                  style={styles.row}>
                  {/* Up to three faces, overlapped. Beyond three the names in
                      the line already say how many there were, and a fourth
                      circle only makes the row taller. */}
                  <View style={styles.avatars}>
                    {item.actors.slice(0, MAX_FACES).map((actor, index) => (
                      <View
                        key={actor.id}
                        style={index === 0 ? undefined : styles.stackedAvatar}>
                        <Avatar uri={avatarUrls[actor.id]} name={actor.name} size={AVATAR_SIZE} />
                      </View>
                    ))}
                  </View>

                  <View style={styles.rowText}>
                    <ThemedText type="default">{describe(item.latest, item.actors)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {relativeTime(item.latest.createdAt)}
                    </ThemedText>
                  </View>

                  {/* What the notification is ABOUT, where that is a review.
                      A line of text names the place; the picture is what
                      actually identifies which of your reviews this is. */}
                  {item.latest.visitPhotoId && previewUrls[item.latest.visitPhotoId] && (
                    <LoadableImage
                      source={{ uri: previewUrls[item.latest.visitPhotoId] }}
                      style={styles.preview}
                    />
                  )}

                  {/* Only on a follow, and only where there is something to
                      do about it. Someone you already follow gets the word
                      rather than a button that would unfollow them by
                      accident. */}
                  {item.latest.type === 'follow' && actorId && (
                    state === 'following' ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Following
                      </ThemedText>
                    ) : state === 'pending' ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Requested
                      </ThemedText>
                    ) : (
                      <Pressable
                        onPress={() => void handleFollowBack(item.latest)}
                        hitSlop={8}
                        disabled={state === 'working'}>
                        <ThemedView type="backgroundSelected" style={styles.followButton}>
                          <ThemedText type="smallBold">
                            {state === 'working' ? '…' : 'Follow back'}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    )
                  )}
                </ThemedView>
              </Pressable>
            );
          }}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Overlapped rather than spaced, so three faces cost about the width of
  // one and a half and the row keeps its height.
  stackedAvatar: {
    marginLeft: -AVATAR_SIZE / 3,
  },
  // A square, so a portrait and a landscape photograph both read as the same
  // object in the column rather than as rows of different heights.
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Spacing.two,
  },
  followButton: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
});
