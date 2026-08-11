import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { StretchText } from '@/components/ui/stretch-text';
import { Spacing } from '@/constants/theme';

type TeaserCardProps = {
  label: string;
  title: string;
  thumbnailUrl?: string;
  onPress: () => void;
};

// Still below the app's normal Spacing.two (8), but enough to read as real
// breathing room from the border — the 1px from an earlier round read as
// too tight once it actually landed on the card's own edge (it had
// previously landed on the text column instead, which is what "1px" was
// originally meant to describe). Exported so other card layouts sharing
// this visual language (profile-prompts-section.tsx's board/travel_book/
// place/text/photo cards) stay in sync with this one instead of
// re-guessing the same numbers.
export const CARD_PADDING = Spacing.half;
// The image/title row sits at the card's left edge, so its own left inset
// is what actually reads as "space before the photo" — bumped a bit past
// the other three sides per direct feedback, rather than raising
// CARD_PADDING uniformly and losing the tightness everywhere else.
export const CARD_PADDING_LEFT = Spacing.one;
export const CARD_RADIUS = Spacing.half;
// Also tighter than Spacing.half, for the same "too much space" feedback —
// the gap between the label line and the image/title row below it, and
// between the image/title/chevron within that row.
export const TIGHT_GAP = 1;
// Meaningfully bigger than headline's own base 34 (themed-text.tsx), a
// second bump up from an earlier, smaller one — applied via StretchText's
// `style` prop, which lands on the Text itself (font size is a legitimate
// use of that, unlike layout props — see `styles.title` below for why flex
// has to live on a wrapper instead). Larger base font -> fill mode has to
// compress width harder to still fit exactly -> its vertical compensation
// (fillScaleY in stretch-text.tsx) stretches taller too, so this one number
// drives both "bigger text" and "more stretch" at once.
export const TITLE_FONT_SIZE = 48;
// Both the thumbnail's own size and titleRow's fixed height — the row
// itself is capped here, matching the image's height exactly, and the
// title's own stretch (via StretchText's `fillHeight` mode below) is
// computed against that real given height instead of an independent,
// unbounded formula — see the StretchText call's own comment for why
// `fillHeight` specifically (not plain `fill`) is what makes that capped
// stretch actually correct rather than just clipped.
const THUMBNAIL_SIZE = 64;

// Shared by profile.tsx's "Latest reviews"/"Tagged in" cards and
// user-collections-section.tsx's "Boards & travel books" card. The
// thumbnail sits specifically beside the title it belongs to (its own row),
// not spanning the label above it too — both pinned to THUMBNAIL_SIZE, so
// the card's own bottom edge always lands at the bottom of the image.
export function TeaserCard({ label, title, thumbnailUrl, onPress }: TeaserCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.card}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <View style={styles.titleRow}>
        {thumbnailUrl && <Image source={{ uri: thumbnailUrl }} style={styles.thumbnail} contentFit="cover" />}
        {/* StretchText's own `style` prop lands on the text itself, not a
            wrapper — the flex:1 that makes it (and therefore its
            onLayout-measured containerWidth) actually claim the row's
            available space next to the chevron has to live on a
            surrounding View instead. */}
        <View style={styles.title}>
          {/* fillHeight (not plain fill) — plain fill's vertical stretch
              (fillScaleY in stretch-text.tsx) is derived purely from how
              much the text had to compress *horizontally*, with no relation
              to the box's real height, so a long/heavily-compressed title
              could demand a box far taller than THUMBNAIL_SIZE — capping
              titleRow's height without fillHeight just clipped that
              oversized box top-and-bottom (confirmed live: read as "the
              text is stretched too tall"). fillHeight instead scales
              against `title`'s own real given height (100% of this fixed
              row), so the stretch itself stays sized to fit, not just the
              box clipping it after the fact. fillHeightExact on top of that
              drops fillHeight's own deliberate past-the-box overshoot,
              which was rendering the title up over the section label above
              it (confirmed live) — here the row has real content directly
              above, so the stretch has to land exactly on its own box. */}
          <StretchText type="headline" fill fillHeight fillHeightExact style={styles.titleText}>
            {title}
          </StretchText>
        </View>
        <ThemedText type="headline" style={styles.chevron}>
          ›
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    // Noticeably sharper than the rest of the app's usual Spacing.two/three
    // radii — a deliberate, explicit ask, not a generalizable convention.
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    paddingLeft: CARD_PADDING_LEFT,
    gap: TIGHT_GAP,
    overflow: 'hidden',
  },
  titleRow: {
    height: THUMBNAIL_SIZE,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: TIGHT_GAP,
  },
  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
  },
  title: {
    flex: 1,
  },
  titleText: {
    fontSize: TITLE_FONT_SIZE,
  },
  // The row stretches every child to a shared height by default — without
  // this, the chevron's text box would stretch to match too and its glyph
  // would sit top-aligned in that box instead of vertically centered next
  // to the title.
  chevron: {
    alignSelf: 'center',
  },
});
