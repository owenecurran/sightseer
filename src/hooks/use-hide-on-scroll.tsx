import { createContext, useContext, type ReactNode } from 'react';
import {
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// One shared value for the whole app (provided once at the root, above the
// Stack) rather than per-screen — the floating nav bar and every screen's
// scroll handler all read/write the same value, so hide/show state carries
// across navigation instead of resetting per screen.
type NavBarVisibilityContextValue = { hidden: SharedValue<number> };

const NavBarVisibilityContext = createContext<NavBarVisibilityContextValue | null>(null);

export function NavBarVisibilityProvider({ children }: { children: ReactNode }) {
  const hidden = useSharedValue(0);
  return (
    <NavBarVisibilityContext.Provider value={{ hidden }}>{children}</NavBarVisibilityContext.Provider>
  );
}

export function useNavBarHidden() {
  const ctx = useContext(NavBarVisibilityContext);
  if (!ctx) throw new Error('useNavBarHidden must be used within NavBarVisibilityProvider');
  return ctx.hidden;
}

// Small dead zone before reacting so tiny scroll jitters (e.g. rubber-band
// overscroll) don't flicker the bar, and always-visible near the very top
// so the bar doesn't hide itself on a screen that barely scrolls at all.
const HIDE_THRESHOLD = 8;
const TOP_THRESHOLD = 24;

// Attach the returned handler to a screen's scrollable container's
// `onScroll` (via `Animated.FlatList`/`Animated.ScrollView`, which both
// accept a reanimated scroll handler directly) plus `scrollEventThrottle={16}`.
export function useHideOnScrollHandler() {
  const hidden = useNavBarHidden();
  const lastY = useSharedValue(0);

  return useAnimatedScrollHandler({
    onScroll: (event) => {
      const y = event.contentOffset.y;
      const delta = y - lastY.value;

      if (y <= TOP_THRESHOLD) {
        hidden.value = withTiming(0, { duration: 200 });
      } else if (delta > HIDE_THRESHOLD) {
        hidden.value = withTiming(1, { duration: 200 });
      } else if (delta < -HIDE_THRESHOLD) {
        hidden.value = withTiming(0, { duration: 200 });
      }

      lastY.value = y;
    },
  });
}
