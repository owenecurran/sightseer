import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type BoardRow = Database['public']['Tables']['boards']['Row'];

type BoardItemWithVisit = {
  id: string;
  visit_id: string | null;
  visits: {
    rating: number;
    note: string | null;
    places: { name: string } | null;
    photos: { id: string }[];
  } | null;
};

export default function BoardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [board, setBoard] = useState<BoardRow | null>(null);
  const [items, setItems] = useState<BoardItemWithVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setError(null);
      try {
        const [{ data: boardData, error: boardError }, { data: itemsData, error: itemsError }] =
          await Promise.all([
            supabase.from('boards').select('*').eq('id', id).single(),
            supabase
              .from('board_items')
              .select('id, visit_id, visits(rating, note, places!place_id(name), photos(id))')
              .eq('board_id', id)
              .eq('item_type', 'visit')
              .order('position'),
          ]);
        if (boardError) throw boardError;
        if (itemsError) throw itemsError;
        const typedItems = itemsData as unknown as BoardItemWithVisit[];
        setBoard(boardData);
        setItems(typedItems);

        const photoIds = typedItems.flatMap((item) => item.visits?.photos[0]?.id ?? []);
        if (photoIds.length > 0) {
          setPhotoUrls(await getPhotoViewUrls(photoIds));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load this board.');
      }
    })();
  }, [id]);

  async function handleRemove(itemId: string) {
    setError(null);
    const { error: deleteError } = await supabase.from('board_items').delete().eq('id', itemId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  }

  const isOwner = session && board && session.user.id === board.user_id;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">{board?.name ?? 'Board'}</ThemedText>
        {board?.description && (
          <ThemedText type="small" themeColor="textSecondary">
            {board.description}
          </ThemedText>
        )}

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const photoId = item.visits?.photos[0]?.id;
            const photoUrl = photoId ? photoUrls[photoId] : undefined;
            return (
              <ThemedView type="backgroundElement" style={styles.itemCard}>
                {photoUrl && <Image source={{ uri: photoUrl }} style={styles.photo} />}
                <View style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <ThemedText type="default">{item.visits?.places?.name ?? 'Unknown place'}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.visits ? `${item.visits.rating.toFixed(1)} ★` : ''}
                      {item.visits?.note ? ` · ${item.visits.note}` : ''}
                    </ThemedText>
                  </View>
                  {isOwner && (
                    <Pressable onPress={() => handleRemove(item.id)}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Remove
                      </ThemedText>
                    </Pressable>
                  )}
                </View>
              </ThemedView>
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
  itemCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  itemInfo: {
    gap: Spacing.half,
  },
});
