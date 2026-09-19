import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { PaperPanel } from '@/components/ui/paper-panel';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { searchUsers } from '@/lib/search';
import { addCollaborator, createTravelBook } from '@/lib/travel-books';

type UserRow = Database['public']['Tables']['users']['Row'];
type PlaceRow = Database['public']['Tables']['places']['Row'];

const DEBOUNCE_MS = 300;

export default function NewTravelBookScreen() {
  const { session } = useAuth();
  const scrollHandler = useHideOnScrollHandler();
  const bottomInset = useBottomTabInset();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [location, setLocation] = useState<PlaceRow | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleSuggestions, setPeopleSuggestions] = useState<UserRow[]>([]);
  const [collaborators, setCollaborators] = useState<UserRow[]>([]);
  const peopleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleSelectCollaborator(user: UserRow) {
    setCollaborators((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
    setPeopleQuery('');
    setPeopleSuggestions([]);
  }

  function handleRemoveCollaborator(userId: string) {
    setCollaborators((prev) => prev.filter((u) => u.id !== userId));
  }

  async function handleCreate() {
    if (!session || !title.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const book = await createTravelBook({
        userId: session.user.id,
        title: title.trim(),
        description: description.trim(),
        isPrivate,
        locationPlaceId: location?.id,
      });
      for (const collaborator of collaborators) {
        await addCollaborator(book.id, collaborator.id);
      }
      router.replace({ pathname: '/travel-book/[id]', params: { id: book.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that travel book.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="new" />

          <ThemedText type="displaySerif">New travel book</ThemedText>

          {/* Three panels for three questions — what the book is, where and
              who can see it, and who else can write in it. The form was one
              undifferentiated column of fields before, which is fine to fill
              in and gives no sense of how much is left. */}
          <PaperPanel seed="book-about" accentIndex={0}>
            <ThemedText type="sectionLabel">The book</ThemedText>
            <TextField placeholder="Trip title" value={title} onChangeText={setTitle} />
            <TextField placeholder="Description (optional)" value={description} onChangeText={setDescription} multiline />
          </PaperPanel>

          <PaperPanel seed="book-where" accentIndex={1}>
            <ThemedText type="sectionLabel">Where & who sees it</ThemedText>
          <Pressable onPress={() => setIsLocationPickerOpen(true)} style={styles.locationRow}>
            <ThemedView type="backgroundField" style={styles.locationChip}>
              <ThemedText type="small" themeColor={location ? 'text' : 'textSecondary'}>
                {location ? location.name : 'Trip location (optional)'}
              </ThemedText>
            </ThemedView>
            {location && (
              <Pressable onPress={() => setLocation(null)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Clear
                </ThemedText>
              </Pressable>
            )}
          </Pressable>

          <CheckboxRow
            accentIndex={3}
            checked={isPrivate}
            label="Private — only you and collaborators can see this book"
            onPress={() => setIsPrivate((prev) => !prev)}
          />
          </PaperPanel>

          <PaperPanel seed="book-collaborators" accentIndex={2}>
            <ThemedText type="sectionLabel">Collaborators</ThemedText>
          <View style={styles.section}>
            <ThemedText type="small" themeColor="textSecondary">
              Optional — anyone added can also add their own reviews
            </ThemedText>
            {collaborators.length > 0 && (
              <View style={styles.tagRow}>
                {collaborators.map((user) => (
                  <Pressable key={user.id} onPress={() => handleRemoveCollaborator(user.id)}>
                    <ThemedView type="backgroundSelected" style={styles.tagChip}>
                      <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'} ✕</ThemedText>
                    </ThemedView>
                  </Pressable>
                ))}
              </View>
            )}
            <TextField placeholder="Search by name or username..." value={peopleQuery} onChangeText={setPeopleQuery} />
            {peopleSuggestions.map((user) => (
              <Pressable key={user.id} onPress={() => handleSelectCollaborator(user)}>
                <ThemedView type="backgroundSelected" style={styles.suggestionRow}>
                  <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>
          </PaperPanel>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button label="Create travel book" onPress={handleCreate} loading={isCreating} disabled={!title.trim()} />
        </Animated.ScrollView>

        <LocationSearchModal
          visible={isLocationPickerOpen}
          onCancel={() => setIsLocationPickerOpen(false)}
          onSelect={(place) => {
            setLocation(place);
            setIsLocationPickerOpen(false);
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
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  locationChip: {
    flex: 1,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
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
