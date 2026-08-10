import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type VisitMenuProps = {
  visitId: string;
  isOwner: boolean;
  onDeleted: () => void;
  // Only needed for the report flow (an owner never sees it, see below) —
  // who and what this visit is, so ReportModal can highlight both.
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  placeName: string;
  note?: string | null;
};

export function VisitMenu({
  visitId,
  isOwner,
  onDeleted,
  authorId,
  authorName,
  authorAvatarUrl,
  placeName,
  note,
}: VisitMenuProps) {
  const { session } = useAuth();
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
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

          {/* A short, single-column list of plain actions — the old inline
              row of report reasons crammed into this exact popup was the
              direct complaint (read as cluttered coming off the three-dot
              button); Report now just opens ReportModal instead of trying
              to fit a whole form here. */}
          <View style={styles.list}>
            {isOwner ? (
              <>
                <Pressable onPress={() => router.push({ pathname: '/edit-visit/[id]', params: { id: visitId } })}>
                  <ThemedText type="small">Edit</ThemedText>
                </Pressable>
                <Pressable onPress={() => setConfirmingDelete(true)}>
                  <ThemedText type="small" style={styles.deleteLabel}>
                    Delete
                  </ThemedText>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => {
                  setIsOpen(false);
                  setIsReportOpen(true);
                }}>
                <ThemedText type="small">Report</ThemedText>
              </Pressable>
            )}
          </View>

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

      {session && !isOwner && (
        <ReportModal
          visible={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          reporterId={session.user.id}
          reportedUserId={authorId}
          reportedUserName={authorName}
          reportedUserAvatarUrl={authorAvatarUrl}
          post={{ visitId, placeName, note }}
        />
      )}
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
  list: {
    gap: Spacing.two,
  },
  deleteLabel: {
    color: '#F22B22',
  },
});
