import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PromptEditor } from '@/components/prompt-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
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
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [ownVisits, setOwnVisits] = useState<OwnVisitOption[]>([]);
  const [ownBoards, setOwnBoards] = useState<BoardRow[]>([]);

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
      .update({ name: name.trim(), bio: bio.trim() || null })
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

        <ThemedText type="subtitle">Edit profile</ThemedText>

        <ThemedText type="small" themeColor="textSecondary">
          Name
        </ThemedText>
        <TextField placeholder="Your name" value={name} onChangeText={setName} autoCapitalize="words" />

        <ThemedText type="small" themeColor="textSecondary">
          Bio
        </ThemedText>
        <TextField
          placeholder="Tell people a bit about yourself"
          value={bio}
          onChangeText={(text) => setBio(text.slice(0, BIO_MAX_LENGTH))}
          multiline
        />
        <ThemedText type="small" themeColor="textSecondary">
          {bio.length}/{BIO_MAX_LENGTH}
        </ThemedText>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <Button label="Save" onPress={handleSave} loading={isSaving} />

        <ThemedText type="smallBold">Prompts</ThemedText>
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
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  promptsList: {
    gap: Spacing.two,
  },
});
