import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { deleteArticle, listAllArticlesForAdmin, type AdminArticleListItem } from '@/lib/articles';

// Admin-only in effect (RLS blocks a non-admin from ever seeing draft rows,
// and the only entry point is the admin-gated link on profile.tsx) — same
// access model as moderation.tsx: no in-screen redirect, trust RLS.
export default function AdminArticlesScreen() {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [articles, setArticles] = useState<AdminArticleListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      listAllArticlesForAdmin()
        .then(setArticles)
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load articles.'))
        .finally(() => setHasLoadedOnce(true));
    }, [])
  );

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await deleteArticle(pendingDeleteId);
      setArticles((prev) => prev.filter((a) => a.id !== pendingDeleteId));
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete that article.');
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

          <ThemedText type="displaySerif">Articles</ThemedText>

          <Button label="New article" onPress={() => router.push('/admin/articles/new')} />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {articles.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No articles yet.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {articles.map((article) => (
                <Pressable
                  key={article.id}
                  onPress={() => router.push({ pathname: '/admin/articles/new', params: { id: article.id } })}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    {article.coverPhotoUrl ? (
                      <Image source={{ uri: article.coverPhotoUrl }} style={styles.thumbnail} />
                    ) : (
                      <View style={styles.thumbnailPlaceholder} />
                    )}
                    <View style={styles.rowLeading}>
                      <ThemedText type="headline">{article.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {article.published ? 'Published' : 'Draft'}
                      </ThemedText>
                    </View>
                    <Pressable onPress={() => setPendingDeleteId(article.id)} hitSlop={8}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Delete
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
        message="Delete this article? This can't be undone."
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
