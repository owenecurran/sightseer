import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { BrandColors, Colors, Spacing } from '@/constants/theme';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { useNavBarHidden } from '@/hooks/use-hide-on-scroll';
import { useTabPager } from '@/hooks/use-tab-pager';
import { getAvatarViewUrls } from '@/lib/avatar';
import { useAuth } from '@/lib/auth-context';

// The last tab, which is the only one that shows a person rather than a
// thing. Derived from the route list rather than written as 4, so it cannot
// drift if a tab is ever inserted.
const PROFILE_TAB_INDEX = TAB_ROUTES.length - 1;
const AVATAR_TAB_SIZE = 26;

// Icon info keyed to TAB_ROUTES by index (not a separately hand-copied href
// list) — see that file's own comment for why: a pager page order that
// silently drifted from this nav bar's order would make tapping a tab
// visibly slide to the wrong page.
const TAB_ICONS = [
  { icon: 'home-outline', activeIcon: 'home' },
  { icon: 'search-outline', activeIcon: 'search' },
  { icon: 'add-circle-outline', activeIcon: 'add-circle' },
  { icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { icon: 'person-circle-outline', activeIcon: 'person-circle' },
] as const;

const HIDE_DISTANCE = 120;

// Rendered once, above the Stack (src/app/_layout.tsx) rather than inside
// the (tabs) group, so it can float over every screen it's meant to.
// Replaces NativeTabs (native) and the old boilerplate floating pill (web)
// with one cross-platform component, since neither could satisfy "hide on
// scroll" (native OS tab chrome doesn't support that) — visibility itself
// (which screens show it at all) is decided by the caller in _layout.tsx,
// not here.
export function FloatingNavBar() {
  const pathname = usePathname();
  const hidden = useNavBarHidden();
  const insets = useSafeAreaInsets();
  const { activeIndex, setActivePage } = useTabPager();

  // `hidden` is one shared value for the whole app (NavBarVisibilityProvider's
  // own comment), so scrolling down on one tab leaves the bar hidden after
  // switching to another — confirmed live by swiping Profile (scrolled down)
  // -> Boards (a short list with nothing to scroll, so no onScroll ever fires
  // to bring it back). Switching tabs, by swipe or tap, should always reveal
  // it again since the destination tab's own scroll position isn't something
  // the user controlled.
  useEffect(() => {
    hidden.value = withTiming(0, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, pathname]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * HIDE_DISTANCE }],
    opacity: 1 - hidden.value,
  }));

  // The profile tab wears the viewer's own face.
  //
  // Only when there is one. An account with no photograph keeps the person
  // glyph rather than falling back to Avatar's initials: a single letter
  // sitting in a row of line icons reads as a different kind of control, and
  // the glyph is already the right answer for "you".
  const { session, profile } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    // No synchronous setState to clear a stale url — React's lint rejects
    // that, and it is not needed: whether the face is DRAWN is derived from
    // the key below, so a url left over from a removed photograph is simply
    // never read.
    if (!session || !profile?.avatar_r2_key) return;
    let cancelled = false;
    void getAvatarViewUrls([session.user.id])
      .then((urls) => {
        if (!cancelled) setAvatarUrl(urls[session.user.id] ?? null);
      })
      // A face that will not load is not worth surfacing; the glyph stands in.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, profile?.avatar_r2_key]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + Spacing.three }, animatedStyle]}>
      <View style={styles.bar}>
        {TAB_ROUTES.map((href, index) => {
          const icons = TAB_ICONS[index];
          // Native: driven by the pager's own tracked page (correct even
          // right after a swipe, before any route/pathname change lands).
          // Web: there's no pager, so pathname is the real source of truth,
          // same as before this change.
          const isActive = Platform.OS === 'web' ? pathname === href : index === activeIndex;
          return (
            <View key={href} style={styles.iconRow}>
              <Pressable onPress={() => setActivePage(index)} hitSlop={8} style={styles.iconButton}>
                {index === PROFILE_TAB_INDEX && profile?.avatar_r2_key && avatarUrl ? (
                  // The ring is how this tab says "active", since a
                  // photograph has no outline/filled pair to switch between
                  // the way the glyphs do. Always drawn and only coloured in,
                  // so the icon does not change size when it is selected.
                  <View style={[styles.avatarRing, isActive && styles.avatarRingActive]}>
                    <Avatar uri={avatarUrl} name={profile?.name ?? profile?.handle} size={AVATAR_TAB_SIZE} />
                  </View>
                ) : (
                  <Ionicons name={isActive ? icons.activeIcon : icons.icon} size={28} color={BrandColors.cream} />
                )}
              </Pressable>
              {index < TAB_ROUTES.length - 1 && <View style={styles.divider} />}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Slightly under the 28pt glyphs: a filled circle reads bigger than a line
  // icon at the same measurement, so matching the number would make this tab
  // look like the largest thing in the bar.
  avatarRing: {
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: (AVATAR_TAB_SIZE + 4) / 2,
    padding: 1,
  },
  avatarRingActive: {
    borderColor: BrandColors.cream,
  },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Bigger and more rectangular than the original full pill: borderRadius
  // dropped from 999 (capsule) to a visibly-rounded-rectangle value, and both
  // paddings increased — see useBottomTabInset() in
  // hooks/use-bottom-tab-inset.ts for the matching bottom clearance every
  // screen needs now that this is taller.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundElement,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    padding: Spacing.two,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
    backgroundColor: 'rgba(234,231,207,0.25)',
    marginHorizontal: Spacing.one,
  },
});
