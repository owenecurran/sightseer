import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { reportVisit, type ReportReason } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

type VisitMenuProps = {
  visitId: string;
  isOwner: boolean;
  onDeleted: () => void;
};

export function VisitMenu({ visitId, isOwner, onDeleted }: VisitMenuProps) {
  const { session } = useAuth();
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reportedReason, setReportedReason] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setIsOpen((prev) => !prev);
    setError(null);
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    const { error: deleteError } = await supabase.from('visits').delete().eq('id', visitId);
    setIsDeleting(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setConfirmingDelete(false);
    onDeleted();
  }

  async function handleReport(reason: ReportReason) {
    if (!session) return;
    setError(null);
    try {
      await reportVisit(session.user.id, visitId, reason);
      setReportedReason(reason);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit that report.');
    }
  }

  return (
    <>
      {!isOpen ? (
        <Pressable onPress={handleToggle} hitSlop={12} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
        </Pressable>
      ) : (
        <ThemedView type="backgroundSelected" style={styles.panel}>
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          {isOwner ? (
            <View style={styles.row}>
              <Pressable onPress={() => router.push({ pathname: '/edit-visit/[id]', params: { id: visitId } })}>
                <ThemedText type="small">Edit</ThemedText>
              </Pressable>
              <Pressable onPress={() => setConfirmingDelete(true)}>
                <ThemedText type="small" style={styles.deleteLabel}>
                  Delete
                </ThemedText>
              </Pressable>
            </View>
          ) : reportedReason ? (
            <ThemedText type="small">Reported ✓</ThemedText>
          ) : (
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary">
                Report:
              </ThemedText>
              {REPORT_REASONS.map((r) => (
                <Pressable key={r.value} onPress={() => handleReport(r.value)}>
                  <ThemedText type="small">{r.label}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}

          <Pressable onPress={handleToggle}>
            <ThemedText type="small" themeColor="textSecondary">
              Close
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      <ConfirmDeleteModal
        visible={confirmingDelete}
        message="Delete this visit? This can't be undone."
        isConfirming={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Icon itself stays the same visual size, but the touchable box is padded
  // out to a real ~44px target (22 icon + 2×11 padding), plus a pressed
  // state so a tap gets instant visual acknowledgement instead of feeling
  // like nothing happened.
  iconButton: {
    padding: Spacing.two + 3,
  },
  pressed: {
    opacity: 0.5,
  },
  panel: {
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    alignItems: 'center',
  },
  deleteLabel: {
    color: '#F22B22',
  },
});
