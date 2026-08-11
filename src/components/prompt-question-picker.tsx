import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StretchText } from '@/components/ui/stretch-text';
import { PROFILE_PROMPT_CATEGORY_LABELS, type ProfilePromptCategory, type ProfilePromptOption } from '@/constants/profile-prompts';
import { BrandColors, Spacing } from '@/constants/theme';

type PromptQuestionPickerProps = {
  categories: ProfilePromptCategory[];
  selectedCategory: ProfilePromptCategory | null;
  onSelectCategory: (category: ProfilePromptCategory) => void;
  promptsInCategory: ProfilePromptOption[];
  selectedSlug: string;
  onSelectPrompt: (slug: string) => void;
};

// The prompt editor's own two-column question picker, styled after a
// design mockup: a left rail of categories (stretched ObviouslyWideMedium,
// via StretchText's `fill` mode) and a right column of that category's
// individual prompts (Helvetica Rounded Bold), both plain vertical lists
// with a sage pill marking the active row — replacing the earlier
// horizontal-wrapping chip rows for both pickers.
export function PromptQuestionPicker({
  categories,
  selectedCategory,
  onSelectCategory,
  promptsInCategory,
  selectedSlug,
  onSelectPrompt,
}: PromptQuestionPickerProps) {
  // `categoryRow`'s real height — `categoryColumn` cross-stretches to match
  // `promptColumn`'s own (taller) content height, so the 4 `flex:1` rows
  // divide that stretched height, not just their own `minHeight` floor.
  // Measured directly off `categoryColumn` and divided evenly here rather
  // than trusted to propagate through to `categoryTextWrap` via a second
  // level of cross-axis stretch, since that inner wrapper needs a real
  // height to actually hand StretchText's `fillHeight` mode something to
  // fill.
  const [columnHeight, setColumnHeight] = useState(0);
  const rowGapTotal = Math.max(0, categories.length - 1) * Spacing.two;
  const rowHeight =
    columnHeight > 0 ? (columnHeight - Spacing.two * 2 - rowGapTotal) / categories.length : 0;

  return (
    <View style={styles.box}>
      <View
        style={styles.categoryColumn}
        onLayout={(e: LayoutChangeEvent) => {
          const height = e.nativeEvent.layout.height;
          if (height !== columnHeight) setColumnHeight(height);
        }}
      >
        {categories.map((category) => {
          const isSelected = category === selectedCategory;
          return (
            <Pressable key={category} onPress={() => onSelectCategory(category)} style={styles.categoryRow}>
              {isSelected && <View style={styles.selectedPill} />}
              {/* StretchText's `fill` mode needs a definite-width flex
                  participant of its own (its outer container is only
                  `width:'100%'`, not a flex item) — TeaserCard's title uses
                  the same wrapping `flex:1` View for exactly this reason.
                  The padding also has to live on *this* wrapper, not on the
                  style handed to StretchText — RN's `width` is border-box,
                  so padding baked into that same style eats into the
                  explicit `width: contentWidth` StretchText sets on its
                  visible copy, truncating it by exactly the padding amount
                  (confirmed live via an onLayout debug readout: measured
                  108px available, but "Discovery" still clipped to
                  "Discov…" — TeaserCard's own titleText style has zero
                  padding, which is why this never surfaced there). */}
              <View style={[styles.categoryTextWrap, rowHeight > 0 ? { height: rowHeight } : null]}>
                {/* fillHeight needs this wrapper to actually have a real,
                    content-independent height to stretch into — see
                    `rowHeight` above for why that's set explicitly here
                    instead of via flex stretch. */}
                <StretchText
                  type="sectionLabel"
                  fill
                  fillHeight
                  style={[styles.categoryText, isSelected && styles.selectedText]}
                >
                  {PROFILE_PROMPT_CATEGORY_LABELS[category]}
                </StretchText>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.divider} />
      <View style={styles.promptColumn}>
        <ScrollView contentContainerStyle={styles.promptColumnContent} showsVerticalScrollIndicator={false}>
          {selectedCategory == null && (
            <ThemedText type="small" themeColor="textSecondary">
              Pick a category
            </ThemedText>
          )}
          {selectedCategory != null && promptsInCategory.length === 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              No prompts left in this category.
            </ThemedText>
          )}
          {promptsInCategory.map((p) => {
            const isSelected = p.slug === selectedSlug;
            return (
              <Pressable key={p.slug} onPress={() => onSelectPrompt(p.slug)} style={styles.row}>
                {isSelected && <View style={styles.selectedPill} />}
                <ThemedText type="roundedStat" style={[styles.promptText, isSelected && styles.selectedText]}>
                  {p.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

// Fixed, not content-driven — see `box`'s own comment for why: capping the
// whole picker's height (instead of letting promptColumn grow with however
// many prompts a category ends up with) is what keeps categoryColumn's own
// cross-stretch (and therefore each category pill's height) stable as more
// prompts get added to constants/profile-prompts.ts over time, and is what
// makes the prompt list itself an actual scroll region instead of just
// growing the whole page taller.
const PICKER_HEIGHT = 280;

const styles = StyleSheet.create({
  box: {
    height: PICKER_HEIGHT,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  categoryColumn: {
    flexBasis: '30%',
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(234,231,207,0.35)',
  },
  promptColumn: {
    flex: 1,
    backgroundColor: '#010b06',
  },
  promptColumnContent: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    position: 'relative',
    justifyContent: 'center',
  },
  // Category rows specifically need `flexDirection:'row'` (unlike plain
  // `row` above) so `categoryTextWrap`'s `flex:1` claims the row's *width*
  // — flex:1 on a lone child of a column-direction parent claims height
  // instead, which was the other half of why StretchText's fill mode wasn't
  // getting a real width to measure against. `minHeight` is a floor only —
  // the actual per-row height `categoryTextWrap` is given comes from
  // `rowHeight` above (categoryColumn's own measured height divided evenly),
  // not from this row's own layout.
  categoryRow: {
    position: 'relative',
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
  },
  selectedPill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BrandColors.sage,
  },
  // Padding lives here, not on `categoryText` — see the comment at its call
  // site for why StretchText's own style has to stay padding-free. Vertical
  // padding kept small (not Spacing.two) — it's subtracted from
  // categoryRow's own minHeight before StretchText ever sees it, so a
  // bigger value here directly fights the vertical stretch this row exists
  // for.
  categoryTextWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  // Base fontSize deliberately small — `fill` mode's own stretch factor is
  // driven by how much narrower the natural (unstretched) text is than the
  // column it has to fill, so a smaller starting size means *more* visible
  // stretch distortion once StretchText scales it up to the column's width,
  // independent of how skinny that column itself is.
  categoryText: {
    fontSize: 14,
  },
  promptText: {
    fontSize: 16,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  selectedText: {
    color: BrandColors.background,
  },
});
