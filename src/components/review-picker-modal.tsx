import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReviewBrowser } from '@/components/review-browser';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { BoardVisitItem } from '@/lib/boards';

type ReviewPickerModalProps = {
  visible: boolean;
  onClose: () => void;
  items: BoardVisitItem[];
  photoUrls: Record<string, string>;
  viewerId?: string;
  selectedVisitId?: string | null;
  onSelectVisit: (visitId: string) => void;
};

// Choosing a review to feature, in a sheet of its own.
//
// It was inline in the prompt editor before, which meant a browser with its
// own scrolling sitting inside the editor's scrolling — two vertical
// scrollers arguing over the same drag, and a list that had to be given an
// arbitrary fixed height to stop it swallowing the page. A sheet solves both
// by having nothing above or below it to fight with: it owns the screen while
// it is open, and the list is as tall as the sheet.
//
// The same FilterSortMenu-style furniture as every other sheet in the app —
// a dimmed page behind, a rounded panel, a title row with a close button.
export function ReviewPickerModal({
  visible,
  onClose,
  items,
  photoUrls,
  viewerId,
  selectedVisitId,
  onSelectVisit,
}: ReviewPickerModalProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* The scrim closes it. A sheet you can only leave by finding the right
          button is a sheet people get stuck in. */}
      <Pressable style={styles.scrim} onPress={onClose} />

      <ThemedView
        type="screen"
        style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
        <View style={styles.grabber} />

        <View style={styles.titleRow}>
          <ThemedText type="subtitle">Choose a review</ThemedText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Ionicons name="close" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <ReviewBrowser
            items={items}
            photoUrls={photoUrls}
            viewerId={viewerId}
            isOwner
            selectedVisitId={selectedVisitId}
            // Picking one is the whole point of the sheet, so it closes
            // behind the choice rather than leaving someone to find the way
            // out after they have already decided.
            onSelectVisit={(visitId) => {
              onSelectVisit(visitId);
              onClose();
            }}
          />
        </View>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(3, 16, 9, 0.6)',
  },
  // Most of the screen, not all of it: the strip of dimmed page left at the
  // top is what says this is a sheet over something rather than a new screen.
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '88%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(234,231,207,0.3)',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: {
    flex: 1,
  },
});
