import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';
import { updateTravelBookPrivacy } from '@/lib/travel-books';

type TravelBookRow = Database['public']['Tables']['travel_books']['Row'];

export default function TravelBookSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [book, setBook] = useState<TravelBookRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setError(null);
      (async () => {
        try {
          const { data, error: bookError } = await supabase.from('travel_books').select('*').eq('id', id).single();
          if (bookError) throw bookError;
          setBook(data);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this travel book.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id])
  );

  async function handleTogglePrivate() {
    if (!book) return;
    const next = !book.is_private;
    setBook({ ...book, is_private: next });
    try {
      await updateTravelBookPrivacy(book.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update privacy.');
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const isOwner = Boolean(session && book && session.user.id === book.user_id);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">Travel book settings</ThemedText>

          {!isOwner ? (
            <ThemedText type="small" themeColor="textSecondary">
              Only this travel book's owner can change its settings.
            </ThemedText>
          ) : (
            <Pressable onPress={handleTogglePrivate} style={styles.toggleRow}>
              <ThemedView type={book?.is_private ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
                {book?.is_private && <ThemedText type="smallBold">✓</ThemedText>}
              </ThemedView>
              <ThemedText type="small">Private — only visible to people who can already see my content</ThemedText>
            </Pressable>
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
        </View>
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
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: Spacing.half,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
