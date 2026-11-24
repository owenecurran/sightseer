import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Fold, Unfold } from '@/components/ui/unfold';
import { TagStickerGraphic } from '@/components/ui/tag-sticker-graphic';
import { BrandColors, Spacing } from '@/constants/theme';
import { groupTags, type Tag } from '@/lib/visit-tags';

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
  const insets = useSafeAreaInsets();
  const isFull = selectedSlugs.length >= max;
  // Grouped here rather than by the caller: every caller would otherwise do
  // the same walk, and the sections are purely a presentation concern.
  const sections = groupTags(tags);

  return (
    // Both translucency flags, not one: without them the modal's window stops
    // at the Android navigation bar, leaving a strip of the form showing under
    // a sheet that is supposed to own the bottom of the screen (measured: 216px
    // on a gesture-nav device). RN warns if navigationBarTranslucent is set
    // without statusBarTranslucent, so they travel together. The sheet then
    // reaches the true screen bottom and pays for it with insets.bottom below.
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}>
      {/* Backdrop taps close, but the sheet itself swallows them so a tap
          meant for a tag near the edge doesn't dismiss instead. */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
          <Unfold paper="backgroundElement" from="bottom" style={[styles.sheet, { marginBottom: -insets.bottom }]}>
            <Fold style={styles.header}>
              <View style={styles.headerText}>
                <ThemedText type="displaySerif">Add tags</ThemedText>
                <ThemedText type="meta">
                  Optional · {selectedSlugs.length} of {max} chosen
                </ThemedText>
              </View>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText type="action" themeColor="sage">
                  Done
                </ThemedText>
              </Pressable>
            </Fold>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                // The sheet now runs under the gesture bar, so the last tag
                // would sit beneath it without this.
                { paddingBottom: Spacing.five + insets.bottom },
              ]}
              showsVerticalScrollIndicator={false}>
              {sections.map((section) => (
                <View key={section.category} style={styles.section}>
                  <Fold>
                    <ThemedText type="meta" style={styles.sectionHeading}>
                      {section.category}
                    </ThemedText>
                  </Fold>
                  {/* A GRID of equal tiles, two across. It was one sticker
                      per full-width row, which made seventeen tags a long
                      scroll of mostly empty lines, and left every sticker
                      floating against the left edge at a different width.
                      Equal tiles with the sticker centred give the sheet a
                      structure the stickers themselves cannot, since each
                      one is as wide as its word. */}
                  <View style={styles.grid}>
                    {section.tags.map((tag) => {
                      const isSelected = selectedSlugs.includes(tag.slug);
                      // Once the limit is reached the rest recede rather than
                      // vanish — a list that reflows as you use it makes the
                      // next tap land on something you didn't aim at.
                      const isDisabled = !isSelected && isFull;
                      return (
                        <Fold key={tag.slug} style={styles.tileSlot}>
                          <Pressable
                            onPress={() => onToggle(tag.slug)}
                            disabled={isDisabled}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSelected, disabled: isDisabled }}
                            accessibilityLabel={tag.label}
                            style={[
                              styles.tile,
                              isSelected && styles.tileSelected,
                              isDisabled && styles.tileDisabled,
                            ]}>
                            {/* The sticker it will be on the back of the
                                card, with its name under it, since on the
                                card it is a picture alone. */}
                            <TagStickerGraphic
                              slug={tag.slug}
                              label={tag.label}
                              size={50}
                              interactive={false}
                              showLabel
                            />
                            {isSelected && (
                              <View style={styles.check}>
                                <Ionicons name="checkmark" size={13} color={BrandColors.background} />
                              </View>
                            )}
                          </Pressable>
                        </Fold>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Unfold>
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
    maxHeight: '90%',
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
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  // Uppercased rather than made bigger: the headings have to be clearly
  // subordinate to the stickers, which are the thing being chosen.
  sectionHeading: {
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingTop: Spacing.two,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  // The grid item is the tile's fold, so the sizing is on that.
  tileSlot: {
    // Two across with the gap between them. A fixed basis rather than
    // flex: 1, so a section with an odd tag out leaves its last tile at
    // half width instead of stretching it across the whole row.
    flexBasis: '48%',
    flexGrow: 0,
  },
  tile: {
    // Fills the fold, which the row stretches to the line's tallest tile, so
    // a tag whose label wraps still sits level with its neighbour.
    flexGrow: 1,
    // The sticker and its name, centred in the tile. The padding is the gap
    // the selection ring draws in, so choosing a tag rings it without moving
    // or shrinking it.
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: 4,
    minHeight: 60,
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileSelected: {
    borderColor: BrandColors.sage,
  },
  tileDisabled: {
    opacity: 0.4,
  },
  // In the corner rather than beside the sticker, so choosing a tag never
  // moves it.
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BrandColors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
