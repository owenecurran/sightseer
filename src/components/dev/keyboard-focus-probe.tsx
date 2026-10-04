// Web has no react-native-keyboard-controller build and no on-screen
// keyboard to measure — see keyboard-aware-scroll.tsx for the same split.
// The real probe is keyboard-focus-probe.native.tsx.
export function KeyboardFocusProbe(_props: {
  label: string;
  inputRef: { current: { measureInWindow?: unknown } | null };
}) {
  return null;
}
