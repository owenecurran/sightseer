import { Stack } from 'expo-router';

// No longer a real tab navigator — nav chrome moved to the global
// FloatingNavBar (src/components/floating-nav-bar.tsx), rendered once above
// the whole app in src/app/_layout.tsx so it also covers Stack-pushed
// detail screens outside this group. This `(tabs)` folder is now just a
// route grouping for the 5 main screens, routed via a plain Stack.
export default function TabLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
