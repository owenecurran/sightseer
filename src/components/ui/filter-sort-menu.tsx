import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { penRing } from '@/components/ui/circled-tabs';
import { InkBlot } from '@/components/ui/ink-blot';
import { Fold, Unfold } from '@/components/ui/unfold';
import { BrandColors, BrandFonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// How far the ring reaches past the trigger, as CircledTabs' does.
const RING_X = 10;
const RING_Y = 7;

export type MenuOption = {
  value: string;
  label: string;
  // Shown after the label, e.g. how many reviews carry a tag.
  count?: number;
};

// Exactly one choice — a sort order.
type SingleGroup = {
  kind: 'single';
  key: string;
  label: string;
  options: MenuOption[];
  value: string;
  onChange: (value: string) => void;
};

// Any number of choices — filters, which combine.
type MultiGroup = {
  kind: 'multi';
  key: string;
  label: string;
  options: MenuOption[];
  values: string[];
  onToggle: (value: string) => void;
  // Lets a caller draw its own option (the place page draws tag stickers)
  // without this component needing to know what a tag is.
  renderOption?: (option: MenuOption, isSelected: boolean) => ReactNode;
};

export type MenuGroup = SingleGroup | MultiGroup;

// One trigger that opens a focused sheet, rather than every sort and filter
// option living permanently on the screen as its own chip.
//
// The place page had reached five sort chips, three filter chips and up to
// eight tag stickers — twenty-odd controls between the header and the first
// review, which is a wall to read before reaching what you came for. Behind
// a sheet, adding an option later costs a row rather than more clutter.
//
// The trigger summarises what is currently in effect, so the common case —
// glance at it, change nothing — still needs no taps.
export function FilterSortMenu({ groups }: { groups: MenuGroup[] }) {
  const theme = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  // The sheet sits flush against the bottom of the screen, so on a phone
  // with a home indicator its last row lands underneath it — reported as
  // the menu being cut off at the bottom on iOS. The old
  // `paddingBottom: Spacing.five` (32) was almost exactly the 34pt
  // indicator inset, so effectively all of it was being spent on the
  // indicator and none on actual spacing.
  //
  // `useSafeAreaInsets()` rather than `SafeAreaView` for the reason
  // location-search-modal.native.tsx documents: RN's `Modal` presents in
  // its own native view hierarchy on iOS, which SafeAreaView's automatic
  // detection does not reliably reach into.
  const insets = useSafeAreaInsets();

  const summary = groups
    .map((group) => {
      if (group.kind === 'single') {
        return group.options.find((o) => o.value === group.value)?.label ?? null;
      }
      if (group.values.length === 0) return null;
      // A single choice names itself — "Walkable" or "Friends only" says
      // more than "1 tag" and sidesteps pluralising the group's own label,
      // which produced "1 tags" and would have produced "1 people".
      if (group.values.length === 1) {
        const only = group.options.find((o) => o.value === group.values[0]);
        if (only) return only.label;
      }
      // Past one, the group's label carries it. Multi groups are therefore
      // labelled with a PLURAL noun ("Tags"), which is also what reads
      // correctly as the heading above their options.
      return group.values.length + ' ' + group.label.toLowerCase();
    })
    .filter(Boolean)
    .join(' · ');

  const activeCount = groups.reduce(
    (total, group) => total + (group.kind === 'multi' ? group.values.length : 0),
    0
  );

  // The trigger's size, for drawing the pen ring round it while a filter
  // is on (see penRing).
  const [triggerSize, setTriggerSize] = useState<{ w: number; h: number } | null>(null);
  function onTriggerLayout(event: LayoutChangeEvent) {
    const w = Math.round(event.nativeEvent.layout.width);
    const h = Math.round(event.nativeEvent.layout.height);
    if (!triggerSize || triggerSize.w !== w || triggerSize.h !== h) setTriggerSize({ w, h });
  }
  const ring = useMemo(
    () => (activeCount > 0 && triggerSize ? penRing('filter-trigger', triggerSize.w, triggerSize.h, RING_X, RING_Y) : null),
    [activeCount, triggerSize],
  );

  return (
    <>
      {/* Typed, as the view modes beside it are, and ringed in pen while a
          filter is on, as a circled word is chosen everywhere else. It was
          a pill, shaded while filtering. */}
      <Pressable
        onPress={() => setIsOpen(true)}
        hitSlop={8}
        onLayout={onTriggerLayout}
        accessibilityRole="button"
        accessibilityLabel={`Sort and filter: ${summary || 'none'}`}
        style={({ pressed }) => [styles.triggerWrap, styles.trigger, pressed && styles.triggerPressed]}>
        {ring && <Image source={{ uri: ring }} style={styles.triggerRing} />}
        <Ionicons name="options-outline" size={15} color={theme.textSecondary} />
        <Text numberOfLines={1} style={styles.triggerLabel}>
          {summary || 'Sort & filter'}
        </Text>
        <Ionicons name="chevron-down" size={13} color={theme.textSecondary} />
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          {/* The sheet swallows taps so a press near an option edge cannot
              dismiss the sheet instead of selecting. */}
          <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
            <Unfold paper="backgroundElement" from="bottom" style={styles.sheet}>
              <Fold style={styles.header}>
                <ThemedText type="displaySerif">Sort & filter</ThemedText>
                <Pressable onPress={() => setIsOpen(false)} hitSlop={8}>
                  <ThemedText type="action" themeColor="sage">
                    Done
                  </ThemedText>
                </Pressable>
              </Fold>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingBottom: insets.bottom + Spacing.five },
                ]}
                showsVerticalScrollIndicator={false}>
                {groups.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <Fold>
                      <ThemedText type="meta" style={styles.groupLabel}>
                        {group.label}
                      </ThemedText>
                    </Fold>
                    {group.options.map((option) => {
                      const isSelected =
                        group.kind === 'single'
                          ? group.value === option.value
                          : group.values.includes(option.value);
                      return (
                        <Fold key={option.value}>
                          <Pressable
                            onPress={() =>
                              group.kind === 'single'
                                ? group.onChange(option.value)
                                : group.onToggle(option.value)
                            }
                            accessibilityRole={group.kind === 'single' ? 'radio' : 'checkbox'}
                            accessibilityState={{ checked: isSelected }}
                            style={styles.row}>
                            {group.kind === 'multi' && group.renderOption ? (
                              group.renderOption(option, isSelected)
                            ) : (
                              <ThemedText
                                type="small"
                                themeColor={isSelected ? 'text' : 'textSecondary'}>
                                {option.label}
                                {option.count != null ? '  ' + option.count : ''}
                              </ThemedText>
                            )}
                            {/* A blot of ink, as the app's tick-boxes mark a
                                choice, where this was a sage outline and a
                                "✓". */}
                            {isSelected && <InkBlot size={12} seed={`menu:${group.key}:${option.value}`} color={BrandColors.sage} />}
                          </Pressable>
                        </Fold>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </Unfold>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerWrap: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: 2,
    // In line with the page's edge, as CircledTabs' words are: the ring
    // reaches past the words into the margin rather than pushing them in.
    // Room above and below for it, as that row keeps.
    marginLeft: Spacing.one,
    marginVertical: RING_Y - 2,
  },
  triggerPressed: {
    opacity: 0.6,
  },
  triggerRing: {
    position: 'absolute',
    top: -RING_Y,
    left: -RING_X,
    right: -RING_X,
    bottom: -RING_Y,
  },
  triggerLabel: {
    flexShrink: 1,
    fontFamily: BrandFonts.typewriter,
    fontSize: 15,
    color: BrandColors.cream,
    includeFontPadding: false,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  // The height cap lives HERE, not on the sheet. As a percentage it has to
  // resolve against a parent with a definite height, and `overlay` has one
  // (flex: 1 of the modal root) while `sheetWrap` itself does not — a
  // percentage maxHeight on the sheet was being measured against a parent
  // whose own height depended on that same child.
  sheetWrap: {
    width: '100%',
    alignItems: 'center',
    maxHeight: '80%',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    // React Native defaults flexShrink to 0, unlike the web. Without this
    // the sheet ignores the cap above and grows to fit its content, which
    // is how a long option list (the place page reaches five sorts, three
    // filters and up to eight tags) runs off the bottom of the screen.
    flexShrink: 1,
    paddingTop: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.two,
  },
  scroll: {
    flexGrow: 0,
    // Same reason as the sheet: it has to be allowed to shrink for the cap
    // to reach the scrolling content rather than stopping at the sheet.
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    // paddingBottom is applied inline — it depends on the safe-area inset.
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.one,
  },
  groupLabel: {
    marginBottom: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
  },
});
