import { Image } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
import { BrandColors, Spacing, StickerAccents } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { randomFor } from '@/lib/seeded-random';

// The pieces that make a form read as a travel journal being put together
// rather than a stack of boxes: pages taped down at a slight lean, chapters
// opened with a rubber stamp and a question, and a drawn route from each
// page to the next. Built for Add a review, where the four panels in a
// column were the most block-like screen in the app.

// How far a page may lean either way. Under a degree, the same as the
// postcards on the feed: enough to read as laid down by hand, not so much
// that the fields in it look broken.
const MAX_LEAN = 0.7;
const TAPE_WIDTH = 74;
const TAPE_HEIGHT = 22;

type JournalPageProps = {
  seed: string;
  accentIndex?: number;
  children: ReactNode;
  style?: ViewStyle;
};

// A panel of the form as a page stuck into a journal: a strip of washi tape
// across its top edge, in a colour of its own, and a small lean.
export function JournalPage({ seed, accentIndex, children, style }: JournalPageProps) {
  const look = useMemo(() => {
    const random = randomFor(`journal-page-${seed}`);
    const accent = StickerAccents[Math.floor(random() * StickerAccents.length)];
    return {
      lean: (random() * 2 - 1) * MAX_LEAN,
      tapeTurn: -5 + random() * 10,
      // Off centre, the way tape goes on.
      tapeAt: 0.3 + random() * 0.4,
      tape: svgDataUri(tapeSvg(accent, random)),
    };
  }, [seed]);

  return (
    <View style={[styles.page, { transform: [{ rotate: `${look.lean}deg` }] }, style]}>
      <PaperPanel seed={seed} accentIndex={accentIndex}>
        {children}
      </PaperPanel>
      <Image
        source={{ uri: look.tape }}
        pointerEvents="none"
        style={[
          styles.tape,
          { left: `${look.tapeAt * 100}%`, transform: [{ translateX: -TAPE_WIDTH / 2 }, { rotate: `${look.tapeTurn}deg` }] },
        ]}
      />
    </View>
  );
}

// A strip of washi tape: translucent colour with a faint printed pattern,
// and both ends torn rather than cut.
function tapeSvg(accent: string, random: () => number): string {
  const torn = (x: number, side: 1 | -1) => {
    let d = '';
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const y = (i / steps) * TAPE_HEIGHT;
      const bite = random() * 2.6;
      d += `L${(x - side * bite).toFixed(1)} ${y.toFixed(1)} `;
    }
    return d;
  };
  const right = torn(TAPE_WIDTH - 1, 1);
  // Up the left edge, so the path goes round.
  let left = '';
  for (let i = 6; i >= 0; i--) {
    const y = (i / 6) * TAPE_HEIGHT;
    left += `L${(1 + random() * 2.6).toFixed(1)} ${y.toFixed(1)} `;
  }
  const outline = `M1 0 L${TAPE_WIDTH - 1} 0 ${right}${left}Z`;
  const pattern = random() < 0.5 ? 'stripes' : 'dots';
  const print =
    pattern === 'stripes'
      ? Array.from({ length: 12 }, (_, i) => {
          const x = i * 8 - 6;
          return `<line x1="${x}" y1="${TAPE_HEIGHT}" x2="${x + 9}" y2="0" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2.2"/>`;
        }).join('')
      : Array.from({ length: 16 }, (_, i) => {
          const x = 5 + (i % 8) * 9 + (i >= 8 ? 4.5 : 0);
          const y = i >= 8 ? 15 : 7;
          return `<circle cx="${x}" cy="${y}" r="1.4" fill="#ffffff" fill-opacity="0.3"/>`;
        }).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TAPE_WIDTH}" height="${TAPE_HEIGHT}" viewBox="0 0 ${TAPE_WIDTH} ${TAPE_HEIGHT}">` +
    `<clipPath id="t"><path d="${outline}"/></clipPath>` +
    `<path d="${outline}" fill="${accent}" fill-opacity="0.78"/>` +
    `<g clip-path="url(#t)">${print}</g>` +
    `</svg>`
  );
}

type ChapterProps = {
  number: number;
  // A question, in the serif: "Where did you go?" rather than "PLACE".
  title: string;
  // Small, on the right: optional, a count, a way to clear.
  aside?: ReactNode;
  seed: string;
};

// The opening of a page: its number in a rubber-stamped ring, then what it
// asks, in the display serif.
export function Chapter({ number, title, aside, seed }: ChapterProps) {
  const turn = useMemo(() => -10 + randomFor(`chapter-${seed}`)() * 20, [seed]);
  return (
    <View style={styles.chapter}>
      <View style={[styles.stamp, { transform: [{ rotate: `${turn}deg` }] }]}>
        <ThemedText type="sectionLabel" style={styles.stampNumber}>
          {String(number).padStart(2, '0')}
        </ThemedText>
      </View>
      <ThemedText type="lead" style={styles.chapterTitle}>
        {title}
      </ThemedText>
      {typeof aside === 'string' ? <ThemedText type="meta">{aside}</ThemedText> : aside}
    </View>
  );
}

const TRAIL_HEIGHT = 44;
const TRAIL_WIDTH = 120;

// The drawn route from one page of the form down to the next: the same
// dashed road the feed draws between postcards, in miniature.
export function JournalTrail({ seed }: { seed: string }) {
  const uri = useMemo(() => {
    const random = randomFor(`journal-trail-${seed}`);
    const side = random() < 0.5 ? -1 : 1;
    const startX = TRAIL_WIDTH / 2 + (random() - 0.5) * 30;
    const endX = TRAIL_WIDTH / 2 + (random() - 0.5) * 30;
    const bow = side * (18 + random() * 16);
    const midX = (startX + endX) / 2 + bow;
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${TRAIL_WIDTH}" height="${TRAIL_HEIGHT}" viewBox="0 0 ${TRAIL_WIDTH} ${TRAIL_HEIGHT}">` +
        `<path d="M${startX.toFixed(1)} 2 Q${midX.toFixed(1)} ${TRAIL_HEIGHT / 2} ${endX.toFixed(1)} ${TRAIL_HEIGHT - 2}" ` +
        `fill="none" stroke="${BrandColors.cream}" stroke-opacity="0.45" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="6 5"/>` +
        `</svg>`,
    );
  }, [seed]);
  return <Image source={{ uri }} style={styles.trail} pointerEvents="none" />;
}

const STAMP = 34;

const styles = StyleSheet.create({
  page: {
    // Room above for the tape, which sits half over the page's top edge.
    paddingTop: TAPE_HEIGHT / 2,
  },
  tape: {
    position: 'absolute',
    top: 0,
    width: TAPE_WIDTH,
    height: TAPE_HEIGHT,
  },
  chapter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  stamp: {
    width: STAMP,
    height: STAMP,
    borderRadius: STAMP / 2,
    borderWidth: 1.5,
    // Solid, not dashed: a dashed border renders solid on Android often
    // enough not to be relied on (see FeedDivider).
    borderColor: 'rgba(234, 231, 207, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stampNumber: {
    color: 'rgba(234, 231, 207, 0.8)',
    fontSize: 12,
  },
  chapterTitle: {
    flex: 1,
  },
  trail: {
    alignSelf: 'center',
    width: TRAIL_WIDTH,
    height: TRAIL_HEIGHT,
    // Into the gaps either side, so it runs from one page to the next.
    marginVertical: -Spacing.two,
  },
});
