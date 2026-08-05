import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { PromptEditor } from '@/components/prompt-editor';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { listMyBoards } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { listPrompts, reorderPrompts, type ProfilePrompt } from '@/lib/profile-prompts';
import { listUserTravelBooks, type TravelBookListItem } from '@/lib/travel-books';
import {
  parseSectionOrder,
  PROFILE_SECTION_LABELS,
  saveProfileSectionOrder,
  type ProfileSectionKey,
} from '@/lib/profile-sections';
import { supabase } from '@/lib/supabase';
import { getAvatarViewUrls, uploadAvatar } from '@/lib/avatar';
import { Avatar } from '@/components/ui/avatar';

const BIO_MAX_LENGTH = 160;
const PROMPT_SLOT_COUNT = 6;

type BoardRow = Database['public']['Tables']['boards']['Row'];
type OwnVisitOption = { id: string; placeName: string; rating: number | null };

// Prompts and profile-section order used to live behind an Info/Layout tab
// toggle, with prompts reordered via up/down arrows and sections via
// drag-and-drop — two different interaction models for adjacent concepts,
// split behind a tab click. Now one continuous page, both reorderable the
// same way (press-and-hold drag). Both DraggableFlatLists run with
// scrollEnabled={false} — the standard pattern for embedding a draggable
// list inside a larger scrolling page — so the outer KeyboardAwareScroll
// owns the actual scroll and there's no nested-VirtualizedList conflict.
export default function EditProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const theme = useTheme();
  const bottomInset = useBottomTabInset();

  const [name, setName] = useState(profile?.name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [showMap, setShowMap] = useState(profile?.show_map ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prompts, setPrompts] = useState<ProfilePrompt[]>([]);
  const [ownVisits, setOwnVisits] = useState<OwnVisitOption[]>([]);
  const [ownBoards, setOwnBoards] = useState<BoardRow[]>([]);
  const [ownTravelBooks, setOwnTravelBooks] = useState<TravelBookListItem[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const [order, setOrder] = useState<ProfileSectionKey[]>(() => parseSectionOrder(profile?.profile_section_order));
  const [layoutError, setLayoutError] = useState<string | null>(null);

  const loadPrompts = useCallback(async () => {
    if (!session) return;
    setPrompts(await listPrompts(session.user.id));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    loadPrompts();
    listMyBoards(session.user.id).then(setOwnBoards);
    // Owner-only (not listMyTravelBooks) — the travel_book prompt-attachment
    // RLS only allows tb.user_id = auth.uid(), matching the 'board' clause
    // exactly, so a collaborator book must never appear as pickable here.
    listUserTravelBooks(session.user.id).then(setOwnTravelBooks);
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

  useEffect(() => {
    if (!session || !profile?.avatar_r2_key) return;
    getAvatarViewUrls([session.user.id]).then((urls) => setAvatarUrl(urls[session.user.id]));
  }, [session, profile?.avatar_r2_key]);

  async function handleChangeAvatar() {
    if (!session) return;
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setError(null);
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar({ userId: session.user.id, uri: result.uri, mimeType: result.mimeType });
      await refreshProfile();
      const urls = await getAvatarViewUrls([session.user.id]);
      setAvatarUrl(urls[session.user.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }

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

  async function handleReorderPrompts(next: ProfilePrompt[]) {
    setPrompts(next);
    try {
      await reorderPrompts(next.map((p) => p.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder your prompts.');
    }
  }

  async function persistSectionOrder(next: ProfileSectionKey[]) {
    if (!session) return;
    setLayoutError(null);
    try {
      await saveProfileSectionOrder(session.user.id, next);
      await refreshProfile();
    } catch (err) {
      setLayoutError(err instanceof Error ? err.message : 'Could not save that order.');
    }
  }

  const renderPrompt = useCallback(
    ({ item, drag }: RenderItemParams<ProfilePrompt>) => (
      <ScaleDecorator>
        <PromptEditor
          userId={session?.user.id ?? ''}
          position={item.position}
          existing={item}
          usedSlugs={prompts.filter((p) => p.id !== item.id).map((p) => p.promptSlug)}
          ownVisits={ownVisits}
          ownBoards={ownBoards.map((b) => ({ id: b.id, name: b.name }))}
          ownTravelBooks={ownTravelBooks.map((b) => ({ id: b.id, title: b.title }))}
          onChanged={loadPrompts}
          onDragStart={drag}
        />
      </ScaleDecorator>
    ),
    [session, prompts, ownVisits, ownBoards, ownTravelBooks, loadPrompts]
  );

  const renderSectionItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<ProfileSectionKey>) => (
      <ScaleDecorator>
        <Pressable onLongPress={drag} disabled={isActive} delayLongPress={150}>
          <ThemedView type={isActive ? 'backgroundSelected' : 'backgroundElement'} style={styles.sectionRow}>
            <ThemedText type="default">{PROFILE_SECTION_LABELS[item]}</ThemedText>
            <Ionicons name="reorder-three-outline" size={22} color={theme.textSecondary} />
          </ThemedView>
        </Pressable>
      </ScaleDecorator>
    ),
    [theme.textSecondary]
  );

  const nextPosition = prompts.length > 0 ? Math.max(...prompts.map((p) => p.position)) + 1 : 0;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>
          <ThemedText type="displaySerif">Edit profile</ThemedText>
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={handleChangeAvatar} disabled={isUploadingAvatar} style={styles.avatarRow}>
            <Avatar uri={avatarUrl} name={profile?.name} size={64} />
            <ThemedText type="small" themeColor="sage">
              {isUploadingAvatar ? 'Uploading…' : 'Change photo'}
            </ThemedText>
          </Pressable>

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
          <ThemedText type="small" themeColor="textSecondary">
            Press and hold a prompt to drag it into a new order.
          </ThemedText>
          <DraggableFlatList
            data={prompts}
            keyExtractor={(item) => item.id}
            renderItem={renderPrompt}
            onDragEnd={({ data }) => handleReorderPrompts(data)}
            scrollEnabled={false}
            contentContainerStyle={styles.promptsList}
          />
          {prompts.length < PROMPT_SLOT_COUNT && (
            <PromptEditor
              key="new"
              userId={session?.user.id ?? ''}
              position={nextPosition}
              existing={undefined}
              usedSlugs={prompts.map((p) => p.promptSlug)}
              ownVisits={ownVisits}
              ownBoards={ownBoards.map((b) => ({ id: b.id, name: b.name }))}
              ownTravelBooks={ownTravelBooks.map((b) => ({ id: b.id, title: b.title }))}
              onChanged={loadPrompts}
            />
          )}

          <ThemedText type="sectionLabel">Layout</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Press and hold a section to drag it into a new order.
          </ThemedText>
          {layoutError && (
            <ThemedText type="small" themeColor="textSecondary">
              {layoutError}
            </ThemedText>
          )}
          <DraggableFlatList
            data={order}
            keyExtractor={(item) => item}
            renderItem={renderSectionItem}
            onDragEnd={({ data }) => {
              setOrder(data);
              persistSectionOrder(data);
            }}
            scrollEnabled={false}
            contentContainerStyle={styles.sectionList}
          />
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
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.two,
  },
  avatarRow: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  // The ScrollView itself stays full width (so its scrollbar sits at the
  // true browser edge on web) — centering happens on its content instead.
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
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
  sectionList: {
    gap: Spacing.two,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
