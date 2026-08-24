import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { createBoard } from '@/lib/boards';
import { uploadCoverPhoto } from '@/lib/covers';
import { pickImageFromLibrary } from '@/lib/image-picker';

type ListStyle = 'collection' | 'ranked';

const LIST_STYLES: { key: ListStyle; label: string; description: string }[] = [
  { key: 'collection', label: 'Collection', description: 'A regular saved list, in whatever order items were added.' },
  { key: 'ranked', label: 'Ranked', description: 'A numbered ranking you can drag to reorder.' },
];

// Brings board creation to parity with travel-book/new.tsx (a dedicated
// screen, not the bare inline name-only row boards.tsx used to have) — same
// fields that actually apply to a board (name, ranking type, privacy,
// cover); no location/collaborators, those are travel-book-specific
// concepts. Ranking type and privacy mirror board/[id]/settings.tsx exactly
// (same options, same immediate-toggle chip UI) so everything settable
// after creation is also settable up front.
export default function NewBoardScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [name, setName] = useState('');
  const [listStyle, setListStyle] = useState<ListStyle>('collection');
  const [isPrivate, setIsPrivate] = useState(false);
  const [pendingCoverUri, setPendingCoverUri] = useState<string | null>(null);
  const [pendingCoverMimeType, setPendingCoverMimeType] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function handlePickCover() {
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setPendingCoverUri(result.uri);
    setPendingCoverMimeType(result.mimeType);
  }

  async function handleCreate() {
    if (!session || !name.trim()) return;
    setError(null);
    setIsCreating(true);
    try {
      const board = await createBoard({ userId: session.user.id, name: name.trim(), isPrivate, listStyle });
      if (pendingCoverUri) {
        await uploadCoverPhoto({
          table: 'boards',
          id: board.id,
          uri: pendingCoverUri,
          mimeType: pendingCoverMimeType,
        });
      }
      router.replace({ pathname: '/board/[id]', params: { id: board.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create that board.');
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

          <ThemedText type="displaySerif">New board</ThemedText>

          <TextField placeholder="Board name" value={name} onChangeText={setName} />

          <ThemedText type="sectionLabel">Ranking</ThemedText>
          {LIST_STYLES.map((style) => (
            <Pressable key={style.key} onPress={() => setListStyle(style.key)}>
              <ThemedView type={listStyle === style.key ? 'backgroundSelected' : 'backgroundElement'} style={styles.option}>
                <ThemedText type="headline">{style.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {style.description}
                </ThemedText>
              </ThemedView>
            </Pressable>
          ))}

          <Pressable onPress={() => setIsPrivate((prev) => !prev)} style={styles.checkboxRow}>
            <ThemedView type={isPrivate ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
              {isPrivate && <ThemedText type="smallBold">✓</ThemedText>}
            </ThemedView>
            <ThemedText type="small">Private — only you can see this board</ThemedText>
          </Pressable>

          <Button
            label={pendingCoverUri ? 'Cover photo selected ✓' : 'Add a cover photo (optional)'}
            variant="secondary"
            onPress={handlePickCover}
          />

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button label="Create board" onPress={handleCreate} loading={isCreating} disabled={!name.trim()} />
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
  option: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
