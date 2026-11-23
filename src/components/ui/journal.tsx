import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
import { BrandFonts, Spacing } from '@/constants/theme';
import { randomFor } from '@/lib/seeded-random';

// The pieces that make a form read as a journal being filled in rather than a
// stack of boxes: sheets of paper with a slight lean, each opened with its
// number typed and a question in the serif. Built for Add a review.
//
// There was washi tape across the top of every page, a dashed route drawn
// from one page to the next, and the page numbers stamped in rings. All three
// were decoration about being handmade rather than anything handmade, and
// were taken off as the parts that read as most artificial.

// How far a page may lean either way. Well under a degree: enough that the
// edges are not ruled dead level, not so much that the fields in it look
// broken.
const MAX_LEAN = 0.4;
const PAGE_RADIUS = 4;

type JournalPageProps = {
  seed: string;
  // Kept for callers; pages no longer carry a colour of their own.
  accentIndex?: number;
  children: ReactNode;
  style?: ViewStyle;
};

// A panel of the form as a sheet of paper laid on the page.
export function JournalPage({ seed, children, style }: JournalPageProps) {
  const lean = useMemo(() => (randomFor(`journal-page-${seed}`)() * 2 - 1) * MAX_LEAN, [seed]);
  return (
    <View style={[{ transform: [{ rotate: `${lean}deg` }] }, style]}>
      <PaperPanel seed={seed} radius={PAGE_RADIUS}>
        {children}
      </PaperPanel>
    </View>
  );
}

type ChapterProps = {
  number: number;
  // A question, in the serif: "Where did you go?" rather than "PLACE".
  title: string;
  // Small, on the right: a postmark, a count.
  aside?: ReactNode;
  // Kept for callers.
  seed?: string;
};

// The opening of a page: its number typed small, the way a printed form
// numbers its parts, then what it asks, in the display serif.
export function Chapter({ number, title, aside }: ChapterProps) {
  return (
    <View style={styles.chapter}>
      <View style={styles.chapterText}>
        <Text style={styles.chapterNumber}>No. {number}</Text>
        <ThemedText type="lead">{title}</ThemedText>
      </View>
      {typeof aside === 'string' ? <ThemedText type="meta">{aside}</ThemedText> : aside}
    </View>
  );
}

// The paper and ink of a note: warm card and a ballpoint's blue-black, with
// a red pen for what to do about it.
const NOTE_PAPER = '#f3eedb';
const NOTE_INK = '#23304a';
const NOTE_RED = '#a8443a';

type PaperNoteProps = {
  seed: string;
  title: string;
  body: string;
  actionLabel: string;
  onPress: () => void;
};

// A note left on the page: a piece of cream card at a lean, a heading
// scrawled across it, a line of ballpoint, and what to do about it in red
// pen. For the app's own prompts to the person using it, which were a card
// with a coloured stripe and a button in it.
export function PaperNote({ seed, title, body, actionLabel, onPress }: PaperNoteProps) {
  const lean = useMemo(() => {
    const random = randomFor(`paper-note-${seed}`);
    return (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.7);
  }, [seed]);

  return (
    <View style={{ transform: [{ rotate: `${lean}deg` }] }}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.note, pressed && styles.notePressed]}>
        <Text style={styles.noteTitle}>{title}</Text>
        <Text style={styles.noteBody}>{body}</Text>
        <Text style={styles.noteAction}>{actionLabel} →</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  chapterText: {
    flex: 1,
    gap: 2,
  },
  chapterNumber: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 13,
    color: 'rgba(234, 231, 207, 0.55)',
    includeFontPadding: false,
  },
  note: {
    backgroundColor: NOTE_PAPER,
    borderRadius: 2,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    paddingHorizontal: Spacing.three + 2,
    gap: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 3 },
    elevation: 4,
  },
  notePressed: {
    opacity: 0.85,
  },
  noteTitle: {
    fontFamily: BrandFonts.scrawl,
    fontSize: 34,
    lineHeight: 34,
    color: NOTE_INK,
    transform: [{ rotate: '-2deg' }],
  },
  noteBody: {
    fontFamily: BrandFonts.hand,
    fontSize: 18,
    lineHeight: 23,
    color: 'rgba(35, 48, 74, 0.85)',
  },
  noteAction: {
    fontFamily: BrandFonts.hand,
    fontSize: 19,
    color: NOTE_RED,
    textDecorationLine: 'underline',
    alignSelf: 'flex-end',
    marginTop: Spacing.one,
  },
});
