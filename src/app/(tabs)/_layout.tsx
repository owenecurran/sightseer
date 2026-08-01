import { Stack } from 'expo-router';
import { Platform } from 'react-native';

import { TabPager } from '@/components/tab-pager';

// Native: hosts the 5 main tabs as swipeable PagerView pages (TabPager,
// src/components/tab-pager.native.tsx) instead of Stack screens, so
// switching between them is swipeable and direction-aware. Web: no
// react-native-pager-view build exists at all, so this stays a plain Stack
// — tap-only switching, the expected web interaction anyway. Branching here
// (not via a _layout.native.tsx file) is deliberate: Expo Router's own
// typedRoutes file scanning pulls in *both* platform variants of a
// route/layout file rather than resolving one per-platform the way a normal
// component import does — confirmed via a real web bundling failure trying
// to import react-native-pager-view. See tab-pager.native.tsx's own comment
// for the full story.
export default function TabLayout() {
  if (Platform.OS === 'web') {
    return <Stack screenOptions={{ headerShown: false }} />;
  }
  return <TabPager />;
}
