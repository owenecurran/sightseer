import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { PlaceSearchInput } from '@/components/place-search-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { LoadableImage } from '@/components/ui/loadable-image';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Spacing } from '@/constants/theme';
import {
  PROFILE_PROMPT_CATEGORY_LABELS,
  PROFILE_PROMPTS,
  type ProfilePromptCategory,
} from '@/constants/profile-prompts';
import { useTheme } from '@/hooks/use-theme';
import type { Database } from '@/lib/database.types';
import { pickImageFromLibrary } from '@/lib/image-picker';
import {
  deletePrompt,
  getVisitPhotoOptions,
  savePrompt,
  uploadPromptPhoto,
  type AttachmentInput,
  type AttachmentType,
  type ProfilePrompt,
  type VisitPhotoOption,
} from '@/lib/profile-prompts';

type PlaceRow = Database['public']['Tables']['places']['Row'];

const ANSWER_TYPES: { value: AttachmentType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'photo', label: 'Photo' },
  { value: 'review', label: 'Review' },
  { value: 'board', label: 'Board' },
  { value: 'place', label: 'Place' },
  { value: 'travel_book', label: 'Travel book' },
];

const TEXT_ANSWER_MAX_LENGTH = 200;
const MAX_ATTACHMENTS = 5;

type LocalAttachment = {
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
};

function emptyAttachment(): LocalAttachment {
  return {
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
  };
}

type OwnVisitOption = { id: string; placeName: string; rating: number | null };
type OwnBoardOption = { id: string; name: string };
type OwnTravelBookOption = { id: string; title: string };

type PromptEditorProps = {
  userId: string;
  position: number;
  existing: ProfilePrompt | undefined;
  usedSlugs: string[];
  ownVisits: OwnVisitOption[];
  ownBoards: OwnBoardOption[];
  ownTravelBooks: OwnTravelBookOption[];
  onChanged: () => void;
  // Long-press handle to start a drag-reorder — omitted for the trailing
  // "+ Add a prompt" slot, which isn't a real reorderable row.
  onDragStart?: () => void;
};

export function PromptEditor({
  userId,
  position,
  existing,
  usedSlugs,
  ownVisits,
  ownBoards,
  ownTravelBooks,
  onChanged,
  onDragStart,
}: PromptEditorProps) {
  const theme = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [promptSlug, setPromptSlug] = useState(existing?.promptSlug ?? '');
  // Defaults to whichever category the existing prompt belongs to (so
  // reopening one for edit doesn't look "reset"); starts unselected for a
  // brand-new slot so no prompts show until a category is picked.
  const [selectedCategory, setSelectedCategory] = useState<ProfilePromptCategory | null>(
    () => PROFILE_PROMPTS.find((p) => p.slug === existing?.promptSlug)?.category ?? null
  );
  const [attachments, setAttachments] = useState<LocalAttachment[]>(() =>
    existing && existing.attachments.length > 0
      ? existing.attachments.map((a) => ({
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
        }))
      : [emptyAttachment()]
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; index: number } | null>(null);
  // Keyed by visitId — fetched on demand the moment a review is picked (see
  // handleSelectVisit), including for an already-attached prompt being
  // reopened for edit, so the "which photo?" row always has something to
  // show once a visit is selected.
  const [visitPhotoOptions, setVisitPhotoOptions] = useState<Record<string, VisitPhotoOption[]>>({});

  // Pre-fetch photo options for any 'review' attachment already carrying a
  // visitId (reopening an existing prompt for edit) — otherwise the "which
  // photo?" row would only ever appear after re-picking the same visit.
  useEffect(() => {
    for (const a of attachments) {
      if (a.attachmentType === 'review' && a.visitId && !visitPhotoOptions[a.visitId]) {
        getVisitPhotoOptions(a.visitId).then((options) =>
          setVisitPhotoOptions((prev) => ({ ...prev, [a.visitId as string]: options }))
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelectVisit(index: number, visitId: string) {
    updateAttachment(index, { visitId, visitPhotoId: null });
    if (!visitPhotoOptions[visitId]) {
      getVisitPhotoOptions(visitId).then((options) =>
        setVisitPhotoOptions((prev) => ({ ...prev, [visitId]: options }))
      );
    }
  }

  const availablePrompts = PROFILE_PROMPTS.filter(
    (p) => p.slug === existing?.promptSlug || !usedSlugs.includes(p.slug)
  );
  const categories = Object.keys(PROFILE_PROMPT_CATEGORY_LABELS) as ProfilePromptCategory[];
  const promptsInSelectedCategory = selectedCategory
    ? availablePrompts.filter((p) => p.category === selectedCategory)
    : [];

  function handleOpen() {
    setIsEditing(true);
    setError(null);
  }

  function updateAttachment(index: number, patch: Partial<LocalAttachment>) {
    setAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function handleAddAttachment() {
    setAttachments((prev) => [...prev, emptyAttachment()]);
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
        // 'place' photos are optional, so a pending upload only happens if
        // the user actually picked one — existingPhotoR2Key already covers
        // "keep what was there" for both 'photo' (required) and 'place'.
        let photoR2Key = a.existingPhotoR2Key;
        if ((a.attachmentType === 'photo' || a.attachmentType === 'place') && a.pendingPhotoUri) {
          photoR2Key = await uploadPromptPhoto(a.pendingPhotoUri, a.pendingPhotoMimeType);
        }
        resolved.push({
          attachmentType: a.attachmentType,
          textValue: a.attachmentType === 'text' ? a.textValue.trim() : null,
          photoR2Key: a.attachmentType === 'photo' || a.attachmentType === 'place' ? photoR2Key : null,
          visitId: a.attachmentType === 'review' ? a.visitId : null,
          boardId: a.attachmentType === 'board' ? a.boardId : null,
          placeId: a.attachmentType === 'place' ? a.placeId : null,
          travelBookId: a.attachmentType === 'travel_book' ? a.travelBookId : null,
          visitPhotoId: a.attachmentType === 'review' ? a.visitPhotoId : null,
        });
      }

      await savePrompt({
        id: existing?.id,
        userId,
        promptSlug,
        position,
        attachments: resolved,
      });

      setIsEditing(false);
      // Reset local state for the "+ Add a prompt" slot specifically — its
      // component instance is reused across every new prompt added in one
      // session (key="new" never changes), so without this the next add
      // would silently start from this one's leftover slug/attachments.
      if (!existing) {
        setPromptSlug('');
        setAttachments([emptyAttachment()]);
      }
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that prompt.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemovePrompt() {
    if (!existing) return;
    setError(null);
    try {
      await deletePrompt(existing.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that prompt.');
    }
  }

  if (!isEditing) {
    if (existing) {
      return (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            {PROFILE_PROMPTS.find((p) => p.slug === existing.promptSlug)?.label ?? existing.promptSlug}
          </ThemedText>
          <View style={styles.row}>
            <Pressable onPress={handleOpen}>
              <ThemedText type="small">Edit</ThemedText>
            </Pressable>
            <Pressable onPress={handleRemovePrompt}>
              <ThemedText type="small" themeColor="textSecondary">
                Remove
              </ThemedText>
            </Pressable>
            {onDragStart && (
              <Pressable onLongPress={onDragStart} delayLongPress={150} hitSlop={8} style={styles.dragHandle}>
                <Ionicons name="reorder-three-outline" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
        </ThemedView>
      );
    }
    return (
      <Pressable onPress={handleOpen}>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" themeColor="textSecondary">
            + Add a prompt
          </ThemedText>
        </ThemedView>
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.card, styles.editingCard]}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      <ThemedText type="small" themeColor="textSecondary">
        Category
      </ThemedText>
      <View style={styles.chipRow}>
        {categories.map((category) => (
          <Pressable
            key={category}
            onPress={() => setSelectedCategory((prev) => (prev === category ? null : category))}>
            <ThemedView
              type={selectedCategory === category ? 'backgroundSelected' : 'background'}
              style={styles.chip}>
              <ThemedText type="small">{PROFILE_PROMPT_CATEGORY_LABELS[category]}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>

      {selectedCategory && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Prompt
          </ThemedText>
          <View style={styles.chipRow}>
            {promptsInSelectedCategory.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No prompts left in this category.
              </ThemedText>
            )}
            {promptsInSelectedCategory.map((p) => (
              <Pressable key={p.slug} onPress={() => setPromptSlug(p.slug)}>
                <ThemedView type={promptSlug === p.slug ? 'backgroundSelected' : 'background'} style={styles.chip}>
                  <ThemedText type="small">{p.label}</ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>
        </>
      )}

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

          <View style={styles.chipRow}>
            {ANSWER_TYPES.map((t) => (
              <Pressable key={t.value} onPress={() => updateAttachment(index, { attachmentType: t.value })}>
                <ThemedView
                  type={attachment.attachmentType === t.value ? 'backgroundSelected' : 'background'}
                  style={styles.chip}>
                  <ThemedText type="small">{t.label}</ThemedText>
                </ThemedView>
              </Pressable>
            ))}
          </View>

          {attachment.attachmentType === 'text' && (
            <TextField
              placeholder="Your answer"
              value={attachment.textValue}
              onChangeText={(text) => updateAttachment(index, { textValue: text.slice(0, TEXT_ANSWER_MAX_LENGTH) })}
              multiline
            />
          )}

          {attachment.attachmentType === 'photo' && (
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

          {attachment.attachmentType === 'review' && (
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
                      style={styles.chip}>
                      <ThemedText type="small">
                        {v.placeName}
                        {v.rating != null ? ` · ${v.rating.toFixed(1)} ★` : ''}
                      </ThemedText>
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
            </>
          )}

          {attachment.attachmentType === 'board' && (
            <View style={styles.chipRow}>
              {ownBoards.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No boards yet.
                </ThemedText>
              )}
              {ownBoards.map((b) => (
                <Pressable key={b.id} onPress={() => updateAttachment(index, { boardId: b.id })}>
                  <ThemedView
                    type={attachment.boardId === b.id ? 'backgroundSelected' : 'background'}
                    style={styles.chip}>
                    <ThemedText type="small">{b.name}</ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          )}

          {attachment.attachmentType === 'travel_book' && (
            <View style={styles.chipRow}>
              {ownTravelBooks.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No travel books yet.
                </ThemedText>
              )}
              {ownTravelBooks.map((b) => (
                <Pressable key={b.id} onPress={() => updateAttachment(index, { travelBookId: b.id })}>
                  <ThemedView
                    type={attachment.travelBookId === b.id ? 'backgroundSelected' : 'background'}
                    style={styles.chip}>
                    <ThemedText type="small">{b.title}</ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
          )}

          {attachment.attachmentType === 'place' && (
            <View style={styles.placePicker}>
              {attachment.placeId && attachment.placeName && (
                <ThemedView type="backgroundSelected" style={styles.chip}>
                  <ThemedText type="small">{attachment.placeName}</ThemedText>
                </ThemedView>
              )}
              <PlaceSearchInput
                placeholder="Search for a place"
                onSelect={(place: PlaceRow) => updateAttachment(index, { placeId: place.id, placeName: place.name })}
              />
              <Button
                label={
                  attachment.pendingPhotoUri
                    ? 'Photo selected ✓'
                    : attachment.existingPhotoR2Key
                      ? 'Change photo'
                      : 'Add a photo (optional)'
                }
                variant="secondary"
                onPress={() => handlePickPhoto(index)}
              />
            </View>
          )}
        </View>
      ))}

      {attachments.length < MAX_ATTACHMENTS && (
        <Pressable onPress={handleAddAttachment}>
          <ThemedText type="small" themeColor="textSecondary">
            + Add another attachment
          </ThemedText>
        </Pressable>
      )}

      <View style={styles.row}>
        <Button label="Save" onPress={handleSave} loading={isSaving} />
        <Pressable onPress={() => setIsEditing(false)}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>
      </View>

      <PhotoCropModal
        visible={cropSource != null}
        uri={cropSource?.uri ?? null}
        onCancel={handleCropCancel}
        onConfirm={handleCropConfirm}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  editingCard: {
    gap: Spacing.two,
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
  chip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  placePicker: {
    gap: Spacing.two,
    alignItems: 'flex-start',
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
  dragHandle: {
    marginLeft: 'auto',
  },
});
