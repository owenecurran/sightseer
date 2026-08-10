import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { ReportModal } from '@/components/report-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type UserMenuProps = {
  reporterId: string;
  targetUserId: string;
  targetUserName: string;
  targetUserAvatarUrl?: string | null;
  isBlocked: boolean;
  isUpdatingBlock: boolean;
  onBlock: () => void;
  onUnblock: () => void;
  // Only offered when the target actually follows the viewer — removing a
  // follower who doesn't follow you in the first place wouldn't do anything.
  targetFollowsMe: boolean;
  isRemovingFollower: boolean;
  onRemoveFollower: () => void;
};

// Same three-dot-button-plus-popup-panel shape as visit-menu.tsx, for the
// other place in the app a person is the subject rather than a specific
// post — Report, Block/Unblock, and Remove as follower all live here
// instead of user/[id].tsx's old ad-hoc inline "Block" text link (which had
// no Report or remove-follower option at all).
export function UserMenu({
  reporterId,
  targetUserId,
  targetUserName,
  targetUserAvatarUrl,
  isBlocked,
  isUpdatingBlock,
  onBlock,
  onUnblock,
  targetFollowsMe,
  isRemovingFollower,
  onRemoveFollower,
}: UserMenuProps) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setIsOpen((prev) => !prev)}
        hitSlop={12}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
        <Ionicons name="ellipsis-horizontal" size={22} color={theme.textSecondary} />
      </Pressable>

      {isOpen && (
        <ThemedView type="backgroundSelected" style={styles.panel}>
          <View style={styles.list}>
            <Pressable
              onPress={() => {
                setIsOpen(false);
                setIsReportOpen(true);
              }}>
              <ThemedText type="small">Report</ThemedText>
            </Pressable>
            {targetFollowsMe && (
              <Pressable
                onPress={() => {
                  setIsOpen(false);
                  setConfirmingRemove(true);
                }}>
                <ThemedText type="small">Remove as follower</ThemedText>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                if (isBlocked) {
                  setIsOpen(false);
                  onUnblock();
                } else {
                  setIsOpen(false);
                  setConfirmingBlock(true);
                }
              }}
              disabled={isUpdatingBlock}>
              <ThemedText type="small" style={styles.destructiveLabel}>
                {isBlocked ? 'Unblock' : 'Block'}
              </ThemedText>
            </Pressable>
          </View>
          <Pressable onPress={() => setIsOpen(false)}>
            <ThemedText type="small" themeColor="textSecondary">
              Close
            </ThemedText>
          </Pressable>
        </ThemedView>
      )}

      <ReportModal
        visible={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        reporterId={reporterId}
        reportedUserId={targetUserId}
        reportedUserName={targetUserName}
        reportedUserAvatarUrl={targetUserAvatarUrl}
      />

      <ConfirmDeleteModal
        visible={confirmingBlock}
        message={`Block ${targetUserName}? They won't be able to follow you or see your content.`}
        confirmLabel="Block"
        isConfirming={isUpdatingBlock}
        onConfirm={() => {
          setConfirmingBlock(false);
          onBlock();
        }}
        onCancel={() => setConfirmingBlock(false)}
      />

      <ConfirmDeleteModal
        visible={confirmingRemove}
        message={`Remove ${targetUserName} as a follower?`}
        confirmLabel="Remove"
        isConfirming={isRemovingFollower}
        onConfirm={() => {
          setConfirmingRemove(false);
          onRemoveFollower();
        }}
        onCancel={() => setConfirmingRemove(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  destructiveLabel: {
    color: '#F22B22',
  },
});
