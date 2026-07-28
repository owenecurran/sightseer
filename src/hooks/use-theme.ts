import { Colors } from '@/constants/theme';

// The app uses one fixed brand theme, not a system-adaptive light/dark
// pair — this hook still exists so every screen keeps going through one
// indirection point rather than importing Colors directly everywhere.
export function useTheme() {
  return Colors;
}
