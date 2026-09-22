import { Platform } from 'react-native';

// Stops a drag that turned a postcard from ALSO firing whatever it happened
// to start on top of.
//
// THE BUG
//
// Press and hold on the place name, drag sideways to turn the card, let go:
// the card flips AND the app navigates to that place. Reported on web, and
// web is the only place it happens.
//
// The comment on useFlipGesture says "a pan with an activation offset does
// not swallow taps, so the photograph underneath keeps its own press". That
// is true on native, where gesture-handler and the touch responder system
// share one arbitration: when the pan claims the touch, the touchable
// underneath is sent a cancel and its press never fires.
//
// On web there is no such shared arbitration. react-native-web's Pressable
// runs on its own pointer-event responder, which gesture-handler does not
// participate in, so `pointerup` reaches it and onPress fires regardless of
// what the pan did with those same pointer events. Both handlers see the
// whole interaction and both act on it.
//
// THE GUARD
//
// The pan reports when it ACTIVATES — not when the finger lands, which is
// the distinction the whole design rests on. A tap never activates the pan
// (it does not travel ACTIVATE_X), so a tap is never suppressed. Only a
// real drag sets this, and only a press arriving in the same interaction as
// that drag is dropped.
//
// Two conditions rather than one, because the order in which web delivers
// `pointerup` to the Pressable and `onFinalize` to the pan is not something
// to depend on:
//
//   - `isDragging` covers a press that arrives BEFORE the pan finalises.
//   - `endedAt` covers one that arrives after.
//
// WEB ONLY, deliberately. On native the press is already cancelled for us,
// so the guard would change nothing there except to add a window in which a
// genuine quick tap after a flip gets eaten. Fixing a web bug is not worth
// a native regression, however small.

// How long after a drag ends a press is still treated as part of it.
//
// Long enough to cover the gap between pointerup and the handlers that
// follow it, short enough that a deliberate second interaction is never
// caught: a person who turns a card and then decides to tap the place name
// cannot do both inside this.
const SUPPRESS_MS = 300;

let isDragging = false;
let endedAt = 0;

// Module-level rather than per-card context, and that is sound rather than
// lazy: there is one pointer, so exactly one card can be mid-drag at a time.
// A per-card flag would carry no more information and would have to be
// threaded through to every tappable thing inside a face.
export function markCardDragStarted(): void {
  isDragging = true;
}

export function markCardDragEnded(): void {
  // Only stamps if a drag actually activated. onFinalize fires for every
  // outcome including a pan that never activated — that is the ordinary tap
  // — and stamping there would suppress every press on the card.
  if (!isDragging) return;
  isDragging = false;
  endedAt = Date.now();
}

export function wasCardJustDragged(): boolean {
  if (Platform.OS !== 'web') return false;
  return isDragging || Date.now() - endedAt < SUPPRESS_MS;
}

// Wraps a press handler so it does nothing when the press was really the end
// of a drag. Returns the handler unchanged off web, so nothing is paid for
// on the platforms that never had the problem.
export function guardCardPress<T extends unknown[]>(
  handler: (...args: T) => void
): (...args: T) => void {
  if (Platform.OS !== 'web') return handler;
  return (...args: T) => {
    if (wasCardJustDragged()) return;
    handler(...args);
  };
}
