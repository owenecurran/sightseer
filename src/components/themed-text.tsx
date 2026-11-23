import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { BrandFonts, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'displaySerif'
    | 'postcardMessage'
    | 'headline'
    | 'headlineWrapped'
    | 'statLine'
    | 'roundedStat'
    | 'sectionLabel'
    | 'body'
    | 'caption'
    | 'lead'
    | 'meta'
    | 'action'
    | 'identifier';
  themeColor?: ThemeColor;
};

// The platform's own UI face, named outright. Leaving fontFamily unset is how
// every other type gets it, but a nested Text inherits its parent's family,
// so inside a serif caption "unset" means serif.
const SYSTEM_SANS = Platform.select({ ios: 'System', android: 'sans-serif', default: 'system-ui, sans-serif' });

// The colour a type is drawn in when the caller does not pick one. Most are
// cream; the reading voices each carry their own, so a call site says WHAT
// the text is and the colour follows, instead of every caption in the app
// separately remembering to pass the same themeColor.
const DEFAULT_COLOR: Partial<Record<NonNullable<ThemedTextProps['type']>, ThemeColor>> = {
  linkPrimary: 'link',
  caption: 'textCaption',
  lead: 'textCaption',
  meta: 'textMeta',
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        // Resolved from the theme rather than baked into the type's style,
        // so an explicit themeColor still wins — a style further down the
        // array would override it and there would be no way to opt out.
        { color: theme[themeColor ?? DEFAULT_COLOR[type] ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'displaySerif' && styles.displaySerif,
        type === 'postcardMessage' && styles.postcardMessage,
        type === 'headline' && styles.headline,
        type === 'headlineWrapped' && styles.headlineWrapped,
        type === 'statLine' && styles.statLine,
        type === 'roundedStat' && styles.roundedStat,
        type === 'sectionLabel' && styles.sectionLabel,
        type === 'body' && styles.body,
        type === 'caption' && styles.caption,
        type === 'lead' && styles.lead,
        type === 'meta' && styles.meta,
        type === 'action' && styles.action,
        type === 'identifier' && styles.identifier,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  // Custom display fonts (BrandFonts.*) have non-standard glyph metrics per
  // font, and iOS clips a Text node's glyphs to an explicit `lineHeight` as a
  // hard boundary (Android/web don't). A hand-picked fontSize*1.2-ish
  // lineHeight is still guesswork per font and was still clipping on real
  // devices — no `lineHeight` at all lets iOS/RN fall back to each font's own
  // natural leading metrics instead, which is what actually avoids clipping
  // for an arbitrary custom font.
  displaySerif: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 32,
  },
  // What somebody wrote on the card.
  //
  // `body` carries no fontFamily at all, so the review -- the one piece of
  // the postcard that is actually a person's voice -- was set in the system
  // UI face, next to a hand-lettered place name and a printed stamp. It read
  // as a caption in an app rather than as writing on a card.
  //
  // The display serif, which is the only face in the loaded set that reads
  // as WRITING rather than as interface. A grotesque was tried first and was
  // barely distinguishable from the system font it replaced -- the point is
  // for the message to look like it was put on the card, and a sans does not
  // do that next to a hand-lettered place name and a printed stamp.
  //
  // Set two points larger than body, because a serif at the same size reads
  // smaller, and given its own line height rather than inheriting body's.
  //
  // Now a hand (Patrick Hand), which is what the serif was standing in for
  // until one was bundled: a neat, legible handwriting, so a message reads as
  // written on the card. Add a review's message field uses the same face, so
  // what is written there is what the card shows.
  postcardMessage: {
    fontFamily: BrandFonts.hand,
    fontSize: 19,
    lineHeight: 25,
  },
  headline: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 34,
    textTransform: 'uppercase',
  },
  // `headline` for anything that can run to a second line.
  //
  // headline sets no lineHeight, and the platform default works out at about
  // the font size (34dp, measured on device) — BELOW the ink the glyphs
  // need, so two lines collide. "New travel book", "Based on photo(s)" and
  // "Search the map" all did.
  //
  // 48 is measured, not guessed: at this size MOON_GET-HEAVY needs 35.5dp
  // for plain caps and 47.2 for parentheses, which titles do contain.
  // Accented capitals want 55.2, loose enough to look broken on a two-line
  // title, so this covers punctuation and stops there.
  //
  // A separate type rather than a lineHeight on `headline` itself, because
  // 17 of headline's call sites go through StretchText, which MEASURES the
  // rendered line to compute its scale — changing the shared metric would
  // silently re-tune all of them. This is for the plain ThemedText callers.
  headlineWrapped: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 34,
    textTransform: 'uppercase',
    lineHeight: 48,
  },
  statLine: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 15,
  },
  roundedStat: {
    fontFamily: BrandFonts.roundedStat,
    fontSize: 14,
  },
  sectionLabel: {
    fontFamily: BrandFonts.wideMedium,
    fontSize: 12,
  },
  // Sustained-reading body copy (article paragraphs) — none of the other
  // variants fit: `default` is UI-copy sized (16/24), everything else is
  // either a small label or a big decorative display/headline treatment.
  // Same 16px as `default` but more generous line-height for a wall of text.
  body: {
    fontSize: 16,
    lineHeight: 26,
    fontWeight: 400,
  },
  // ---- The secondary voices.
  //
  // Everything below used to be one thing: `small` in textSecondary, the
  // system face at 14 in a see-through cream. Three hundred lines of the app
  // were set that way -- descriptions, empty states, timestamps, error
  // messages, Cancel buttons -- so a caption, a fact, a warning and a button
  // all looked identical, and none of them looked designed. These split it
  // by what the words are for.
  //
  // A sentence that explains or reassures: the line under a settings row,
  // an empty state, a hint. Set in the serif the postcard message uses, so
  // the app's quieter voice is a voice, not the UI face turned down.
  //
  // The same 14 as `small`, not larger: this face's x-height is TALLER than
  // the system sans' (570 to Roboto's 528 per 1000), so at 15 a caption
  // came out bigger than the label above it -- "Choose what reaches your
  // phone" outweighing "Notifications" on the settings screen. The line
  // height is over what the face needs (ascent + descent is 1.14em, so 16pt
  // here), so iOS has nothing to clip -- see displaySerif above.
  //
  // NOT FOR IDENTIFIERS. This face draws a 1 like a lowercase l, so an
  // email, a phone number, a handle or a code dropped into a caption has to
  // be wrapped in type="identifier", or "temp1@" reads as "templ@".
  caption: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  // The same voice for the paragraph that opens a screen -- "Pick a username
  // and display name", "A journal of everywhere you have been".
  lead: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 18,
    lineHeight: 25,
    letterSpacing: 0.1,
  },
  // Facts: when, how many, where. Small tracked capitals in the wide face
  // the section labels already use, which is how a postmark or the back of
  // a ticket prints this kind of thing.
  //
  // No lineHeight, like sectionLabel: this face's line box is 1.59em, and a
  // tighter explicit one is what iOS clips to.
  //
  // Not for handles either, for a different reason: in capitals the 1 and
  // the I are the same bare stroke, so "@temp1" would come out "@TEMPI".
  meta: {
    fontFamily: BrandFonts.wideMedium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  // A text button -- Cancel, Remove, Not now, Skip. The same face as meta, a
  // size up and in full cream, so it reads as something to press rather than
  // as another line of small print.
  action: {
    fontFamily: BrandFonts.wideMedium,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // The plain system face, for an identifier nested inside one of the
  // display voices above. Sets nothing but the family, so it inherits the
  // size and line of whatever it sits in.
  identifier: {
    fontFamily: SYSTEM_SANS,
  },
});

// The same table the component above renders from, exposed so a caller can
// ask what size a `type` actually is.
//
// Only StretchText needs this, and it needs it for a specific reason: that
// component draws text at a size it computes, not the one the type declares,
// and it cannot compute a size without knowing what it is starting from. A
// second hard-coded copy of these numbers would drift the first time one of
// them was tuned, so the real object is exported rather than a duplicate of
// its values.
export const TextTypeStyles = styles;
