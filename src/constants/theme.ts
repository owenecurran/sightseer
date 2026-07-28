/**
 * The app's single fixed brand theme — no light/dark switching. Every
 * screen goes through this one palette via useTheme()/ThemedView/ThemedText,
 * so this is the one place that defines the app's whole visual identity.
 */

import '@/global.css';

import { Platform } from 'react-native';

// The dark editorial brand look — not theme-adaptive (doesn't switch with
// system light/dark mode), used explicitly rather than folded into `Colors`
// below.
export const BrandColors = {
  background: '#03100a',
  sage: '#a0bd91',
  cream: '#eae7cf',
} as const;

export const Colors = {
  text: BrandColors.cream,
  background: BrandColors.background,
  backgroundElement: '#0f2318',
  backgroundSelected: '#1a3524',
  textSecondary: 'rgba(234,231,207,0.65)',
  sage: BrandColors.sage,
} as const;

export type ThemeColor = keyof typeof Colors;

// Registered via useFonts() in src/app/_layout.tsx — expo-font's web loader
// injects real @font-face rules under these same family names, so (unlike
// the OS-font branching below) one flat set works across every platform.
export const BrandFonts = {
  serifDisplay: 'BethanyElingston',
  condensedHeavy: 'MoonGetHeavy',
  roundedStat: 'HelveticaRoundedBold',
  wideMedium: 'ObviouslyWideMedium',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
// The web tab bar (app-tabs.web.tsx) floats via position:'absolute' over
// content rather than reserving its own layout space, so every screen's
// top padding needs this extra clearance on web specifically (0 elsewhere —
// NativeTabs reserves real space for its own bottom bar already).
export const TopTabInset = Platform.select({ web: 48 }) ?? 0;
export const MaxContentWidth = 800;
