import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CollectionsSwitcher } from '@/components/collections-switcher';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { listMyTravelBooks, type TravelBookListItem } from '@/lib/travel-books';

export default function TravelBooksScreen() {
  const { session } = useAuth();
  const [books, setBooks] = useState<TravelBookListItem[]>([]);
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      listMyTravelBooks(session.user.id)
        .then(async (myBooks) => {
          setBooks(myBooks);
          const coverPhotoIds = myBooks.map((b) => b.cover_photo_id).filter((id): id is string => id != null);
          const urls = coverPhotoIds.length > 0 ? await getPhotoViewUrls(coverPhotoIds) : {};
          setCoverUrls(
            Object.fromEntries(
              myBooks
                .filter((b) => b.cover_photo_id && urls[b.cover_photo_id])
                .map((b) => [b.id, urls[b.cover_photo_id!]])
            )
          );
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load travel books.'))
        .finally(() => setHasLoadedOnce(true));
    }, [session])
  );

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={books}
          keyExtractor={(item: TravelBookListItem) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
              <Pressable onPress={() => router.back()}>
                <ThemedText type="link">← Back</ThemedText>
              </Pressable>
              <ThemedText type="displaySerif">Your travel books</ThemedText>
              <CollectionsSwitcher active="travel_books" />
              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}
              <Button label="New travel book" onPress={() => router.push('/travel-book/new')} />
              {books.length === 0 && !error && (
                <ThemedText type="small" themeColor="textSecondary">
                  No travel books yet. Start one to keep a chronological log of a trip.
                </ThemedText>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/travel-book/[id]', params: { id: item.id } })}
              style={styles.contentWrap}>
              <ThemedView type="backgroundElement" style={styles.bookRow}>
                <View style={styles.bookRowLeading}>
                  <ThemedText type="headline">{item.title}</ThemedText>
                  {item.locationName && (
                    <ThemedText type="small" themeColor="sage">
                      {item.locationName}
                    </ThemedText>
                  )}
                  {item.description && (
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.description}
                    </ThemedText>
                  )}
                </View>
                {coverUrls[item.id] && <Image source={{ uri: coverUrls[item.id] }} style={styles.thumbnail} />}
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
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  contentWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerSection: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  list: {
    gap: Spacing.two,
    paddingBottom: BottomTabInset,
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  bookRowLeading: {
    flex: 1,
    gap: Spacing.half,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: Spacing.one,
  },
});
