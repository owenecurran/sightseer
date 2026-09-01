import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TagSticker } from '@/components/ui/tag-sticker';
import { BrandColors, Spacing } from '@/constants/theme';
import type { Tag } from '@/lib/visit-tags';

type TagPickerModalProps = {
  visible: boolean;
  tags: Tag[];
  selectedSlugs: string[];
  max: number;
  onToggle: (slug: string) => void;
  onClose: () => void;
};

// A focused sheet for choosing a review's tags.
//
// The vocabulary is seventeen and growing, which as an inline wrapped grid
// pushed the rest of the form most of a screen down and still had to be
// read as a wall. Given its own scrollable sheet it can show every tag as
// the sticker it will actually become, which is the point: you are picking
// artwork that goes on the review, not ticking boxes.
//
// Taller sheet than the app's other dialogs (which are short confirmations)
// because scrolling is the whole interaction here.
export function TagPickerModal({
  visible,
  tags,
  selectedSlugs,
  max,
  onToggle,
  onClose,
}: TagPickerModalProps) {
  const isFull = selectedSlugs.length >= max;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop taps close, but the sheet itself swallows them so a tap
          meant for a tag near the edge doesn't dismiss instead. */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText type="sectionLabel">Add tags</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Optional · {selectedSlugs.length} of {max} chosen
                </ThemedText>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="sage">
                  Done
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}>
              {tags.map((tag) => {
                const isSelected = selectedSlugs.includes(tag.slug);
                // Once the limit is reached the rest recede rather than
                // vanish — a list that reflows as you use it makes the next
                // tap land on something you didn't aim at.
                const isDisabled = !isSelected && isFull;
                return (
                  <Pressable
                    key={tag.slug}
                    onPress={() => onToggle(tag.slug)}
                    disabled={isDisabled}
                    style={[
                      styles.row,
                      isSelected && styles.rowSelected,
                      isDisabled && styles.rowDisabled,
                    ]}>
                    <TagSticker slug={tag.slug} label={tag.label} />
                    {isSelected && (
                      <ThemedText type="small" themeColor="sage">
                        ✓
                      </ThemedText>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    // Tall enough to scroll through meaningfully, short enough that the
    // form behind it still reads as the thing being filled in.
    maxHeight: '70%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  headerText: {
    gap: Spacing.half,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowSelected: {
    borderColor: BrandColors.sage,
  },
  rowDisabled: {
    opacity: 0.45,
  },
});
