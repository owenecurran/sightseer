import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoCropModal, type CroppedPhoto } from '@/components/photo-crop-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { PROFILE_PROMPTS } from '@/constants/profile-prompts';
import { pickImageFromLibrary } from '@/lib/image-picker';
import {
  deletePrompt,
  savePrompt,
  uploadPromptPhoto,
  type AttachmentInput,
  type AttachmentType,
  type ProfilePrompt,
} from '@/lib/profile-prompts';

const ANSWER_TYPES: { value: AttachmentType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'photo', label: 'Photo' },
  { value: 'review', label: 'Review' },
  { value: 'board', label: 'Board' },
];

const TEXT_ANSWER_MAX_LENGTH = 200;
const MAX_ATTACHMENTS = 5;

type LocalAttachment = {
  attachmentType: AttachmentType;
  textValue: string;
  visitId: string | null;
  boardId: string | null;
  existingPhotoR2Key: string | null;
  pendingPhotoUri: string | null;
  pendingPhotoMimeType?: string;
};

function emptyAttachment(): LocalAttachment {
  return {
    attachmentType: 'text',
    textValue: '',
    visitId: null,
    boardId: null,
    existingPhotoR2Key: null,
    pendingPhotoUri: null,
  };
}

type OwnVisitOption = { id: string; placeName: string; rating: number };
type OwnBoardOption = { id: string; name: string };

type PromptEditorProps = {
  userId: string;
  position: number;
  existing: ProfilePrompt | undefined;
  usedSlugs: string[];
  ownVisits: OwnVisitOption[];
  ownBoards: OwnBoardOption[];
  onChanged: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
};

export function PromptEditor({
  userId,
  position,
  existing,
  usedSlugs,
  ownVisits,
  ownBoards,
  onChanged,
  onMoveUp,
  onMoveDown,
}: PromptEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [promptSlug, setPromptSlug] = useState(existing?.promptSlug ?? '');
  const [attachments, setAttachments] = useState<LocalAttachment[]>(() =>
    existing && existing.attachments.length > 0
      ? existing.attachments.map((a) => ({
          attachmentType: a.attachmentType,
          textValue: a.textValue ?? '',
          visitId: a.visitId,
          boardId: a.boardId,
          existingPhotoR2Key: a.photoR2Key,
          pendingPhotoUri: null,
        }))
      : [emptyAttachment()]
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cropSource, setCropSource] = useState<{ uri: string; index: number } | null>(null);

  const availablePrompts = PROFILE_PROMPTS.filter(
    (p) => p.slug === existing?.promptSlug || !usedSlugs.includes(p.slug)
  );

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
        resolved.push({
          attachmentType: a.attachmentType,
          textValue: a.attachmentType === 'text' ? a.textValue.trim() : null,
          photoR2Key: a.attachmentType === 'photo' ? photoR2Key : null,
          visitId: a.attachmentType === 'review' ? a.visitId : null,
          boardId: a.attachmentType === 'board' ? a.boardId : null,
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
            {onMoveUp && (
              <Pressable onPress={onMoveUp}>
                <ThemedText type="small" themeColor="textSecondary">
                  ↑
                </ThemedText>
              </Pressable>
            )}
            {onMoveDown && (
              <Pressable onPress={onMoveDown}>
                <ThemedText type="small" themeColor="textSecondary">
                  ↓
                </ThemedText>
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
        Prompt
      </ThemedText>
      <View style={styles.chipRow}>
        {availablePrompts.map((p) => (
          <Pressable key={p.slug} onPress={() => setPromptSlug(p.slug)}>
            <ThemedView type={promptSlug === p.slug ? 'backgroundSelected' : 'background'} style={styles.chip}>
              <ThemedText type="small">{p.label}</ThemedText>
            </ThemedView>
          </Pressable>
        ))}
      </View>

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
            <View style={styles.chipRow}>
              {ownVisits.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No reviews yet.
                </ThemedText>
              )}
              {ownVisits.map((v) => (
                <Pressable key={v.id} onPress={() => updateAttachment(index, { visitId: v.id })}>
                  <ThemedView
                    type={attachment.visitId === v.id ? 'backgroundSelected' : 'background'}
                    style={styles.chip}>
                    <ThemedText type="small">
                      {v.placeName} · {v.rating.toFixed(1)} ★
                    </ThemedText>
                  </ThemedView>
                </Pressable>
              ))}
            </View>
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
});
