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
// render their own mini gradient). Restored to the original, visibly
// brighter start color after a near-identical pair (#031009→#03100a) turned
// out to look the same as not fixing anything — see ThemedView's own
// comment for the real gradient-not-rendering bug that made *any* color
// choice here look unchanging on mobile.
// The accent set every hand-applied-looking object draws from — arrow
// stickers, tag stickers, and the create chooser's cards. Kept here rather
// than in any one of them because "belongs to the same set of objects" is
// the entire point of sharing it, and it had already been copy-pasted into
// two files before this.
export const StickerAccents = [
  '#a0bd91',
  '#e0a458',
  '#c96a5b',
  '#6b8fb5',
  '#b58bbd',
  '#7fae9e',
] as const;

export const GradientColors = {
  screenStart: '#07120a',
  screenEnd: '#031009',
} as const;

export const Colors = {
  text: BrandColors.cream,
  background: BrandColors.background,
  backgroundElement: '#0f2318',
  backgroundSelected: '#1a3524',
  // Text fields and the chips that behave like them.
  //
  // A well, not a raised surface: DARKER than the panel it sits in rather
  // than lighter. Two reasons, both load-bearing.
  //
  // It cannot be reused from backgroundElement, which is the panel colour —
  // a field drawn in that was the same shade as the card around it and had
  // to be rescued by a hairline outline, the wireframe look the panels
  // themselves just lost.
  //
  // And it cannot simply be lighter: the only room above the panel is under
  // backgroundSelected, which left a step of ~6 against the panel (measured
  // on device) while crowding the colour that has to keep meaning
  // "selected". Going the other way there is a clear gap, so this sits
  // halfway between the screen and the panel and gets a real step against
  // both — visible inside a card, and still visible on the bare screen
  // background where the auth fields live.
  backgroundField: '#091a11',
  // Dimmed cream. Still right for what it now mostly does -- the inactive
  // half of a toggle, a placeholder, an icon -- where "less than the text
  // beside it" is the whole message. It is NOT the colour for words that
  // are meant to be read: the green shows through the transparency and
  // turns it a flat olive-grey, which is what made every caption in the
  // app look unfinished. Those have the two colours below.
  textSecondary: 'rgba(234,231,207,0.65)',
  // Captions and asides, set in the serif (ThemedText type="caption").
  // Opaque and warm, like the cream aged a shade, so a sentence under a
  // heading reads as a quieter voice rather than as text that is switched
  // off.
  textCaption: '#c4bfa0',
  // Metadata in the wide face (type="meta"): times, counts, places. Leans
  // toward the sage so a line of facts is told apart from a line of prose
  // by colour as well as by face, without being sage itself, which means
  // "you can press this".
  textMeta: '#b3c2a4',
  sage: BrandColors.sage,
  // Links. A desaturated blue pulled up toward the cream's lightness, so a
  // link reads as a different KIND of text rather than a different palette.
  // It replaces a hardcoded #3c87f7 — a stock system blue that belonged to
  // no part of this design and was the only saturated cool color on screen.
  link: '#b8cce0',
  // Destructive actions only — deleting an account, and nothing else yet.
  // Taken from the warm end of the rating gradient (#ca4021) rather than a
  // new hue, so it reads as this app's red rather than a system alert red.
  // Needed because every actionable text on the settings screen was sage,
  // which made "Delete my account" look exactly like "Terms of use".
  danger: '#d0523c',
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
  // Art-deco display, for the postcard lettering that is meant to read as a
  // 1930s luggage label.
  deco: 'PagAuto',
  // The four faces the broader location line is set in — the state and
  // country above or below a place's name. Display faces rather than UI
  // ones, because that line is printing on a card, not a caption in an app.
  regionRounded: 'AcidGreenPoster',
  regionGrotesqueBold: 'AntarcticanBold',
  regionGrotesqueLight: 'AntarcticanLight',
  regionDidone: 'BohemianSoul',
  regionDeco: 'BuenaparkJf',
  // Things written and typed rather than printed, for the parts of the app
  // that are a journal being filled in: a typewriter's labels, a neat hand
  // for what someone writes, and a quick scrawl for notes in the margin.
  typewriter: 'SpecialElite',
  hand: 'PatrickHand',
  scrawl: 'ReenieBeanie',
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
// The bar's real content height: icon (28) + iconButton padding
// (Spacing.two * 2 = 16) + bar's own paddingVertical (Spacing.three * 2 = 32)
// = 76px. Screens should use `useBottomTabInset()` (src/hooks/use-bottom-tab-inset.ts)
// instead of a flat constant — it adds the bar's own bottom offset
// (Spacing.three) plus this on top of the device's *real* safe-area inset
// (via useSafeAreaInsets(), the same value the bar itself is positioned
// with), rather than a fixed guess that over/under-shoots per device.
export const NavBarHeight = 76;
// No longer needed now that the nav bar is bottom-anchored everywhere (it
// used to offset web screens for a top-floating web-only tab pill) — kept
// as a zero-value export rather than touched at every one of its many call
// sites, since `Spacing.x + TopTabInset` is a harmless no-op at 0.
export const TopTabInset = 0;
export const MaxContentWidth = 800;
// The safe-area edges for a screen whose content scrolls under the floating
// nav bar. Not the bottom: such a screen's scroll content already pads its
// own bottom past the gesture bar (useBottomTabInset includes that inset),
// and padding the frame as well stopped the scroll view short of the
// screen, so content was cut off in a band above the gesture bar rather
// than by the edge of the screen.
export const ScrollScreenEdges = ['top', 'left', 'right'] as const;
