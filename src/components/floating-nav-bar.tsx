import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandColors, Colors, Spacing } from '@/constants/theme';
import { useNavBarHidden } from '@/hooks/use-hide-on-scroll';

const TABS = [
  { href: '/', icon: 'home-outline', activeIcon: 'home' },
  { href: '/explore', icon: 'search-outline', activeIcon: 'search' },
  { href: '/review', icon: 'add-circle-outline', activeIcon: 'add-circle' },
  { href: '/boards', icon: 'bookmark-outline', activeIcon: 'bookmark' },
  { href: '/profile', icon: 'person-circle-outline', activeIcon: 'person-circle' },
] as const;

const HIDE_DISTANCE = 120;

// Rendered once, above the Stack (src/app/_layout.tsx) rather than inside
// the (tabs) group, so it's present on every authenticated screen — including
// place/visit/user/board/reviews, which are Stack pushes outside (tabs) and
// previously had no persistent nav at all. Replaces NativeTabs (native) and
// the old boilerplate floating pill (web) with one cross-platform component,
// since neither could satisfy "visible on every screen" + "hide on scroll"
// (native OS tab chrome is tied to the tab navigator's own screens only).
export function FloatingNavBar() {
  const pathname = usePathname();
  const hidden = useNavBarHidden();
  const insets = useSafeAreaInsets();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: hidden.value * HIDE_DISTANCE }],
    opacity: 1 - hidden.value,
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + Spacing.three }, animatedStyle]}>
      <View style={styles.bar}>
        {TABS.map((tab, index) => {
          const isActive = pathname === tab.href;
          return (
            <View key={tab.href} style={styles.iconRow}>
              <Pressable
                onPress={() => router.navigate(tab.href)}
                hitSlop={8}
                style={styles.iconButton}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.icon}
                  size={24}
                  color={BrandColors.cream}
                />
              </Pressable>
              {index < TABS.length - 1 && <View style={styles.divider} />}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.backgroundElement,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
