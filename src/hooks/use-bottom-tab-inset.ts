import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavBarHeight, Spacing } from '@/constants/theme';

// Real, per-device bottom clearance needed above FloatingNavBar — replaces
// the old flat `BottomTabInset` constant, which baked in a fixed guess at
// the home-indicator inset (~34) plus an admitted "safety margin," so it
// over-shot on some devices (leaving a visible gap) and under-shot on
// others. `insets.bottom` here is the same real value floating-nav-bar.tsx
// itself already uses to position the bar, so this always matches exactly.
export function useBottomTabInset(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + Spacing.three + NavBarHeight;
}
