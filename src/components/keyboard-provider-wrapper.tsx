import type { ReactNode } from 'react';

// Web stub — no react-native-keyboard-controller build for web, and nothing
// on web needs the provider (keyboard-aware-scroll.tsx doesn't use it).
export function KeyboardProviderWrapper({ children }: { children: ReactNode }) {
  return children;
}
