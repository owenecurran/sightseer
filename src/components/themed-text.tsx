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
  displaySerif: {
    fontFamily: BrandFonts.serifDisplay,
    fontSize: 32,
    lineHeight: 36,
  },
  headline: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 34,
    lineHeight: 38,
    textTransform: 'uppercase',
  },
  statLine: {
    fontFamily: BrandFonts.condensedHeavy,
    fontSize: 15,
    lineHeight: 20,
  },
  roundedStat: {
    fontFamily: BrandFonts.roundedStat,
    fontSize: 14,
    lineHeight: 18,
  },
  sectionLabel: {
    fontFamily: BrandFonts.wideMedium,
    fontSize: 12,
    lineHeight: 16,
  },
});
