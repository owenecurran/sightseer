import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fold, Unfold } from '@/components/ui/unfold';
import { Spacing } from '@/constants/theme';

const DESTRUCTIVE_RED = '#F22B22';

type ConfirmDeleteModalProps = {
  visible: boolean;
  message: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Shared centered confirm dialog for every destructive action in the app
// (deleting a visit, unsaving from a board, removing a travel-book item) —
// same overlay/sheet template as photo-crop-modal.tsx (transparent + fade +
// dimmed backdrop + centered sheet), replacing the old inline
// expanding-panel confirm pattern so the user can actually see it clearly,
// with the destructive action itself always in the same red.
export function ConfirmDeleteModal({
  visible,
  message,
  confirmLabel = 'Delete',
  isConfirming,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Unfold style={styles.sheet}>
          <Fold>
            <ThemedText type="lead" style={styles.message}>
              {message}
            </ThemedText>
          </Fold>
          <Fold style={styles.actionsRow}>
            <Pressable onPress={onCancel} disabled={isConfirming} hitSlop={8}>
              <ThemedText type="action">
                Cancel
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={isConfirming}
              hitSlop={8}
              style={({ pressed }) => [styles.confirmButton, pressed && styles.pressed]}>
              {isConfirming ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText type="roundedStat" style={styles.confirmLabel}>
                  {confirmLabel}
                </ThemedText>
              )}
            </Pressable>
          </Fold>
        </Unfold>
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
    maxWidth: 340,
    padding: Spacing.four,
    gap: Spacing.four,
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    alignItems: 'center',
  },
  confirmButton: {
    backgroundColor: DESTRUCTIVE_RED,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same size the app's own Button sets this face at.
  confirmLabel: {
    color: '#fff',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});
