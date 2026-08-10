import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Spacing } from '@/constants/theme';
import { submitReport, type ReportReason } from '@/lib/reports';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

type ReportModalProps = {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  reportedUserId: string;
  reportedUserName: string;
  reportedUserAvatarUrl?: string | null;
  // The specific post being reported alongside the user, if this was opened
  // from a place a post is actually visible (a feed card, a visit page) —
  // omitted when opened from a profile's own menu, where there's no single
  // post in view to attach.
  post?: { visitId: string; placeName: string; note?: string | null } | null;
};

// The one report form for the whole app — every "Report" entry point
// (feed cards, a visit's own page, a user's profile menu) opens this same
// centered dialog instead of each rolling its own inline UI. Replaces
// VisitMenu's old expanding-panel-of-reasons — per direct feedback that
// panel read as cramped crammed into the three-dot button's own popup —
// with a real focused dialog: same dimmed-backdrop-plus-centered-sheet
// template as ConfirmDeleteModal/PhotoCropModal, scaled up for a form
// instead of a single confirm action.
export function ReportModal({
  visible,
  onClose,
  reporterId,
  reportedUserId,
  reportedUserName,
  reportedUserAvatarUrl,
  post,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to a blank form each time the dialog is (re)opened for a new
  // target, rather than showing a stale previous report's reason/details.
  useEffect(() => {
    if (!visible) return;
    setReason(null);
    setDetails('');
    setIsSubmitting(false);
    setIsSubmitted(false);
    setError(null);
  }, [visible, reportedUserId, post?.visitId]);

  async function handleSubmit() {
    if (!reason) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await submitReport({
        reporterId,
        reason,
        details,
        reportedUserId,
        visitId: post?.visitId,
      });
      setIsSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit that report.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView type="background" style={styles.sheet}>
          {isSubmitted ? (
            <>
              <ThemedText type="headline" style={styles.centerText}>
                Report submitted
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
                Thanks — our team will take a look.
              </ThemedText>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
                <ThemedText type="smallBold" themeColor="background">
                  Done
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
              <ThemedText type="headline">Report</ThemedText>

              {/* The reported user, highlighted — always present, this
                  dialog is always about a specific person even when a post
                  prompted it. */}
              <View style={styles.targetRow}>
                <Avatar uri={reportedUserAvatarUrl} name={reportedUserName} size={40} />
                <ThemedText type="smallBold">{reportedUserName}</ThemedText>
              </View>

              {/* The corresponding post, highlighted, only when this dialog
                  was opened from somewhere it's actually visible. */}
              {post && (
                <ThemedView type="backgroundElement" style={styles.postPreview}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Post
                  </ThemedText>
                  <ThemedText type="smallBold">{post.placeName}</ThemedText>
                  {post.note && (
                    <ThemedText type="small" numberOfLines={3}>
                      {post.note}
                    </ThemedText>
                  )}
                </ThemedView>
              )}

              <View style={styles.section}>
                <ThemedText type="small" themeColor="textSecondary">
                  What's wrong?
                </ThemedText>
                <View style={styles.reasonGrid}>
                  {REPORT_REASONS.map((r) => {
                    const isSelected = reason === r.value;
                    return (
                      <Pressable key={r.value} onPress={() => setReason(r.value)}>
                        <ThemedView
                          type={isSelected ? 'backgroundSelected' : 'backgroundElement'}
                          style={styles.reasonChip}>
                          <ThemedText type="small" themeColor={isSelected ? 'background' : 'text'}>
                            {r.label}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.section}>
                <ThemedText type="small" themeColor="textSecondary">
                  Details (optional)
                </ThemedText>
                <TextField
                  placeholder="Anything else we should know?"
                  value={details}
                  onChangeText={setDetails}
                  multiline
                />
              </View>

              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}

              <View style={styles.actionsRow}>
                <Pressable onPress={onClose} disabled={isSubmitting} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Cancel
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={handleSubmit}
                  disabled={isSubmitting || !reason}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.submitButton,
                    (isSubmitting || !reason) && styles.submitButtonDisabled,
                    pressed && styles.pressed,
                  ]}>
                  {isSubmitting ? (
                    <ActivityIndicator color={BrandColors.background} size="small" />
                  ) : (
                    <ThemedText type="smallBold" themeColor="background">
                      Submit report
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  formContent: {
    gap: Spacing.three,
  },
  centerText: {
    textAlign: 'center',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  postPreview: {
    padding: Spacing.two,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
  section: {
    gap: Spacing.two,
  },
  reasonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  reasonChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.four,
    alignItems: 'center',
  },
  submitButton: {
    backgroundColor: BrandColors.sage,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  doneButton: {
    alignSelf: 'center',
    backgroundColor: BrandColors.sage,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.8,
  },
});
