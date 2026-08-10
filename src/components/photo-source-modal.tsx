import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PhotoSourceModalProps = {
  visible: boolean;
  onCancel: () => void;
  onPickCamera: () => void;
  onPickLibrary: () => void;
};

// A source choice in front of every photo pick (review-form.tsx's
// pickImage — camera vs. library) instead of always going straight to the
// library. Camera-taken photos still go through the exact same
// crop/upload pipeline afterward (PhotoCropModal etc. treat the resulting
// asset identically regardless of source), so this is the only new piece.
// Same centered-dialog template as TaggedUsersModal/ReportModal (dimmed
// backdrop + centered sheet) rather than a native Alert/ActionSheet, to
// stay visually consistent with the rest of the app instead of dropping
// into unstyled OS chrome. No camera option on web — expo-image-picker's
// launchCameraAsync isn't available there.
export function PhotoSourceModal({ visible, onCancel, onPickCamera, onPickLibrary }: PhotoSourceModalProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <ThemedView type="backgroundElement" style={styles.sheet}>
          {Platform.OS !== 'web' && (
            <Pressable onPress={onPickCamera} style={styles.option}>
              <Ionicons name="camera-outline" size={22} color={theme.text} />
              <ThemedText type="smallBold">Take photo</ThemedText>
            </Pressable>
          )}
          <Pressable onPress={onPickLibrary} style={styles.option}>
            <Ionicons name="image-outline" size={22} color={theme.text} />
            <ThemedText type="smallBold">Choose from library</ThemedText>
          </Pressable>
          <View style={styles.divider} />
          <Pressable onPress={onCancel} style={styles.option}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Cancel
            </ThemedText>
          </Pressable>
        </ThemedView>
      </Pressable>
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
    maxWidth: 360,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.two,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(234,231,207,0.15)',
    marginHorizontal: Spacing.four,
  },
});
