import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

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
  const [reportedReason, setReportedReason] = useState<ReportReason | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setIsOpen((prev) => !prev);
    setConfirmingDelete(false);
    setError(null);
  }

  async function handleDelete() {
    setError(null);
    const { error: deleteError } = await supabase.from('visits').delete().eq('id', visitId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
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

  if (!isOpen) {
    return (
      <Pressable onPress={handleToggle} hitSlop={8}>
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
      </Pressable>
    );
  }

  return (
    <ThemedView type="backgroundSelected" style={styles.panel}>
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}

      {isOwner ? (
        confirmingDelete ? (
          <View style={styles.row}>
            <ThemedText type="small">Delete this visit?</ThemedText>
            <Pressable onPress={handleDelete}>
              <ThemedText type="smallBold">Confirm</ThemedText>
            </Pressable>
            <Pressable onPress={() => setConfirmingDelete(false)}>
              <ThemedText type="small" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setConfirmingDelete(true)}>
            <ThemedText type="small">Delete</ThemedText>
          </Pressable>
        )
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
  );
}

const styles = StyleSheet.create({
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
});
