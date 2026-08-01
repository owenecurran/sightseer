import type { ReactNode } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';

// See keyboard-aware-scroll.native.tsx's comment — same "keep native-only
// libraries out of route/layout files" reasoning. KeyboardAwareScrollView
// (used in review.tsx/edit-profile.tsx) requires being inside this provider
// or it throws/warns at runtime.
export function KeyboardProviderWrapper({ children }: { children: ReactNode }) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}
