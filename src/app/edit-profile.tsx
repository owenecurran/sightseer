import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { PromptCard } from '@/components/prompt-card';
import { ThemedText } from '@/components/themed-text';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { listPrompts, reorderPrompts, type ProfilePrompt } from '@/lib/profile-prompts';
import { firstPhotoId, getProfileShowcase, type ShowcaseVisit } from '@/lib/profile-showcase';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getTaggedInShowcase, type TaggedVisit } from '@/lib/tagged-visits';
import { Image } from 'expo-image';
import {
  parseSectionOrder,
  PROFILE_SECTION_HINTS,
  PROFILE_SECTION_ICONS,
  PROFILE_SECTION_LABELS,
  saveProfileSectionOrder,
  type ProfileSectionKey,
} from '@/lib/profile-sections';
import { supabase } from '@/lib/supabase';
import { getAvatarViewUrls, uploadAvatar } from '@/lib/avatar';
import { goBack } from '@/lib/navigation';
import { Avatar } from '@/components/ui/avatar';

const BIO_MAX_LENGTH = 160;
const PROMPT_SLOT_COUNT = 6;

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
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  const [order, setOrder] = useState<ProfileSectionKey[]>(() => parseSectionOrder(profile?.profile_section_order));
  const [layoutError, setLayoutError] = useState<string | null>(null);

  // What each section currently HOLDS, for the previews below. The same two
  // showcase queries the profile itself runs, so the row shows the same
  // review the profile will.
  const [latestVisit, setLatestVisit] = useState<ShowcaseVisit | null>(null);
  const [latestTagged, setLatestTagged] = useState<TaggedVisit | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const [showcase, tagged] = await Promise.all([
          getProfileShowcase(session.user.id),
          getTaggedInShowcase(session.user.id),
        ]);
        if (cancelled) return;
        setLatestVisit(showcase.latestVisit);
        setLatestTagged(tagged.latestTagged);
        const ids = [firstPhotoId(showcase.latestVisit), tagged.latestTagged?.photoIds?.[0]].filter(
          (id): id is string => id != null,
        );
        if (ids.length === 0) return;
        const urls = await getPhotoViewUrls(ids);
        if (!cancelled) setPreviewUrls(urls);
      } catch {
        // A preview that cannot load falls back to its glyph — the row still
        // says what the section is, which is the part that matters here.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // What the section is showing right now, under its name. Live where it can
  // be known cheaply, and honest where it cannot.
  function sectionSummary(key: ProfileSectionKey): string {
    switch (key) {
      case 'latest_reviews':
        return latestVisit?.places?.name ?? 'No reviews yet';
      case 'tagged_in':
        return latestTagged?.placeName ?? 'Not tagged in anything yet';
      case 'prompts':
        return prompts.length === 0
          ? 'None answered yet'
          : `${prompts.length} of ${PROMPT_SLOT_COUNT} answered`;
      case 'map':
        return showMap ? 'Shown on your profile' : 'Hidden — turn it on above';
      case 'collections':
        return PROFILE_SECTION_HINTS.collections;
    }
  }

  function sectionThumb(key: ProfileSectionKey): string | undefined {
    if (key === 'latest_reviews') return previewUrls[firstPhotoId(latestVisit) ?? ''];
    if (key === 'tagged_in') return previewUrls[latestTagged?.photoIds?.[0] ?? ''];
    return undefined;
  }

  const loadPrompts = useCallback(async () => {
    if (!session) return;
    setPrompts(await listPrompts(session.user.id));
  }, [session]);

  // useFocusEffect, not useEffect — adding/editing a prompt now happens on
  // its own pushed route (prompt-editor.tsx), so this screen needs to
  // refetch when regaining focus on the way back, not just once on mount.
  useFocusEffect(
    useCallback(() => {
      loadPrompts();
    }, [loadPrompts])
  );

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
    goBack();
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
        <PromptCard existing={item} onChanged={loadPrompts} onDragStart={drag} />
      </ScaleDecorator>
    ),
    [loadPrompts]
  );

  // Not memoised. It closes over the preview state and two helpers that are
  // rebuilt every render, so a dependency array here would either be a lie or
  // would have to list everything anyway — and there are five rows.
  const renderSectionItem = ({ item, drag, isActive }: RenderItemParams<ProfileSectionKey>) => {
      const thumb = sectionThumb(item);
      return (
        <ScaleDecorator>
          {/* The whole row still takes a long press, because someone who does
              not spot the handle should not be stuck. The handle below is the
              quicker way in, not the only one. */}
          <Pressable onLongPress={drag} disabled={isActive} delayLongPress={150}>
            <ThemedView
              type={isActive ? 'backgroundSelected' : 'backgroundElement'}
              style={styles.sectionRow}>
              {thumb ? (
                <Image source={{ uri: thumb }} style={styles.sectionThumb} contentFit="cover" />
              ) : (
                <View style={[styles.sectionThumb, styles.sectionGlyph]}>
                  <Ionicons
                    name={PROFILE_SECTION_ICONS[item] as never}
                    size={20}
                    color={theme.textSecondary}
                  />
                </View>
              )}
              <View style={styles.sectionText}>
                <ThemedText type="default">{PROFILE_SECTION_LABELS[item]}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {sectionSummary(item)}
                </ThemedText>
              </View>
              {/* Dragging starts the moment this is touched — no hold. A
                  handle you have to press and WAIT on is the thing that made
                  this feel impossible to grab. */}
              <Pressable
                onPressIn={drag}
                disabled={isActive}
                hitSlop={Spacing.two}
                accessibilityLabel={`Reorder ${PROFILE_SECTION_LABELS[item]}`}
                style={styles.sectionHandle}>
                <Ionicons name="reorder-three-outline" size={24} color={theme.textSecondary} />
              </Pressable>
            </ThemedView>
          </Pressable>
        </ScaleDecorator>
      );
  };

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackLink seed="edit-profile" />
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

          <CheckboxRow
            accentIndex={5}
            checked={showMap}
            label="Show a map of places I’ve visited on my profile"
            onPress={() => setShowMap((prev) => !prev)}
          />

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
          {prompts.length < PROMPT_SLOT_COUNT && <PromptCard existing={undefined} onChanged={loadPrompts} />}

          <ThemedText type="sectionLabel">Layout</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The order these appear on your profile. Drag a handle to move one.
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
  promptsList: {
    gap: Spacing.two,
  },
  sectionList: {
    gap: Spacing.two,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    // Tighter than it was: the row carries its own thumbnail now, which
    // gives it height without needing padding to look like a card.
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
  },
  sectionThumb: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
  },
  // Where a section has no photograph of its own to show.
  sectionGlyph: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  sectionText: {
    flex: 1,
    gap: 2,
  },
  // Padded rather than sized, so the grab area is thumb-sized while the
  // glyph stays small.
  sectionHandle: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
});
