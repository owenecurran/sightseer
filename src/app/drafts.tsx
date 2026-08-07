import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { deleteDraft, listMyDrafts, type DraftListItem } from '@/lib/drafts';

// Same duplicated-not-shared relative-time helper comments-section.tsx
// already uses for its own timestamps — small enough not to warrant a
// shared util for a second caller.
function relativeTime(isoDate: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export default function DraftsScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [drafts, setDrafts] = useState<DraftListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      listMyDrafts(session.user.id)
        .then(setDrafts)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your drafts.'))
        .finally(() => setHasLoadedOnce(true));
    }, [session])
  );

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteDraft(pendingDeleteId);
      setDrafts((prev) => prev.filter((d) => d.id !== pendingDeleteId));
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not discard that draft.');
    } finally {
      setIsDeleting(false);
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
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">Drafts</ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {drafts.length === 0 ? (
            <View style={styles.emptyState}>
              <ThemedText type="small" themeColor="textSecondary">
                No drafts yet.
              </ThemedText>
            </View>
          ) : (
            <View style={styles.list}>
              {drafts.map((draft) => (
                <Pressable
                  key={draft.id}
                  onPress={() => router.push({ pathname: '/review-form', params: { draftId: draft.id } })}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    {draft.coverPhotoUrl ? (
                      <Image source={{ uri: draft.coverPhotoUrl }} style={styles.thumbnail} />
                    ) : (
                      <View style={styles.thumbnailPlaceholder} />
                    )}
                    <View style={styles.rowLeading}>
                      <ThemedText type="headline">{draft.placeName ?? 'Needs a location'}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {relativeTime(draft.createdAt)}
                      </ThemedText>
                    </View>
                    <Pressable onPress={() => setPendingDeleteId(draft.id)} hitSlop={8}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Discard
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          )}
        </Animated.ScrollView>
      </SafeAreaView>

      <ConfirmDeleteModal
        visible={pendingDeleteId != null}
        message="Discard this draft? This can't be undone."
        confirmLabel="Discard"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowLeading: {
    flex: 1,
    gap: Spacing.half,
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
  },
  thumbnailPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(234,231,207,0.08)',
  },
});
