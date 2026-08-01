import { useFocusEffect } from 'expo-router';
import { createContext, useContext, useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';
import type PagerView from 'react-native-pager-view';

// Shared between the root layout (src/app/_layout.tsx, which owns this
// state so it's reachable from both FloatingNavBar and, several levels
// deeper, (tabs)/_layout.native.tsx's actual PagerView), FloatingNavBar
// (switches pages on tap), (tabs)/_layout.native.tsx (owns the real
// PagerView instance, updates activeIndex as the user swipes), and each tab
// screen (to know when it's the active page, see usePagerFocusEffect below).
// Same shape/reasoning as NavBarVisibilityProvider (use-hide-on-scroll.tsx)
// — one shared value rather than prop-drilling through unrelated route
// trees. Web has no PagerView at all (see (tabs)/_layout.tsx's own comment),
// so `pagerRef`/`activeIndex` are simply unused there — `setActivePage`'s
// web implementation navigates via the router directly instead, matching
// what FloatingNavBar always did before this change.
type TabPagerContextValue = {
  pagerRef: RefObject<PagerView | null>;
  activeIndex: number;
  // Called by (tabs)/_layout.native.tsx's onPageSelected as the user swipes
  // — not meant to be called from anywhere else; use setActivePage below to
  // actually change pages.
  setActiveIndexInternal: (index: number) => void;
  setActivePage: (index: number) => void;
};

const TabPagerContext = createContext<TabPagerContextValue | null>(null);

export const TabPagerProvider = TabPagerContext.Provider;

export function useTabPager() {
  const ctx = useContext(TabPagerContext);
  if (!ctx) throw new Error('useTabPager must be used within TabPagerProvider');
  return ctx;
}

// Replaces `useFocusEffect` for the 5 main tab screens: they're all mounted
// simultaneously inside the PagerView (unlike a Stack, which only mounts the
// active screen), so React Navigation's own focus events never fire for
// them — swiping/tapping between pager pages isn't a "navigation" as far as
// @react-navigation/native is concerned. This fires `callback` whenever this
// screen's `pageIndex` becomes the pager's active page (including the
// initial page on first mount), matching useFocusEffect's real behavior —
// each screen still only refetches when it actually becomes visible again,
// not on every swipe past it or on every other page's activation.
export function usePagerFocusEffect(pageIndex: number, callback: () => void | (() => void)) {
  const { activeIndex } = useTabPager();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (activeIndex !== pageIndex) return;
    return callbackRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pageIndex]);
}

// Drop-in replacement for `useFocusEffect` at the 5 main tab screens' call
// sites: web still uses a real Expo Router Stack for these routes (no
// PagerView there — see (tabs)/_layout.tsx's own comment for why), so
// `useFocusEffect` still fires correctly and is used as-is; native mounts
// all 5 pages at once inside a PagerView, where `usePagerFocusEffect` above
// is what actually fires at the right time instead. `Platform.OS` never
// changes for a running app instance, so branching which hook runs is safe
// here despite normally violating rules-of-hooks.
export function useTabFocusEffect(pageIndex: number, effect: () => void | (() => void)) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useFocusEffect(effect);
  } else {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    usePagerFocusEffect(pageIndex, effect);
  }
}
