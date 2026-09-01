import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BrandColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

  return (
    <>
      <Pressable onPress={() => setIsOpen(true)} hitSlop={6} style={styles.triggerWrap}>
        <ThemedView
          type={activeCount > 0 ? 'backgroundSelected' : 'backgroundElement'}
          style={styles.trigger}>
          <Ionicons name="options-outline" size={16} color={theme.text} />
          <ThemedText type="small" numberOfLines={1} style={styles.triggerLabel}>
            {summary || 'Sort & filter'}
          </ThemedText>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </ThemedView>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setIsOpen(false)}>
          {/* The sheet swallows taps so a press near an option edge cannot
              dismiss the sheet instead of selecting. */}
          <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation()}>
            <ThemedView type="backgroundElement" style={styles.sheet}>
              <View style={styles.header}>
                <ThemedText type="sectionLabel">Sort & filter</ThemedText>
                <Pressable onPress={() => setIsOpen(false)} hitSlop={8}>
                  <ThemedText type="smallBold" themeColor="sage">
                    Done
                  </ThemedText>
                </Pressable>
              </View>

              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}>
                {groups.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <ThemedText
                      type="sectionLabel"
                      themeColor="textSecondary"
                      style={styles.groupLabel}>
                      {group.label}
                    </ThemedText>
                    {group.options.map((option) => {
                      const isSelected =
                        group.kind === 'single'
                          ? group.value === option.value
                          : group.values.includes(option.value);
                      return (
                        <Pressable
                          key={option.value}
                          onPress={() =>
                            group.kind === 'single'
                              ? group.onChange(option.value)
                              : group.onToggle(option.value)
                          }
                          style={[styles.row, isSelected && styles.rowSelected]}>
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
                          {isSelected && (
                            <ThemedText type="small" themeColor="sage">
                              ✓
                            </ThemedText>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>
            </ThemedView>
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
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
  triggerLabel: {
    flexShrink: 1,
  },
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
    maxHeight: '75%',
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
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
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  group: {
    gap: Spacing.one,
  },
  groupLabel: {
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowSelected: {
    borderColor: BrandColors.sage,
  },
});
