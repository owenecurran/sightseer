import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PageLoader } from '@/components/ui/page-loader';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { searchUsers } from '@/lib/search';
import {
  addCollaborator,
  getTravelBookDetail,
  removeCollaborator,
  updateTravelBookPrivacy,
  type TravelBookCollaborator,
  type TravelBookRow,
} from '@/lib/travel-books';

type UserRow = Database['public']['Tables']['users']['Row'];

const DEBOUNCE_MS = 300;

export default function TravelBookSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [book, setBook] = useState<TravelBookRow | null>(null);
  const [collaborators, setCollaborators] = useState<TravelBookCollaborator[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSuggestions, setPeopleSuggestions] = useState<UserRow[]>([]);
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      setError(null);
      (async () => {
        try {
          const detail = await getTravelBookDetail(id);
          setBook(detail.book);
          setCollaborators(detail.collaborators);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this travel book.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id])
  );

  // Same debounced-search pattern as travel-book/new.tsx's own collaborator
  // picker — this is the same feature, just editing an already-created book
  // instead of one still being composed, so each pick/remove below calls
  // addCollaborator/removeCollaborator immediately rather than staging local
  // state for a later bulk save.
  useEffect(() => {
    if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    if (!session || !peopleQuery.trim()) {
      setPeopleSuggestions([]);
      return;
    }
    peopleDebounceRef.current = setTimeout(async () => {
      try {
        setPeopleSuggestions(await searchUsers(peopleQuery, session.user.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      }
    }, DEBOUNCE_MS);
    return () => {
      if (peopleDebounceRef.current) clearTimeout(peopleDebounceRef.current);
    };
  }, [peopleQuery, session]);

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

  // Guards against re-tapping an already-added suggestion — unlike
  // new.tsx's local-only staging (a no-op there), this fires a real insert,
  // which would otherwise 23505-conflict on the (travel_book_id, user_id)
  // primary key.
  async function handleAddCollaborator(user: UserRow) {
    if (!book || collaborators.some((c) => c.userId === user.id)) return;
    setPeopleQuery('');
    setPeopleSuggestions([]);
    setCollaborators((prev) => [...prev, { userId: user.id, name: user.name ?? user.handle ?? 'Someone' }]);
    try {
      await addCollaborator(book.id, user.id);
    } catch (err) {
      setCollaborators((prev) => prev.filter((c) => c.userId !== user.id));
      setError(err instanceof Error ? err.message : 'Could not add that collaborator.');
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    if (!book) return;
    const removed = collaborators.find((c) => c.userId === userId);
    setCollaborators((prev) => prev.filter((c) => c.userId !== userId));
    try {
      await removeCollaborator(book.id, userId);
    } catch (err) {
      if (removed) setCollaborators((prev) => [...prev, removed]);
      setError(err instanceof Error ? err.message : 'Could not remove that collaborator.');
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
            <>
              <Pressable onPress={handleTogglePrivate} style={styles.toggleRow}>
                <ThemedView type={book?.is_private ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
                  {book?.is_private && <ThemedText type="smallBold">✓</ThemedText>}
                </ThemedView>
                <ThemedText type="small">Private — only visible to people who can already see my content</ThemedText>
              </Pressable>

              <View style={styles.section}>
                <ThemedText type="sectionLabel">Trip collaborators</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Anyone added can also add their own reviews to this trip.
                </ThemedText>
                {collaborators.length > 0 && (
                  <View style={styles.tagRow}>
                    {collaborators.map((c) => (
                      <Pressable key={c.userId} onPress={() => handleRemoveCollaborator(c.userId)}>
                        <ThemedView type="backgroundSelected" style={styles.tagChip}>
                          <ThemedText type="small">{c.name} ✕</ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>
                )}
                <TextField placeholder="Search by name or username..." value={peopleQuery} onChangeText={setPeopleQuery} />
                {peopleSuggestions.map((user) => (
                  <Pressable key={user.id} onPress={() => handleAddCollaborator(user)}>
                    <ThemedView type="backgroundSelected" style={styles.suggestionRow}>
                      <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                    </ThemedView>
                  </Pressable>
                ))}
              </View>
            </>
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
  section: {
    gap: Spacing.two,
  },
  tagRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  tagChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  suggestionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
});
