import { Image } from 'expo-image';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { penRing } from '@/components/ui/circled-tabs';
import { PostcardPaper } from '@/components/ui/postcard-paper';
import { Postmark } from '@/components/ui/postmark';
import { BrandColors, BrandFonts, Spacing } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { seededStock, sheetFor } from '@/lib/postcard-stock';
import { randomFor } from '@/lib/seeded-random';

// The controls of a journal being filled in, for Add a review: typed labels
// with notes scrawled beside them, the back of the postcard to write the
// review on, a line to write a name on, empty photo corners and a pencilled
// circle where a sticker goes, slips of paper for what has been added, and
// little postcards to choose between.

const CREAM = BrandColors.cream;
// Paper and ink for the things that are paper: warm off-white card, and the
// blue-black of a ballpoint.
const CARD = '#f3eedb';
const INK = '#23304a';

type FieldLabelProps = {
  children: string;
  // A note in the margin beside it: "optional", "2 of 4".
  note?: string;
  // Something to press, on the right: "clear".
  action?: ReactNode;
};

// A field's label, typed, with anything about it scrawled alongside rather
// than set as a second label.
export function FieldLabel({ children, note, action }: FieldLabelProps) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.typed}>{children}</Text>
      {note && <Text style={styles.scrawlNote}>{note}</Text>}
      <View style={styles.labelSpacer} />
      {action}
    </View>
  );
}

// Something small to press, written in the margin: "clear", "change".
export function MarginAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10}>
      <Text style={styles.marginAction}>{label}</Text>
    </Pressable>
  );
}

type PostcardBackFieldProps = Pick<TextInputProps, 'value' | 'onChangeText' | 'placeholder'> & {
  placeName: string;
  region?: string;
  // The visit's date, as the postmark prints it.
  postmark: { line: string; year: string };
  seed: string;
};

// The review, written on the back of the postcard it will be printed on: the
// same card stock, the same panel, the place across the top, the message on
// the left of the rule and the postmark on the right, in the hand the card
// will show it in. This was a ruled index card, which said the words were
// going somewhere they were not.
export function PostcardBackField({ value, onChangeText, placeholder, placeName, region, postmark, seed }: PostcardBackFieldProps) {
  const sheet = useMemo(() => sheetFor({ stock: seededStock(seed), orientation: 'horizontal' }), [seed]);
  return (
    <PostcardPaper sheet={sheet} inset={12} insetVertical={14}>
      <ThemedView type="backgroundElement" style={styles.back}>
        <View>
          <ThemedText type="smallBold" numberOfLines={1}>
            {placeName}
          </ThemedText>
          {region ? (
            <ThemedText type="meta" numberOfLines={1}>
              {region}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.backRule} />
        <View style={styles.backBody}>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="rgba(234, 231, 207, 0.4)"
            multiline
            scrollEnabled={false}
            autoCapitalize="sentences"
            autoCorrect
            style={styles.backInput}
          />
          <View style={styles.backDivider} />
          <View style={styles.backColumn}>
            <Postmark line={postmark.line} year={postmark.year} seed={seed} size={52} />
          </View>
        </View>
      </ThemedView>
    </PostcardPaper>
  );
}

// A name or a word written on a line, rather than typed into a box.
export function LineField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="rgba(234, 231, 207, 0.4)"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      style={[styles.lineInput, props.style]}
    />
  );
}

const SLOT = 72;

// An empty place for something still to be added: four album corners round
// nothing, or a pencilled circle where a sticker will go, with a note under
// it. Both had a dashed outline as well, and the dashes were what made them
// read as a drawing of an empty slot rather than an empty slot.
export function EmptySlot({
  kind,
  note,
  onPress,
  disabled,
}: {
  kind: 'photo' | 'sticker';
  note: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const uri = kind === 'photo' ? PHOTO_SLOT : STICKER_SLOT;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} style={({ pressed }) => [styles.slot, pressed && styles.pressed]}>
      <View style={styles.slotArt}>
        <Image source={{ uri }} style={styles.slotImage} />
        <Text style={styles.slotPlus}>+</Text>
      </View>
      <Text style={styles.slotNote} numberOfLines={2}>
        {note}
      </Text>
    </Pressable>
  );
}

// Album corners: a pocket of black paper at each corner, its open edge
// catching the light, each pressed on a little differently.
const PHOTO_SLOT = (() => {
  const random = randomFor('photo-slot');
  const corners = [
    [6, 6, 1, 1],
    [SLOT - 6, 6, -1, 1],
    [6, SLOT - 6, 1, -1],
    [SLOT - 6, SLOT - 6, -1, -1],
  ]
    .map(([x, y, sx, sy]) => {
      const k = 15 + random() * 3;
      const jx = (random() - 0.5) * 1.6;
      const jy = (random() - 0.5) * 1.6;
      const ax = x + jx + sx * k;
      const by = y + jy + sy * k;
      return (
        `<path d="M${x + jx} ${y + jy} L${ax.toFixed(1)} ${y + jy} L${x + jx} ${by.toFixed(1)} Z" fill="#0b120d" fill-opacity="0.9"/>` +
        `<path d="M${ax.toFixed(1)} ${y + jy} L${x + jx} ${by.toFixed(1)}" stroke="${CREAM}" stroke-opacity="0.42" stroke-width="1.1"/>`
      );
    })
    .join('');
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${SLOT}" height="${SLOT}" viewBox="0 0 ${SLOT} ${SLOT}">${corners}</svg>`);
})();

// A circle pencilled where the sticker goes, once round and a little over.
const STICKER_SLOT = penRing('sticker-slot', SLOT - 22, SLOT - 22, 9, 9, 'rgba(234, 231, 207, 0.5)');

// An action written by hand, underlined with a quick wavy stroke: "+ add a
// specific spot".
export function HandLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.handLink, pressed && styles.pressed]}>
      <Text style={styles.handLinkText}>{label}</Text>
      <Image source={{ uri: SQUIGGLE }} style={styles.squiggle} />
    </Pressable>
  );
}

const SQUIGGLE = svgDataUri(
  `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="8" viewBox="0 0 160 8">` +
    `<path d="M2 5 Q 20 1, 40 4.5 T 80 4 T 120 4.6 T 158 3.5" fill="none" stroke="${CREAM}" stroke-opacity="0.5" stroke-width="1.6" stroke-linecap="round"/>` +
    `</svg>`,
);

// Something added, written on a slip of paper: a spot, a person. Tap it to
// take it off again.
export function PaperSlip({ label, seed, onPress }: { label: string; seed: string; onPress: () => void }) {
  const turn = useMemo(() => (randomFor(`slip-${seed}`)() * 2 - 1) * 2.4, [seed]);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityLabel={`Remove ${label}`}
      style={({ pressed }) => [styles.slip, { transform: [{ rotate: `${turn}deg` }] }, pressed && styles.pressed]}>
      <Text style={styles.slipText} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.slipCross}>×</Text>
    </Pressable>
  );
}

type CardShape = 'fit' | 'landscape' | 'portrait' | 'picture' | 'message';

// How far the pen ring reaches past the little card it goes round.
const CHOICE_RING_X = 9;
const CHOICE_RING_Y = 8;

// A choice about the postcard, shown as a little postcard: which way up it
// is printed, and which side it opens on. The one picked is circled in pen,
// as the tabs are, and stands up straight at full strength; the others are
// faded well back. A green border and a tilt were too close to the rest to
// tell at a glance which one was on.
export function CardChoice({
  shape,
  label,
  selected,
  onPress,
}: {
  shape: CardShape;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const [w, h] = MINI_SIZE[shape];
  const ring = useMemo(() => penRing(`card-choice-${shape}`, w, h, CHOICE_RING_X, CHOICE_RING_Y), [shape, w, h]);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
      <View style={[styles.choiceArt, !selected && styles.choiceIdle]}>
        <Image source={{ uri: MINI_ART[shape] }} style={{ width: w, height: h }} />
        {selected && (
          <Image
            source={{ uri: ring }}
            style={{
              position: 'absolute',
              width: w + CHOICE_RING_X * 2,
              height: h + CHOICE_RING_Y * 2,
            }}
          />
        )}
      </View>
      <Text style={[styles.choiceLabel, !selected && styles.choiceLabelIdle]}>{label}</Text>
    </Pressable>
  );
}

const MINI_SIZE: Record<CardShape, [number, number]> = {
  fit: [64, 50],
  landscape: [62, 42],
  portrait: [42, 62],
  picture: [62, 42],
  message: [62, 42],
};

// A little printed photograph: sky, a low sun, two hills.
function scene(x: number, y: number, w: number, h: number): string {
  const f = (n: number) => n.toFixed(1);
  return (
    `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="#9fb9c8"/>` +
    `<circle cx="${f(x + w * 0.7)}" cy="${f(y + h * 0.34)}" r="${f(Math.min(w, h) * 0.13)}" fill="#e6b15e"/>` +
    `<path d="M${f(x)} ${f(y + h * 0.66)} Q${f(x + w * 0.28)} ${f(y + h * 0.36)} ${f(x + w * 0.56)} ${f(y + h * 0.62)} T${f(x + w)} ${f(y + h * 0.56)} L${f(x + w)} ${f(y + h)} L${f(x)} ${f(y + h)} Z" fill="#7fae9e"/>` +
    `<path d="M${f(x)} ${f(y + h * 0.84)} Q${f(x + w * 0.5)} ${f(y + h * 0.62)} ${f(x + w)} ${f(y + h * 0.88)} L${f(x + w)} ${f(y + h)} L${f(x)} ${f(y + h)} Z" fill="#5d8858"/>`
  );
}

// A card's stock, its edge just darker than its face.
function stock(x: number, y: number, w: number, h: number, turn = 0): string {
  const t = turn ? ` transform="rotate(${turn} ${x + w / 2} ${y + h / 2})"` : '';
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CARD}" stroke="#c9c0a3" stroke-width="0.8"${t}/>`;
}

function mini(w: number, h: number, body: string): string {
  return svgDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w * 3}" height="${h * 3}" viewBox="0 0 ${w} ${h}">${body}</svg>`);
}

// The back of a card in miniature: a few lines of writing, the rule down the
// middle, a stamp and the address lines.
function messageSide(w: number, h: number): string {
  const writing = [0, 1, 2, 3]
    .map((i) => {
      const y = 11 + i * 7;
      const end = 30 - (i === 3 ? 10 : (i * 3) % 7);
      return `<path d="M6 ${y} q4 -2 8 0 t8 0 t${end - 22} 0" fill="none" stroke="${INK}" stroke-opacity="0.55" stroke-width="1"/>`;
    })
    .join('');
  return (
    stock(0.5, 0.5, w - 1, h - 1) +
    writing +
    `<line x1="${w * 0.6}" y1="7" x2="${w * 0.6}" y2="${h - 7}" stroke="${INK}" stroke-opacity="0.3" stroke-width="0.8"/>` +
    `<rect x="${w - 15}" y="5" width="10" height="12" fill="#c96a5b" stroke="#fbf7ec" stroke-width="1.4"/>` +
    [24, 30, 36].map((y) => `<line x1="${w * 0.6 + 4}" y1="${y}" x2="${w - 5}" y2="${y}" stroke="${INK}" stroke-opacity="0.35" stroke-width="0.8"/>`).join('')
  );
}

const MINI_ART: Record<CardShape, string> = {
  landscape: mini(62, 42, stock(0.5, 0.5, 61, 41) + scene(4, 4, 54, 34)),
  picture: mini(62, 42, stock(0.5, 0.5, 61, 41) + scene(4, 4, 54, 34)),
  portrait: mini(42, 62, stock(0.5, 0.5, 41, 61) + scene(4, 4, 34, 54)),
  message: mini(62, 42, messageSide(62, 42)),
  // Each photo printed the way up it was taken: one of each, overlapping.
  fit: mini(
    64,
    50,
    `<g transform="rotate(-6 20 26)">${stock(4, 12, 30, 38)}${scene(6.5, 14.5, 25, 33)}</g>` +
      `<g transform="rotate(4 42 22)">${stock(22, 8, 40, 28)}${scene(24.5, 10.5, 35, 23)}</g>`,
  ),
};

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  labelSpacer: {
    flex: 1,
  },
  typed: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 16,
    color: 'rgba(234, 231, 207, 0.9)',
    includeFontPadding: false,
  },
  scrawlNote: {
    fontFamily: BrandFonts.scrawl,
    fontSize: 22,
    lineHeight: 22,
    color: 'rgba(160, 189, 145, 0.85)',
    transform: [{ rotate: '-3deg' }, { translateY: 2 }],
  },
  marginAction: {
    fontFamily: BrandFonts.hand,
    fontSize: 17,
    color: BrandColors.sage,
    textDecorationLine: 'underline',
  },
  // The written side's panel, as visit-card.tsx lays it out.
  back: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  backRule: {
    height: 1,
    backgroundColor: `${BrandColors.cream}2e`,
  },
  backBody: {
    flexDirection: 'row',
    gap: Spacing.two,
    minHeight: 132,
  },
  // The postcards' own message type, so what is written here is what the
  // card will show.
  backInput: {
    flex: 1,
    fontFamily: BrandFonts.hand,
    fontSize: 19,
    lineHeight: 25,
    color: CREAM,
    padding: 0,
    paddingTop: Spacing.one,
    textAlignVertical: 'top',
    includeFontPadding: false,
  },
  backDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: `${BrandColors.cream}2e`,
  },
  backColumn: {
    width: 72,
    alignItems: 'flex-end',
  },
  lineInput: {
    fontFamily: BrandFonts.hand,
    fontSize: 20,
    color: CREAM,
    paddingVertical: Spacing.one,
    paddingHorizontal: 2,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(234, 231, 207, 0.35)',
  },
  slot: {
    width: SLOT,
    alignItems: 'center',
    gap: 2,
  },
  slotArt: {
    width: SLOT,
    height: SLOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotImage: {
    ...StyleSheet.absoluteFill,
  },
  slotPlus: {
    fontFamily: BrandFonts.hand,
    fontSize: 30,
    color: 'rgba(234, 231, 207, 0.6)',
    includeFontPadding: false,
  },
  slotNote: {
    fontFamily: BrandFonts.scrawl,
    fontSize: 19,
    lineHeight: 18,
    color: 'rgba(234, 231, 207, 0.7)',
    textAlign: 'center',
  },
  handLink: {
    alignSelf: 'flex-start',
  },
  handLinkText: {
    fontFamily: BrandFonts.hand,
    fontSize: 19,
    color: CREAM,
  },
  squiggle: {
    width: 150,
    height: 8,
    marginTop: -2,
  },
  slip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: CARD,
    paddingVertical: 3,
    paddingLeft: Spacing.two + 2,
    paddingRight: Spacing.two,
    borderRadius: 1,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 1, height: 2 },
    elevation: 2,
  },
  slipText: {
    fontFamily: BrandFonts.hand,
    fontSize: 17,
    color: INK,
    maxWidth: 220,
  },
  slipCross: {
    fontFamily: BrandFonts.hand,
    fontSize: 18,
    color: 'rgba(35, 48, 74, 0.55)',
  },
  choice: {
    alignItems: 'center',
    gap: Spacing.two,
    width: 86,
  },
  // Tall enough for the portrait card, so the labels in a row line up, and
  // wide enough that the ring round one card stays clear of the next.
  choiceArt: {
    width: 82,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceIdle: {
    opacity: 0.4,
  },
  choiceLabel: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 13,
    color: CREAM,
    textAlign: 'center',
  },
  choiceLabelIdle: {
    color: 'rgba(234, 231, 207, 0.45)',
  },
});
