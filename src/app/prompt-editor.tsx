import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { AttachmentPreview, type PreviewData } from '@/components/attachment-preview';
import { AttachmentTypePicker } from '@/components/attachment-type-picker';
import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { LocationSearchModal } from '@/components/location-search-modal';
import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { PromptQuestionPicker } from '@/components/prompt-question-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { TextField } from '@/components/ui/text-field';
import { RatingGlassBadgeGated } from '@/components/ui/rating-glass-badge-gated';
import { BrandColors, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { PROFILE_PROMPT_CATEGORY_LABELS, PROFILE_PROMPTS, type ProfilePromptCategory } from '@/constants/profile-prompts';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useAuth } from '@/lib/auth-context';
import { listMyBoards } from '@/lib/boards';
import type { Database } from '@/lib/database.types';
import { pickImageFromLibrary } from '@/lib/image-picker';
import {
  deletePrompt,
  getBoardPhotoOptions,
  getPlacePhotoOptions,
  getPromptPhotoUrls,
  getTravelBookPhotoOptions,
  getVisitPhotoOptions,
  listPrompts,
  savePrompt,
  uploadPromptPhoto,
  type AttachmentDisplayMode,
  type AttachmentInput,
  type AttachmentType,
  type VisitPhotoOption,
} from '@/lib/profile-prompts';
import { supabase } from '@/lib/supabase';
import { listUserTravelBooks } from '@/lib/travel-books';
import { goBack } from '@/lib/navigation';

type PlaceRow = Database['public']['Tables']['places']['Row'];

const TEXT_ANSWER_MAX_LENGTH = 200;
const MAX_GRID_PHOTOS = 4;

type LocalAttachment = {
  // Only set for an attachment loaded from an existing saved prompt — used
  // to look up its already-uploaded photo URL for the live preview (a
  // brand-new attachment has no id yet, and previews from pendingPhotoUri
  // instead — see previewDataFor below).
  id: string | null;
  // Whether AttachmentTypePicker's format-list box is expanded (choosing a
  // format) or collapsed to a compact header (format already chosen,
  // showing that format's own editor below it instead) — see
  // emptyAttachment/the existing-attachment load mapping for the two
  // different defaults.
  formatExpanded: boolean;
  attachmentType: AttachmentType;
  textValue: string;
  visitId: string | null;
  boardId: string | null;
  placeId: string | null;
  placeName: string | null;
  travelBookId: string | null;
  existingPhotoR2Key: string | null;
  pendingPhotoUri: string | null;
  pendingPhotoMimeType?: string;
  // 'review' only — which of the visit's photos to feature; null = default
  // to the first one (see profile-prompts.ts's mapAttachment).
  visitPhotoId: string | null;
  // 'place': the chosen cover photo. 'board'/'travel_book': the chosen
  // cover photo when displayMode is 'cover'.
  coverPhotoId: string | null;
  // 'board'/'travel_book' only — which of the two photo layouts to show.
  displayMode: AttachmentDisplayMode;
  // 'board'/'travel_book' in 'grid' mode: up to MAX_GRID_PHOTOS photos.
  gridPhotoIds: string[];
  // 'review' only — whether the note text/rating stamp show at all (see
  // review-prompt-card.tsx).
  showNote: boolean;
  showRatingStamp: boolean;
};

function emptyAttachment(): LocalAttachment {
  return {
    id: null,
    // A fresh attachment has no format chosen yet, so its picker starts
    // expanded — an existing one loaded from a saved prompt already has a
    // real format and starts collapsed instead (see the load effect below).
    formatExpanded: true,
    attachmentType: 'text',
    textValue: '',
    visitId: null,
    boardId: null,
    placeId: null,
    placeName: null,
    travelBookId: null,
    existingPhotoR2Key: null,
    pendingPhotoUri: null,
    visitPhotoId: null,
    coverPhotoId: null,
    displayMode: 'cover',
    gridPhotoIds: [],
    showNote: true,
    showRatingStamp: true,
  };
}

type OwnVisitOption = { id: string; placeName: string; rating: number | null; note: string | null };
type OwnBoardOption = { id: string; name: string };
type OwnTravelBookOption = { id: string; title: string };

// Full-page prompt editor, pushed from PromptCard (edit-profile.tsx) for
// both "+ Add a prompt" (no promptId param) and "Edit" on an existing one
// (promptId param) — see prompt-card.tsx's own comment for why this moved
// off the inline expanding card it used to be. Loads everything itself
// (the existing prompt if any, the user's own visits/boards/travel books,
// and every other prompt's slug to grey out already-used ones) rather than
// receiving it via route params, since expo-router params are string-only
// and this is little more than what edit-profile.tsx already fetched.
// Sized to sit inside a chip without setting its height — small enough that
// the chip still reads as a chip.
const VISIT_CHIP_STAMP_SIZE = 22;

export default function PromptEditorScreen() {
  const { promptId } = useLocalSearchParams<{ promptId?: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();

  const [isLoaded, setIsLoaded] = useState(false);
  const [existingId, setExistingId] = useState<string | undefined>(undefined);
  const [position, setPosition] = useState(0);
  const [usedSlugs, setUsedSlugs] = useState<string[]>([]);
  const [ownVisits, setOwnVisits] = useState<OwnVisitOption[]>([]);
  const [ownBoards, setOwnBoards] = useState<OwnBoardOption[]>([]);
  const [ownTravelBooks, setOwnTravelBooks] = useState<OwnTravelBookOption[]>([]);

  const [promptSlug, setPromptSlug] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProfilePromptCategory | null>(null);
  const [attachments, setAttachments] = useState<LocalAttachment[]>([emptyAttachment()]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; index: number } | null>(null);
  // Which attachment's 'place' picker the map modal below is currently open
  // for — null when closed. Index, not a boolean, since more than one
  // attachment can be a 'place' type at once.
  const [locationPickerIndex, setLocationPickerIndex] = useState<number | null>(null);
  const [visitPhotoOptions, setVisitPhotoOptions] = useState<Record<string, VisitPhotoOption[]>>({});
  const [placePhotoOptions, setPlacePhotoOptions] = useState<Record<string, VisitPhotoOption[]>>({});
  const [boardPhotoOptions, setBoardPhotoOptions] = useState<Record<string, VisitPhotoOption[]>>({});
  const [travelBookPhotoOptions, setTravelBookPhotoOptions] = useState<Record<string, VisitPhotoOption[]>>({});
  // Existing 'photo'-attachment previews (keyed by attachment id, not index —
  // see LocalAttachment.id) — a brand-new 'photo' attachment previews from
  // its own pendingPhotoUri directly instead, so this only ever needs to
  // cover attachments loaded from a saved prompt.
  const [photoAttachmentUrls, setPhotoAttachmentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!session) return;
    (async () => {
      const [prompts, boards, travelBooks, visitsRes] = await Promise.all([
        listPrompts(session.user.id),
        listMyBoards(session.user.id),
        // Owner-only (not listMyTravelBooks) — the travel_book prompt-
        // attachment RLS only allows tb.user_id = auth.uid(), so a
        // collaborator book must never appear as pickable here.
        listUserTravelBooks(session.user.id),
        supabase
          .from('visits')
          .select('id, rating, note, places!place_id(name)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ]);

      const existing = promptId ? prompts.find((p) => p.id === promptId) : undefined;
      setExistingId(existing?.id);
      setUsedSlugs(prompts.filter((p) => p.id !== promptId).map((p) => p.promptSlug));
      setPosition(existing?.position ?? (prompts.length > 0 ? Math.max(...prompts.map((p) => p.position)) + 1 : 0));
      setOwnBoards(boards.map((b) => ({ id: b.id, name: b.name })));
      setOwnTravelBooks(travelBooks.map((b) => ({ id: b.id, title: b.title })));
      setOwnVisits(
        (visitsRes.data ?? []).map((v) => ({
          id: v.id,
          rating: v.rating,
          note: v.note,
          placeName: v.places?.name ?? 'Unknown place',
        }))
      );

      setPromptSlug(existing?.promptSlug ?? '');
      setSelectedCategory(PROFILE_PROMPTS.find((p) => p.slug === existing?.promptSlug)?.category ?? null);
      setAttachments(
        existing && existing.attachments.length > 0
          ? existing.attachments.map((a) => ({
              id: a.id,
              // Already has a real format — start collapsed, not mid-pick.
              formatExpanded: false,
              attachmentType: a.attachmentType,
              textValue: a.textValue ?? '',
              visitId: a.visitId,
              boardId: a.boardId,
              placeId: a.placeId,
              placeName: a.placeName,
              travelBookId: a.travelBookId,
              existingPhotoR2Key: a.photoR2Key,
              pendingPhotoUri: null,
              visitPhotoId: a.visitPhotoId,
              coverPhotoId: a.coverPhotoId,
              displayMode: a.displayMode ?? 'cover',
              gridPhotoIds: a.gridPhotoIds,
              showNote: a.showNote,
              showRatingStamp: a.showRatingStamp,
            }))
          : [emptyAttachment()]
      );

      // Preview URLs for any already-saved 'photo' attachments (a
      // freshly-picked one previews from pendingPhotoUri directly instead).
      const photoAttachmentIds = (existing?.attachments ?? [])
        .filter((a) => a.attachmentType === 'photo' && a.photoR2Key)
        .map((a) => a.id);
      if (photoAttachmentIds.length > 0) {
        getPromptPhotoUrls(photoAttachmentIds).then(setPhotoAttachmentUrls);
      }

      // Pre-fetch photo options for any attachment already carrying a
      // visit/place/board/travel-book id, so the pickers have something to
      // show immediately rather than only after re-picking the same one.
      for (const a of existing?.attachments ?? []) {
        if (a.attachmentType === 'review' && a.visitId) {
          getVisitPhotoOptions(a.visitId).then((options) =>
            setVisitPhotoOptions((prev) => ({ ...prev, [a.visitId as string]: options }))
          );
        }
        if (a.attachmentType === 'place' && a.placeId) {
          getPlacePhotoOptions(a.placeId).then((options) =>
            setPlacePhotoOptions((prev) => ({ ...prev, [a.placeId as string]: options }))
          );
        }
        if (a.attachmentType === 'board' && a.boardId) {
          getBoardPhotoOptions(a.boardId).then((options) =>
            setBoardPhotoOptions((prev) => ({ ...prev, [a.boardId as string]: options }))
          );
        }
        if (a.attachmentType === 'travel_book' && a.travelBookId) {
          getTravelBookPhotoOptions(a.travelBookId).then((options) =>
            setTravelBookPhotoOptions((prev) => ({ ...prev, [a.travelBookId as string]: options }))
          );
        }
      }

      setIsLoaded(true);
    })();
  }, [session, promptId]);

  function handleSelectVisit(index: number, visitId: string) {
    updateAttachment(index, { visitId, visitPhotoId: null });
    if (!visitPhotoOptions[visitId]) {
      getVisitPhotoOptions(visitId).then((options) =>
        setVisitPhotoOptions((prev) => ({ ...prev, [visitId]: options }))
      );
    }
  }

  function handleSelectBoard(index: number, boardId: string) {
    updateAttachment(index, { boardId, coverPhotoId: null, gridPhotoIds: [] });
    if (!boardPhotoOptions[boardId]) {
      getBoardPhotoOptions(boardId).then((options) =>
        setBoardPhotoOptions((prev) => ({ ...prev, [boardId]: options }))
      );
    }
  }

  function handleSelectTravelBook(index: number, travelBookId: string) {
    updateAttachment(index, { travelBookId, coverPhotoId: null, gridPhotoIds: [] });
    if (!travelBookPhotoOptions[travelBookId]) {
      getTravelBookPhotoOptions(travelBookId).then((options) =>
        setTravelBookPhotoOptions((prev) => ({ ...prev, [travelBookId]: options }))
      );
    }
  }

  function handleSelectPlace(index: number, place: PlaceRow) {
    updateAttachment(index, { placeId: place.id, placeName: place.name, coverPhotoId: null });
    if (!placePhotoOptions[place.id]) {
      getPlacePhotoOptions(place.id).then((options) =>
        setPlacePhotoOptions((prev) => ({ ...prev, [place.id]: options }))
      );
    }
  }

  function handleToggleGridPhoto(index: number, photoId: string) {
    setAttachments((prev) =>
      prev.map((a, i) => {
        if (i !== index) return a;
        if (a.gridPhotoIds.includes(photoId)) {
          return { ...a, gridPhotoIds: a.gridPhotoIds.filter((id) => id !== photoId) };
        }
        if (a.gridPhotoIds.length >= MAX_GRID_PHOTOS) return a;
        return { ...a, gridPhotoIds: [...a.gridPhotoIds, photoId] };
      })
    );
  }

  // Shared by 'place' (always cover-only) and 'board'/'travel_book' (cover
  // or grid, see renderCoverOrGridPicker) — a "None" chip plus a thumbnail
  // per candidate photo, sourced from that place/board/travel book's own
  // reviews (never a manual upload).
  function renderCoverPhotoPicker(
    options: VisitPhotoOption[],
    selectedId: string | null,
    onSelect: (photoId: string | null) => void
  ) {
    if (options.length === 0) return null;
    return (
      <View style={styles.photoOptionRow}>
        <ThemedText type="small" themeColor="textSecondary">
          Cover photo (optional)
        </ThemedText>
        <View style={styles.chipRow}>
          <Pressable onPress={() => onSelect(null)}>
            <ThemedView type={selectedId == null ? 'backgroundSelected' : 'background'} style={styles.chip}>
              <ThemedText type="small">None</ThemedText>
            </ThemedView>
          </Pressable>
          {options.map((photo) => (
            <Pressable key={photo.id} onPress={() => onSelect(photo.id)}>
              <LoadableImage
                source={{ uri: photo.url }}
                style={[styles.photoOptionThumb, selectedId === photo.id && styles.photoOptionThumbSelected]}
              />
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  function renderCoverOrGridPicker(index: number, attachment: LocalAttachment, options: VisitPhotoOption[]) {
    if (options.length === 0) return null;
    return (
      <View style={styles.photoOptionRow}>
        <View style={styles.chipRow}>
          {(['cover', 'grid'] as const).map((mode) => (
            <Pressable key={mode} onPress={() => updateAttachment(index, { displayMode: mode })}>
              <ThemedView
                type={attachment.displayMode === mode ? 'backgroundSelected' : 'background'}
                style={styles.chip}>
                <ThemedText type="small">{mode === 'cover' ? 'Cover photo' : 'Photo grid'}</ThemedText>
              </ThemedView>
            </Pressable>
          ))}
        </View>
        {attachment.displayMode === 'cover' ? (
          renderCoverPhotoPicker(options, attachment.coverPhotoId, (photoId) =>
            updateAttachment(index, { coverPhotoId: photoId })
          )
        ) : (
          <View style={styles.photoOptionRow}>
            <ThemedText type="small" themeColor="textSecondary">
              {attachment.gridPhotoIds.length}/{MAX_GRID_PHOTOS} selected
            </ThemedText>
            <View style={styles.chipRow}>
              {options.map((photo) => (
                <Pressable key={photo.id} onPress={() => handleToggleGridPhoto(index, photo.id)}>
                  <LoadableImage
                    source={{ uri: photo.url }}
                    style={[
                      styles.photoOptionThumb,
                      attachment.gridPhotoIds.includes(photo.id) && styles.photoOptionThumbSelected,
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  }

  const availablePrompts = PROFILE_PROMPTS.filter((p) => p.slug === promptSlug || !usedSlugs.includes(p.slug));
  const categories = Object.keys(PROFILE_PROMPT_CATEGORY_LABELS) as ProfilePromptCategory[];
  const promptsInSelectedCategory = selectedCategory
    ? availablePrompts.filter((p) => p.category === selectedCategory)
    : [];

  // Resolves one in-progress attachment into exactly what AttachmentPreview
  // needs to render it the same way profile-prompts-section.tsx eventually
  // will — from this screen's own already-loaded option lookups, never a
  // fresh fetch, so the preview updates live as the user picks things.
  function previewDataFor(a: LocalAttachment): PreviewData {
    if (a.attachmentType === 'text') {
      return a.textValue.trim() ? { kind: 'text', text: a.textValue.trim() } : { kind: 'empty' };
    }

    if (a.attachmentType === 'photo') {
      const url = a.pendingPhotoUri ?? (a.id ? photoAttachmentUrls[a.id] : undefined);
      return url ? { kind: 'photo', url } : { kind: 'empty' };
    }

    if (a.attachmentType === 'review') {
      if (!a.visitId) return { kind: 'empty' };
      const visit = ownVisits.find((v) => v.id === a.visitId);
      if (!visit) return { kind: 'empty' };
      const options = visitPhotoOptions[a.visitId] ?? [];
      const photoUrl = (a.visitPhotoId ? options.find((o) => o.id === a.visitPhotoId) : options[0])?.url;
      return {
        kind: 'review',
        visitId: a.visitId,
        placeName: visit.placeName,
        rating: visit.rating,
        note: visit.note,
        photoUrl,
        showNote: a.showNote,
        showRatingStamp: a.showRatingStamp,
      };
    }

    if (a.attachmentType === 'board' || a.attachmentType === 'travel_book') {
      const id = a.attachmentType === 'board' ? a.boardId : a.travelBookId;
      if (!id) return { kind: 'empty' };
      const title = a.attachmentType === 'board' ? ownBoards.find((b) => b.id === id)?.name : ownTravelBooks.find((b) => b.id === id)?.title;
      if (!title) return { kind: 'empty' };
      const options = a.attachmentType === 'board' ? (boardPhotoOptions[id] ?? []) : (travelBookPhotoOptions[id] ?? []);
      if (a.displayMode === 'grid') {
        if (a.gridPhotoIds.length === 0) return { kind: 'empty' };
        return { kind: 'grid', title, photoIds: a.gridPhotoIds, photoUrls: Object.fromEntries(options.map((o) => [o.id, o.url])) };
      }
      return { kind: 'cover', title, thumbnailUrl: a.coverPhotoId ? options.find((o) => o.id === a.coverPhotoId)?.url : undefined };
    }

    // 'place'
    if (!a.placeId || !a.placeName) return { kind: 'empty' };
    const options = placePhotoOptions[a.placeId] ?? [];
    return { kind: 'cover', title: a.placeName, thumbnailUrl: a.coverPhotoId ? options.find((o) => o.id === a.coverPhotoId)?.url : undefined };
  }

  function updateAttachment(index: number, patch: Partial<LocalAttachment>) {
    setAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function handleRemoveAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function handlePickPhoto(index: number) {
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setCropSource({ uri: result.uri, index });
  }

  function handleCropCancel() {
    setCropSource(null);
  }

  function handleCropConfirm(result: CroppedPhoto) {
    if (cropSource) {
      updateAttachment(cropSource.index, { pendingPhotoUri: result.uri, pendingPhotoMimeType: 'image/jpeg' });
    }
    setCropSource(null);
  }

  async function handleSave() {
    if (!session) return;
    if (!promptSlug) {
      setError('Pick a prompt.');
      return;
    }
    for (const a of attachments) {
      if (a.attachmentType === 'text' && !a.textValue.trim()) {
        setError('Write an answer for every attachment, or remove the empty one.');
        return;
      }
      if (a.attachmentType === 'photo' && !a.pendingPhotoUri && !a.existingPhotoR2Key) {
        setError('Pick a photo for every attachment, or remove the empty one.');
        return;
      }
      if (a.attachmentType === 'review' && !a.visitId) {
        setError('Pick a review for every attachment, or remove the empty one.');
        return;
      }
      if (a.attachmentType === 'board' && !a.boardId) {
        setError('Pick a board for every attachment, or remove the empty one.');
        return;
      }
      if (a.attachmentType === 'place' && !a.placeId) {
        setError('Pick a place for every attachment, or remove the empty one.');
        return;
      }
      if (a.attachmentType === 'travel_book' && !a.travelBookId) {
        setError('Pick a travel book for every attachment, or remove the empty one.');
        return;
      }
    }

    setError(null);
    setIsSaving(true);
    try {
      const resolved: AttachmentInput[] = [];
      for (const a of attachments) {
        let photoR2Key = a.existingPhotoR2Key;
        if (a.attachmentType === 'photo' && a.pendingPhotoUri) {
          photoR2Key = await uploadPromptPhoto(a.pendingPhotoUri, a.pendingPhotoMimeType);
        }
        const isCoverType = a.attachmentType === 'place' || a.attachmentType === 'board' || a.attachmentType === 'travel_book';
        const usesGrid = isCoverType && a.attachmentType !== 'place' && a.displayMode === 'grid';
        resolved.push({
          attachmentType: a.attachmentType,
          textValue: a.attachmentType === 'text' ? a.textValue.trim() : null,
          photoR2Key: a.attachmentType === 'photo' ? photoR2Key : null,
          visitId: a.attachmentType === 'review' ? a.visitId : null,
          boardId: a.attachmentType === 'board' ? a.boardId : null,
          placeId: a.attachmentType === 'place' ? a.placeId : null,
          travelBookId: a.attachmentType === 'travel_book' ? a.travelBookId : null,
          visitPhotoId: a.attachmentType === 'review' ? a.visitPhotoId : null,
          coverPhotoId: isCoverType && !usesGrid ? a.coverPhotoId : null,
          displayMode: a.attachmentType === 'board' || a.attachmentType === 'travel_book' ? a.displayMode : null,
          gridPhotoIds: usesGrid ? a.gridPhotoIds : null,
          showNote: a.attachmentType === 'review' ? a.showNote : undefined,
          showRatingStamp: a.attachmentType === 'review' ? a.showRatingStamp : undefined,
        });
      }

      await savePrompt({
        id: existingId,
        userId: session.user.id,
        promptSlug,
        position,
        attachments: resolved,
      });

      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that prompt.');
      setIsSaving(false);
    }
  }

  async function handleRemovePrompt() {
    if (!existingId) return;
    setError(null);
    try {
      await deletePrompt(existingId);
      goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that prompt.');
    }
  }

  if (!isLoaded) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <BackLink seed="prompt-editor" />
          <ThemedText type="displaySerif">{existingId ? 'Edit prompt' : 'Add a prompt'}</ThemedText>
        </View>

        <KeyboardAwareScroll
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}>
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <PromptQuestionPicker
            categories={categories}
            selectedCategory={selectedCategory}
            onSelectCategory={(category) => setSelectedCategory((prev) => (prev === category ? null : category))}
            promptsInCategory={promptsInSelectedCategory}
            selectedSlug={promptSlug}
            onSelectPrompt={setPromptSlug}
          />

          {attachments.map((attachment, index) => (
            <View key={index} style={styles.attachmentBlock}>
              <View style={styles.row}>
                <ThemedText type="small" themeColor="textSecondary">
                  Attachment {index + 1}
                </ThemedText>
                {attachments.length > 1 && (
                  <Pressable onPress={() => handleRemoveAttachment(index)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Remove
                    </ThemedText>
                  </Pressable>
                )}
              </View>

              <AttachmentTypePicker
                value={attachment.attachmentType}
                expanded={attachment.formatExpanded}
                onSelect={(type) => updateAttachment(index, { attachmentType: type, formatExpanded: false })}
                onToggleExpanded={() => updateAttachment(index, { formatExpanded: !attachment.formatExpanded })}
              />

              {!attachment.formatExpanded && attachment.attachmentType === 'text' && (
                <TextField
                  placeholder="Your answer"
                  value={attachment.textValue}
                  onChangeText={(text) => updateAttachment(index, { textValue: text.slice(0, TEXT_ANSWER_MAX_LENGTH) })}
                  multiline
                />
              )}

              {!attachment.formatExpanded && attachment.attachmentType === 'photo' && (
                <Button
                  label={
                    attachment.pendingPhotoUri
                      ? 'Photo selected ✓'
                      : attachment.existingPhotoR2Key
                        ? 'Change photo'
                        : 'Pick a photo'
                  }
                  variant="secondary"
                  onPress={() => handlePickPhoto(index)}
                />
              )}

              {!attachment.formatExpanded && attachment.attachmentType === 'review' && (
                <>
                  <View style={styles.chipRow}>
                    {ownVisits.length === 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        No reviews yet.
                      </ThemedText>
                    )}
                    {ownVisits.map((v) => (
                      <Pressable key={v.id} onPress={() => handleSelectVisit(index, v.id)}>
                        <ThemedView
                          type={attachment.visitId === v.id ? 'backgroundSelected' : 'background'}
                          style={[styles.chip, styles.visitChip]}>
                          <ThemedText type="small">{v.placeName}</ThemedText>
                          {v.rating != null && (
                            <RatingGlassBadgeGated rating={v.rating} size={VISIT_CHIP_STAMP_SIZE} seed={v.id} />
                          )}
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>

                  {/* Only worth showing a choice once there's actually more
                      than one photo to choose between. */}
                  {attachment.visitId && (visitPhotoOptions[attachment.visitId]?.length ?? 0) > 1 && (
                    <View style={styles.photoOptionRow}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Photo to feature
                      </ThemedText>
                      <View style={styles.chipRow}>
                        {visitPhotoOptions[attachment.visitId]!.map((photo) => (
                          <Pressable key={photo.id} onPress={() => updateAttachment(index, { visitPhotoId: photo.id })}>
                            <LoadableImage
                              source={{ uri: photo.url }}
                              style={[
                                styles.photoOptionThumb,
                                (attachment.visitPhotoId ?? visitPhotoOptions[attachment.visitId!]![0].id) === photo.id &&
                                  styles.photoOptionThumbSelected,
                              ]}
                            />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Text off drops the note/photo-sidebar split entirely
                      and lets the photo take the whole card instead — see
                      review-prompt-card.tsx's useSidebarLayout. Rating off
                      just hides the floating corner stamp. Independent of
                      each other. */}
                  {attachment.visitId && (
                    <View style={styles.chipRow}>
                      <Pressable onPress={() => updateAttachment(index, { showNote: !attachment.showNote })}>
                        <ThemedView type={attachment.showNote ? 'backgroundSelected' : 'background'} style={styles.chip}>
                          <ThemedText type="small">{attachment.showNote ? 'Review text ✓' : 'Review text hidden'}</ThemedText>
                        </ThemedView>
                      </Pressable>
                      <Pressable onPress={() => updateAttachment(index, { showRatingStamp: !attachment.showRatingStamp })}>
                        <ThemedView
                          type={attachment.showRatingStamp ? 'backgroundSelected' : 'background'}
                          style={styles.chip}>
                          <ThemedText type="small">
                            {attachment.showRatingStamp ? 'Rating stamp ✓' : 'Rating stamp hidden'}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    </View>
                  )}
                </>
              )}

              {!attachment.formatExpanded && attachment.attachmentType === 'board' && (
                <>
                  <View style={styles.chipRow}>
                    {ownBoards.length === 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        No boards yet.
                      </ThemedText>
                    )}
                    {ownBoards.map((b) => (
                      <Pressable key={b.id} onPress={() => handleSelectBoard(index, b.id)}>
                        <ThemedView
                          type={attachment.boardId === b.id ? 'backgroundSelected' : 'background'}
                          style={styles.chip}>
                          <ThemedText type="small">{b.name}</ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>
                  {attachment.boardId &&
                    renderCoverOrGridPicker(index, attachment, boardPhotoOptions[attachment.boardId] ?? [])}
                </>
              )}

              {!attachment.formatExpanded && attachment.attachmentType === 'travel_book' && (
                <>
                  <View style={styles.chipRow}>
                    {ownTravelBooks.length === 0 && (
                      <ThemedText type="small" themeColor="textSecondary">
                        No travel books yet.
                      </ThemedText>
                    )}
                    {ownTravelBooks.map((b) => (
                      <Pressable key={b.id} onPress={() => handleSelectTravelBook(index, b.id)}>
                        <ThemedView
                          type={attachment.travelBookId === b.id ? 'backgroundSelected' : 'background'}
                          style={styles.chip}>
                          <ThemedText type="small">{b.title}</ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </View>
                  {attachment.travelBookId &&
                    renderCoverOrGridPicker(index, attachment, travelBookPhotoOptions[attachment.travelBookId] ?? [])}
                </>
              )}

              {!attachment.formatExpanded && attachment.attachmentType === 'place' && (
                <View style={styles.placePicker}>
                  {attachment.placeId && attachment.placeName && (
                    <ThemedView type="backgroundSelected" style={styles.chip}>
                      <ThemedText type="small">{attachment.placeName}</ThemedText>
                    </ThemedView>
                  )}
                  <Pressable onPress={() => setLocationPickerIndex(index)}>
                    <ThemedView type="backgroundElement" style={styles.chip}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {attachment.placeId ? 'Change place' : 'Search for a place'}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                  {attachment.placeId &&
                    renderCoverPhotoPicker(placePhotoOptions[attachment.placeId] ?? [], attachment.coverPhotoId, (photoId) =>
                      updateAttachment(index, { coverPhotoId: photoId })
                    )}
                </View>
              )}

              {!attachment.formatExpanded && (
                <View style={styles.previewSection}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Preview
                  </ThemedText>
                  <AttachmentPreview
                    label={PROFILE_PROMPTS.find((p) => p.slug === promptSlug)?.label ?? 'Preview'}
                    data={previewDataFor(attachment)}
                  />
                </View>
              )}
            </View>
          ))}

          <View style={styles.row}>
            <Button label="Save" onPress={handleSave} loading={isSaving} />
            <Pressable onPress={() => goBack()}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>

          {existingId && (
            <Pressable onPress={handleRemovePrompt}>
              <ThemedText type="small" themeColor="textSecondary">
                Remove this prompt
              </ThemedText>
            </Pressable>
          )}
        </KeyboardAwareScroll>

        <PhotoCropModal
          visible={cropSource != null}
          uri={cropSource?.uri ?? null}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />

        <LocationSearchModal
          visible={locationPickerIndex != null}
          onCancel={() => setLocationPickerIndex(null)}
          onSelect={(place) => {
            if (locationPickerIndex != null) handleSelectPlace(locationPickerIndex, place);
            setLocationPickerIndex(null);
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
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.two,
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  attachmentBlock: {
    gap: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.3)',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  visitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  placePicker: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  previewSection: {
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  photoOptionRow: {
    gap: Spacing.two,
  },
  photoOptionThumb: {
    width: 56,
    height: 56,
    borderRadius: Spacing.one,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  photoOptionThumbSelected: {
    borderColor: BrandColors.sage,
  },
});
