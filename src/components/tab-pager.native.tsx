import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import BoardsScreen from '@/app/(tabs)/boards';
import ExploreScreen from '@/app/(tabs)/explore';
import IndexScreen from '@/app/(tabs)/index';
import ReviewScreen from '@/app/(tabs)/review';
import ProfileScreen from '@/app/(tabs)/profile';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { useTabPager } from '@/hooks/use-tab-pager';

const SCREENS = [IndexScreen, ExploreScreen, ReviewScreen, BoardsScreen, ProfileScreen];

// Deliberately NOT src/app/(tabs)/_layout.native.tsx — Expo Router's own
// route-file discovery (typedRoutes' static scan of src/app/, confirmed via
// the actual bundler error: web bundling failed trying to import
// react-native-pager-view from a `.native.tsx` file under src/app/) pulls in
// *both* platform variants of a route/layout file rather than letting
// Metro's normal per-import platform resolution pick one — unlike a regular
// component file like this one, which resolves correctly (proven all
// session by location-search-modal.native.tsx/.tsx, profile-map.native.tsx/
// .tsx, etc.). So this lives here and (tabs)/_layout.tsx just imports and
// conditionally renders it.
//
// Hosts the 5 main tab screens as PagerView pages instead of Expo Router
// Stack screens, so switching between them is swipeable and direction-aware
// (PagerView's own index-delta-aware transition gives that for free — no
// custom animation-direction logic needed).
//
// Each screen is imported and rendered directly as a plain child view here,
// bypassing Expo Router's own file-based screen-mounting for these 5 routes
// — meaning `useFocusEffect` no longer fires for them (there's no real
// navigator screen transition happening, just a pager swipe). Each of the 3
// screens that relied on it (index/boards/profile) was switched to
// `useTabFocusEffect` (src/hooks/use-tab-pager.ts), which is aware of this.
export function TabPager() {
  const { pagerRef, setActiveIndexInternal } = useTabPager();
  const pathname = usePathname();

  // Route → pager sync, but mount-only (empty deps): this only exists to
  // land on the right page for a cold start deep-linked straight to e.g.
  // /boards. It must NOT re-run on every pathname change — confirmed live
  // that it otherwise fires on every Stack pop back to (tabs) too (pushing
  // /edit-profile then hitting Back resolves pathname to '/', the group's
  // bare route, since tab switches never touch the router at all — see
  // setActivePage below), which was yanking the pager back to Feed even when
  // the user had been on a completely different tab. Nothing in the app
  // actually does a live router.push to a bare tab route today (grepped for
  // it) — that's what setActivePage/useTabPager's context is for instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const index = TAB_ROUTES.indexOf(pathname as (typeof TAB_ROUTES)[number]);
    if (index === -1) return;
    pagerRef.current?.setPageWithoutAnimation(index);
  }, []);

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={0}
      // One page either side, NOT all four.
      //
      // Holding every page attached looked like a free win — until it
      // turned out the cost isn't memory, it's GL surfaces: these screens
      // are full of rating stamps, each stamp is a Skia canvas, and pinning
      // all five pages keeps every one of those contexts alive for the
      // whole session no matter which tab you're on. That is steady-state
      // pressure on exactly the thing that has faulted the host OpenGL
      // driver repeatedly.
      //
      // Almost nothing is lost by dialling it back: what actually made tab
      // switching feel slow was each tab fetching its data on first visit,
      // and that's fixed separately by the warm-up in usePagerFocusEffect.
      // Rebuilding a page's views on arrival is cheap; waiting on a network
      // round trip was not.
      offscreenPageLimit={1}
      onPageSelected={(e) => setActiveIndexInternal(e.nativeEvent.position)}>
      {SCREENS.map((Screen, index) => (
        // collapsable={false}: without it, Android's view-flattening
        // optimization can drop a plain wrapper View with no styles of its
        // own from the native tree, which PagerView needs each direct child
        // to genuinely be present as (per its own docs' requirement that
        // every child be a real View).
        <View key={TAB_ROUTES[index]} collapsable={false} style={styles.page}>
          <Screen />
        </View>
      ))}
    </PagerView>
  );
}

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
