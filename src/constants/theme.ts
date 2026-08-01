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
  background: '#031009',
  sage: '#a0bd91',
  cream: '#eae7cf',
} as const;

// The screen-level background is a diagonal gradient (bottom-left, lighter,
// to top-right, the flat brand background color) rather than a flat fill —
// used only by ThemedView's `type="screen"` for each screen's outermost
// wrapper, not by nested cards/boxes (those stay flat `BrandColors.background`
// via the regular `background` theme color, so content boxes don't each
// render their own mini gradient).
export const GradientColors = {
  screenStart: '#07120a',
  screenEnd: '#031009',
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

// FloatingNavBar (src/components/floating-nav-bar.tsx) is a single custom
// component floating over every screen on every platform now (not native
// per-platform tab chrome) — so every screen needs the same bottom
// clearance, cross-platform, to keep content from sitting underneath it.
// Recomputed from the bar's real size: icon (28) + iconButton padding
// (Spacing.two * 2 = 16) + bar's own paddingVertical (Spacing.three * 2 = 32)
// = 76px bar height, plus its bottom offset (Spacing.three = 16) plus a real
// device's home-indicator safe-area inset (~34 on iPhones with one) = ~126,
// plus a safety margin so content never sits flush against the bar.
export const BottomTabInset = 144;
// No longer needed now that the nav bar is bottom-anchored everywhere (it
// used to offset web screens for a top-floating web-only tab pill) — kept
// as a zero-value export rather than touched at every one of its many call
// sites, since `Spacing.x + TopTabInset` is a harmless no-op at 0.
export const TopTabInset = 0;
export const MaxContentWidth = 800;
