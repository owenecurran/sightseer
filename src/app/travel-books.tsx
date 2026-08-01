import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listMyTravelBooks, type TravelBookRow } from '@/lib/travel-books';

export default function TravelBooksScreen() {
  const { session } = useAuth();
  const [books, setBooks] = useState<TravelBookRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      listMyTravelBooks(session.user.id)
        .then(setBooks)
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
          keyExtractor={(item: TravelBookRow) => item.id}
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
                <ThemedText type="headline">{item.title}</ThemedText>
                {item.description && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.description}
                  </ThemedText>
                )}
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
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
