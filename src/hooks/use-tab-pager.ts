import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, type RefObject } from 'react';
import { InteractionManager, Platform } from 'react-native';
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

// The same thing, for code that must work where there is no pager at all.
//
// The five tab screens always have one; a shared UI component does not. Web
// has no PagerView (see (tabs)/_layout.tsx), and a postcard is rendered from
// plenty of places outside the tab tree — a modal, the dev gallery, a Stack
// route. Those must not throw just for asking.
export function useTabPagerOptional(): TabPagerContextValue | null {
  return useContext(TabPagerContext);
}

// Stops the tab pager reacting to a horizontal drag, for as long as a card is
// being touched.
//
// The postcard turns over on a sideways drag, and the five tabs are a
// PagerView — so the two want the same gesture. On Android the card's own
// activation threshold was enough to win it; on iOS it is not. PagerView
// there is a UIPageViewController whose scroll view claims the touch almost
// immediately, well before the card's pan has seen the 18pt of travel it
// needs to activate, so a drag meant to flip a review paged across to Search
// instead.
//
// Rather than fight over recognition order, the pager is simply switched off
// while a finger is down on a card. That is exactly the rule asked for — a
// swipe inside a postcard's bounds is never a page swipe — and it does not
// depend on which gesture system wins a race on which platform.
//
// The imperative command rather than the `scrollEnabled` prop deliberately:
// the prop is React state, so it would take a render to land, and the whole
// problem is that the pager claims the touch within a frame or two of it
// starting. `setScrollEnabled` goes straight to the native view. It is also
// what react-native-pager-view documents the method for.
export function usePagerSwipeLock(): (locked: boolean) => void {
  const ctx = useTabPagerOptional();
  const pagerRef = ctx?.pagerRef;

  return useCallback(
    (locked: boolean) => {
      pagerRef?.current?.setScrollEnabled(!locked);
    },
    [pagerRef],
  );
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
  // Set as soon as this page is genuinely focused, so the warm-up below can
  // tell "nobody has loaded this yet" from "the user got here first".
  const hasFocusedRef = useRef(false);

  useEffect(() => {
    if (activeIndex !== pageIndex) return;
    hasFocusedRef.current = true;
    return callbackRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pageIndex]);

  // Warm-up: load each tab's data at launch instead of on first visit.
  //
  // All 5 screens already MOUNT together (they're PagerView children), but
  // their data didn't — every screen gates its first render on
  // `hasLoadedOnce` and only fetched once it became the active page, so the
  // first switch to each tab showed a PageLoader while a round trip you
  // could have made at startup went out. Prefetching here is what turns
  // that first switch into an instant one; later switches already reused
  // what was loaded.
  //
  // Mount-only, and safe as such: the root layout renders nothing until
  // auth resolves (`if (isLoading) return null`) and the tabs sit behind an
  // authenticated guard, so `session` is always present by the time this
  // runs — there is no later arrival to re-fire for.
  //
  // Deferred rather than immediate so the tab the app actually opened on
  // isn't racing four hidden ones for the network on the slowest frame of
  // the whole launch.
  useEffect(() => {
    // The active page is the focus effect's own job — warming it here would
    // just double every launch request.
    if (activeIndex === pageIndex) return;
    const task = InteractionManager.runAfterInteractions(() => {
      // Beaten to it by a fast swipe; the focus effect already loaded it.
      if (hasFocusedRef.current) return;
      callbackRef.current();
    });
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
