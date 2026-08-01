import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { PromptEditor } from '@/components/prompt-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listMyBoards } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { listPrompts, swapPromptPositions, type ProfilePrompt } from '@/lib/profile-prompts';
import { supabase } from '@/lib/supabase';

const BIO_MAX_LENGTH = 160;
const PROMPT_SLOT_COUNT = 6;

type BoardRow = Database['public']['Tables']['boards']['Row'];
type OwnVisitOption = { id: string; placeName: string; rating: number };

export default function EditProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [showMap, setShowMap] = useState(profile?.show_map ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [ownVisits, setOwnVisits] = useState<OwnVisitOption[]>([]);
  const [ownBoards, setOwnBoards] = useState<BoardRow[]>([]);
  const scrollHandler = useHideOnScrollHandler();

  const loadPrompts = useCallback(async () => {
    if (!session) return;
    setPrompts(await listPrompts(session.user.id));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadPrompts();
    listMyBoards(session.user.id).then(setOwnBoards);
    supabase
      .from('visits')
      .select('id, rating, places!place_id(name)')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setOwnVisits(
          (data ?? []).map((v) => ({
            id: v.id,
            rating: v.rating,
            placeName: v.places?.name ?? 'Unknown place',
          }))
        );
      });
  }, [session, loadPrompts]);

  async function handleSave() {
    if (!session) return;
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    setError(null);
    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        name: name.trim(),
        bio: bio.trim() || null,
        show_map: showMap,
      })
      .eq('id', session.user.id);
    setIsSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    router.back();
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const other = prompts[index + direction];
    const current = prompts[index];
    if (!other) return;
    setError(null);
    try {
      await swapPromptPositions(
        { id: current.id, position: current.position },
        { id: other.id, position: other.position }
      );
      await loadPrompts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder that prompt.');
    }
  }

  const nextPosition = prompts.length > 0 ? Math.max(...prompts.map((p) => p.position)) + 1 : 0;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">Edit profile</ThemedText>

          <ThemedText type="sectionLabel">Name</ThemedText>
          <TextField placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />

          <ThemedText type="sectionLabel">Bio</ThemedText>
          <TextField
            placeholder="Tell people a bit about yourself"
            value={bio}
            onChangeText={(text) => setBio(text.slice(0, BIO_MAX_LENGTH))}
            multiline
          />
          <ThemedText type="small" themeColor="textSecondary">
            {bio.length}/{BIO_MAX_LENGTH}
          </ThemedText>

          <Pressable onPress={() => setShowMap((prev) => !prev)} style={styles.mapToggleRow}>
            <ThemedView type={showMap ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
              {showMap && <ThemedText type="smallBold">✓</ThemedText>}
            </ThemedView>
            <ThemedText type="small">Show a map of places I’ve visited on my profile</ThemedText>
          </Pressable>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button label="Save" onPress={handleSave} loading={isSaving} />

          <ThemedText type="sectionLabel">Prompts</ThemedText>
          <View style={styles.promptsList}>
            {prompts.map((existing, index) => (
              <PromptEditor
                key={existing.id}
                userId={session?.user.id ?? ''}
                position={existing.position}
                existing={existing}
                usedSlugs={prompts.filter((p) => p.id !== existing.id).map((p) => p.promptSlug)}
                ownVisits={ownVisits}
                ownBoards={ownBoards.map((b) => ({ id: b.id, name: b.name }))}
                onChanged={loadPrompts}
                onMoveUp={index > 0 ? () => handleMove(index, -1) : undefined}
                onMoveDown={index < prompts.length - 1 ? () => handleMove(index, 1) : undefined}
              />
            ))}

            {prompts.length < PROMPT_SLOT_COUNT && (
              <PromptEditor
                key="new"
                userId={session?.user.id ?? ''}
                position={nextPosition}
                existing={undefined}
                usedSlugs={prompts.map((p) => p.promptSlug)}
                ownVisits={ownVisits}
                ownBoards={ownBoards.map((b) => ({ id: b.id, name: b.name }))}
                onChanged={loadPrompts}
              />
            )}
          </View>
        </KeyboardAwareScroll>
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
  // The ScrollView itself stays full width (so its scrollbar sits at the
  // true browser edge on web) — centering happens on its content instead.
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    paddingBottom: BottomTabInset,
  },
  mapToggleRow: {
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
  promptsList: {
    gap: Spacing.two,
  },
});
