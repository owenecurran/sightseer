import { router } from 'expo-router';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { BoardVisitItem } from '@/lib/boards';

type FullReviewsViewProps = {
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
};

// "One review shown on a majority of the screen, scroll through them" —
// horizontal paging carousel, one full review per page (each page scrolls
// vertically on its own if the note/photos run long).
export function FullReviewsView({ items, photoUrls }: FullReviewsViewProps) {
  const { width } = useWindowDimensions();

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      renderItem={({ item }) => (
        <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.visitId } })}>
            <View style={styles.header}>
              <ThemedText type="displaySerif">{item.placeName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.authorName} · {item.rating.toFixed(1)} ★
              </ThemedText>
            </View>
            {item.note && <ThemedText type="default">{item.note}</ThemedText>}
          </Pressable>
          <PhotoGrid urls={item.photoIds.map((id) => photoUrls[id]).filter((url) => url != null)} />
        </ScrollView>
      )}
    />
  );
}

const styles = StyleSheet.create({
  page: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
  },
  header: {
    gap: Spacing.half,
  },
});
