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
    | 'headline'
    | 'statLine'
    | 'roundedStat'
    | 'sectionLabel';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        type === 'displaySerif' && styles.displaySerif,
        type === 'headline' && styles.headline,
        type === 'statLine' && styles.statLine,
        type === 'roundedStat' && styles.roundedStat,
        type === 'sectionLabel' && styles.sectionLabel,
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
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
  // Custom display fonts (BrandFonts.*) have taller glyph metrics than the
  // system font a plain `fontSize * 1.1-1.2` lineHeight heuristic assumes —
  // too tight a lineHeight clips the tops of ascenders/cap-height instead of
  // just tightening leading, and iOS is stricter about honoring lineHeight
  // as a hard clip boundary than Android/web are (same fontSize/lineHeight
  // values rendered fine on both of those, only iOS showed clipping).
  // Padded to roughly a 1.2x+ ratio here, not just nudged a couple pixels.
  displaySerif: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 32,
    lineHeight: 40,
  },
  headline: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 34,
    lineHeight: 42,
    textTransform: 'uppercase',
  },
  statLine: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 15,
    lineHeight: 22,
  },
  roundedStat: {
    fontFamily: BrandFonts.roundedStat,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionLabel: {
    fontFamily: BrandFonts.wideMedium,
    fontSize: 12,
    lineHeight: 18,
  },
});
