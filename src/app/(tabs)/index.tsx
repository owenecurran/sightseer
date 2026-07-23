import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SaveToBoard } from '@/components/save-to-board';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getFeedVisits, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';

export default function HomeScreen() {
  const { session } = useAuth();
  const [visits, setVisits] = useState<FeedVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refetch on every focus, not just on mount — tab navigators keep sibling
  // screens mounted, so a plain useEffect(...,[session]) would never notice
  // a follow made on the People tab without this.
  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setIsLoading(true);
      setError(null);
      getFeedVisits(session.user.id)
        .then(async (feedVisits) => {
          setVisits(feedVisits);
          const photoIds = feedVisits.map((v) => v.photoId).filter((id) => id !== null);
          if (photoIds.length > 0) {
            setPhotoUrls(await getPhotoViewUrls(photoIds));
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your feed.'))
        .finally(() => setIsLoading(false));
    }, [session])
  );

  async function handleToggleLike(visit: FeedVisit) {
    if (!session) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(session.user.id, visit.id);
      } else {
        await likeVisit(session.user.id, visit.id);
      }
      setVisits((prev) =>
        prev.map((v) =>
          v.id === visit.id
            ? {
                ...v,
                isLikedByMe: !v.isLikedByMe,
                likeCount: v.likeCount + (v.isLikedByMe ? -1 : 1),
              }
            : v
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that like.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">Feed</ThemedText>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {!isLoading && visits.length === 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            No visits yet from people you follow. Follow someone from the People tab, or check back
            once they log a visit.
          </ThemedText>
        )}

        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.card}>
              <ThemedText type="smallBold">{item.authorName}</ThemedText>
              <ThemedText type="default">{item.placeName}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {'★'.repeat(item.rating)}
                {item.note ? ` · ${item.note}` : ''}
              </ThemedText>
              {item.photoId && photoUrls[item.photoId] && (
                <Image source={{ uri: photoUrls[item.photoId] }} style={styles.photo} />
              )}

              <View style={styles.actionsRow}>
                <Pressable onPress={() => handleToggleLike(item)}>
                  <ThemedText type="small" themeColor={item.isLikedByMe ? 'text' : 'textSecondary'}>
                    {item.isLikedByMe ? '♥' : '♡'} {item.likeCount}
                  </ThemedText>
                </Pressable>
              </View>

              <SaveToBoard visitId={item.id} />
            </ThemedView>
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
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Spacing.two,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
});
