import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { listPublishedArticles, type ArticleListItem } from '@/lib/articles';
import { listFeaturedBoards } from '@/lib/boards';
import { getBoardThumbnailUrls } from '@/lib/collection-thumbnails';
import type { Database } from '@/lib/database.types';
import { getPopularPlaces, type NearbyPlace } from '@/lib/nearby-places';
import { resolveStateCountries } from '@/lib/places-cache';

type BoardRow = Database['public']['Tables']['boards']['Row'];

// One scrollable screen, three independently-loaded/independently-empty-safe
// sections — matches how this app's other multi-source screens (search,
// notifications) stay a single list rather than adding yet another layer of
// sub-tabs on top of the Feed/Discover switcher.
export function DiscoverView() {
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [articles, setArticles] = useState<ArticleListItem[]>([]);
  const [featuredBoards, setFeaturedBoards] = useState<BoardRow[]>([]);
  const [boardThumbnailUrls, setBoardThumbnailUrls] = useState<Record<string, string>>({});
  const [popularPlaces, setPopularPlaces] = useState<NearbyPlace[]>([]);
  const [placeRegions, setPlaceRegions] = useState<Map<string, string | null>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([listPublishedArticles(5), listFeaturedBoards(5), getPopularPlaces(10)])
      .then(async ([articleList, boardList, placeList]) => {
        setArticles(articleList);
        setFeaturedBoards(boardList);
        setPopularPlaces(placeList);
        const [thumbnails, regions] = await Promise.all([
          getBoardThumbnailUrls(boardList),
          resolveStateCountries(placeList.map((p) => p.id)),
        ]);
        setBoardThumbnailUrls(thumbnails);
        setPlaceRegions(regions);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load Discover.'));
  }, []);

  return (
    <Animated.ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
      showsVerticalScrollIndicator={false}
      onScroll={scrollHandler}
      scrollEventThrottle={16}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      {articles.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Articles</ThemedText>
          {articles.map((article) => (
            <Pressable key={article.id} onPress={() => router.push({ pathname: '/article/[id]', params: { id: article.id } })}>
              <ThemedView type="backgroundElement" style={styles.row}>
                {article.coverPhotoUrl ? (
                  <Image source={{ uri: article.coverPhotoUrl }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.rowLeading}>
                  <ThemedText type="headline">{article.title}</ThemedText>
                  {article.subtitle && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      {article.subtitle}
                    </ThemedText>
                  )}
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}

      {featuredBoards.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Featured boards</ThemedText>
          {featuredBoards.map((board) => (
            <Pressable key={board.id} onPress={() => router.push({ pathname: '/board/[id]', params: { id: board.id } })}>
              <ThemedView type="backgroundElement" style={styles.row}>
                {boardThumbnailUrls[board.id] ? (
                  <Image source={{ uri: boardThumbnailUrls[board.id] }} style={styles.thumbnail} />
                ) : (
                  <View style={styles.thumbnailPlaceholder} />
                )}
                <View style={styles.rowLeading}>
                  <ThemedText type="headline">{board.name}</ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}

      {popularPlaces.length > 0 && (
        <View style={styles.section}>
          <ThemedText type="sectionLabel">Popular locations</ThemedText>
          {popularPlaces.map((place) => (
            <Pressable key={place.id} onPress={() => router.push({ pathname: '/place/[id]', params: { id: place.id } })}>
              <ThemedView type="backgroundElement" style={styles.row}>
                <View style={styles.rowLeading}>
                  <ThemedText type="headline">{place.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {placeRegions.get(place.id) ? `${placeRegions.get(place.id)} · ` : ''}
                    {place.avgRating.toFixed(1)} ★ · {place.reviewCount} review{place.reviewCount === 1 ? '' : 's'}
                  </ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: Spacing.four,
    paddingTop: Spacing.three,
  },
  section: {
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
