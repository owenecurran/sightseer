import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { getArticle, type ArticleDetail } from '@/lib/articles';

export default function ArticleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();
  const [article, setArticle] = useState<ArticleDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getArticle(id)
      .then(setArticle)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load this article.'));
  }, [id]);

  if (article === undefined) return <PageLoader />;

  const paragraphs = article ? article.body.split(/\n\s*\n/).filter((p) => p.trim().length > 0) : [];

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="[id]" />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {!article && !error && (
            <ThemedText type="small" themeColor="textSecondary">
              This article isn't available.
            </ThemedText>
          )}

          {article && (
            <>
              {article.coverPhotoUrl && (
                <View style={styles.heroWrap}>
                  <LoadableImage source={{ uri: article.coverPhotoUrl }} style={styles.hero} />
                </View>
              )}

              <ThemedText type="displaySerif">{article.title}</ThemedText>
              {article.subtitle && (
                <ThemedText type="small" themeColor="textSecondary">
                  {article.subtitle}
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                {article.authorName}
              </ThemedText>

              <View style={styles.body}>
                {paragraphs.map((paragraph, index) => (
                  <ThemedText key={index} type="body">
                    {paragraph.trim()}
                  </ThemedText>
                ))}
              </View>
            </>
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
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  heroWrap: {
    width: '100%',
    height: 200,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  hero: {
    width: '100%',
    height: '100%',
  },
  body: {
    gap: Spacing.three,
  },
});
