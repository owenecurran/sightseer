import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fold, Unfold } from '@/components/ui/unfold';
import { Avatar } from '@/components/ui/avatar';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, Spacing } from '@/constants/theme';
import { submitReport, type ReportReason } from '@/lib/reports';
import { userErrorMessage } from '@/lib/user-error';

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
  // Reports from a post target the review. Reports from a profile target the account.
  post?: { visitId: string; placeName: string; note?: string | null } | null;
};

export function ReportModal({ visible, ...props }: ReportModalProps) {
  const targetKey = props.post ? `visit:${props.post.visitId}` : `user:${props.reportedUserId}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={props.onClose}>
      {visible && <ReportForm key={targetKey} {...props} />}
    </Modal>
  );
}

function ReportForm({
  onClose,
  reporterId,
  reportedUserId,
  reportedUserName,
  reportedUserAvatarUrl,
  post,
}: Omit<ReportModalProps, 'visible'>) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!reason) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await submitReport({
        reporterId,
        reason,
        details,
        target: post ? { visitId: post.visitId } : { reportedUserId },
      });
      setIsSubmitted(true);
    } catch (err) {
      setError(userErrorMessage(err, 'Could not send that report. Try again.'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.overlay}>
      <Unfold style={styles.sheet}>
        {isSubmitted ? (
          <>
            <Fold>
              <ThemedText type="displaySerif" style={styles.centerText}>
                Report submitted
              </ThemedText>
            </Fold>
            <Fold>
              <ThemedText type="caption" style={styles.centerText}>
                Thanks. Our team will take a look.
              </ThemedText>
            </Fold>
            <Fold>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.doneButton, pressed && styles.pressed]}>
                <ThemedText type="roundedStat" themeColor="background" style={styles.buttonLabel}>
                  Done
                </ThemedText>
              </Pressable>
            </Fold>
          </>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.formContent}>
            <Fold>
              <ThemedText type="displaySerif">{post ? 'Report review' : 'Report account'}</ThemedText>
            </Fold>

            <Fold style={styles.targetRow}>
              <Avatar uri={reportedUserAvatarUrl} name={reportedUserName} size={40} />
              <ThemedText type="smallBold">{reportedUserName}</ThemedText>
            </Fold>

            {/* The corresponding post, highlighted, only when this dialog
                was opened from somewhere it's actually visible. */}
            {post && (
              <Fold>
                <ThemedView type="backgroundElement" style={styles.postPreview}>
                  <ThemedText type="meta">
                    Post
                  </ThemedText>
                  <ThemedText type="smallBold">{post.placeName}</ThemedText>
                  {post.note && (
                    <ThemedText type="small" numberOfLines={3}>
                      {post.note}
                    </ThemedText>
                  )}
                </ThemedView>
              </Fold>
            )}

            <View style={styles.section}>
              <Fold>
                <ThemedText type="meta">
                  What&apos;s wrong?
                </ThemedText>
              </Fold>
              {/* Each reason is its own fold; the reasons that share a line
                  are one panel between them. */}
              <View style={styles.reasonGrid}>
                {REPORT_REASONS.map((r) => {
                  const isSelected = reason === r.value;
                  return (
                    <Fold key={r.value}>
                      <Pressable onPress={() => setReason(r.value)}>
                        <ThemedView
                          type={isSelected ? 'backgroundSelected' : 'backgroundElement'}
                          style={styles.reasonChip}>
                          <ThemedText type="small" themeColor={isSelected ? 'background' : 'text'}>
                            {r.label}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    </Fold>
                  );
                })}
              </View>
            </View>

            <View style={styles.section}>
              <Fold>
                <ThemedText type="meta">
                  Details (optional)
                </ThemedText>
              </Fold>
              <Fold>
                <TextField
                  placeholder="Anything else we should know?"
                  value={details}
                  onChangeText={setDetails}
                  multiline
                />
              </Fold>
            </View>

            {error && (
              <Fold>
                <ThemedText type="small" themeColor="danger">
                  {error}
                </ThemedText>
              </Fold>
            )}

            <Fold style={styles.actionsRow}>
              <Pressable onPress={onClose} disabled={isSubmitting} hitSlop={8}>
                <ThemedText type="action">
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
                  <ThemedText type="roundedStat" themeColor="background" style={styles.buttonLabel}>
                    Submit report
                  </ThemedText>
                )}
              </Pressable>
            </Fold>
          </ScrollView>
        )}
      </Unfold>
    </View>
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
  // A percentage cap works here because the overlay this sits in has a
  // definite height to take it of; the scroll view inside shrinks to it.
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    padding: Spacing.four,
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
  // The size the app's own Button sets this face at.
  buttonLabel: {
    fontSize: 16,
  },
});
