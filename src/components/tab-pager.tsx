// Web has no react-native-pager-view build at all — (tabs)/_layout.tsx
// never actually renders this on web (it branches to a plain Stack
// instead), but the import still needs to resolve to *something* for
// Metro's web bundle, hence this trivial unused stand-in. See
// tab-pager.native.tsx for the real implementation and why it isn't a
// src/app/(tabs)/_layout.native.tsx file.
export function TabPager() {
  return null;
}
