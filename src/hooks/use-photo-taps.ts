import { useCallback, useRef } from 'react';

// Standard single/double-tap disambiguation window.
const DOUBLE_TAP_MS = 300;

// Tells a single tap on a photo apart from the first half of a double tap.
//
// Plain tap timestamps rather than an RNGH gesture — an RNGH GestureDetector
// nested inside the feed's *outer* double-tap detector didn't reliably
// receive events, and neither did building both taps as one
// Gesture.Exclusive() per tile. This sidesteps RNGH entirely: a single tap
// opens the photo after a short window with no second tap; a second tap
// inside that window cancels it and fires onDoubleTap instead — the same
// debounce pattern gesture libraries use internally, written out.
//
// One map per grid (keyed by tile index), not one ref per tile, since the
// number of tiles varies with props and hooks cannot be called a variable
// number of times.
//
// Lifted out of PhotoGrid so the postcard's own fixed-aspect photo frame
// gets the identical behaviour instead of a second, subtly different copy.
export function usePhotoTaps(
  onOpen: (index: number) => void,
  onDoubleTap?: () => void,
): (index: number) => void {
  const lastTapAtRef = useRef<Map<number, number>>(new Map());
  const pendingOpenRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  return useCallback(
    (index: number) => {
      const now = Date.now();
      const lastTapAt = lastTapAtRef.current.get(index) ?? 0;
      lastTapAtRef.current.set(index, now);

      if (onDoubleTap && now - lastTapAt < DOUBLE_TAP_MS) {
        const pending = pendingOpenRef.current.get(index);
        if (pending) {
          clearTimeout(pending);
          pendingOpenRef.current.delete(index);
        }
        lastTapAtRef.current.set(index, 0);
        onDoubleTap();
        return;
      }

      if (onDoubleTap) {
        const timeout = setTimeout(() => {
          pendingOpenRef.current.delete(index);
          onOpen(index);
        }, DOUBLE_TAP_MS);
        pendingOpenRef.current.set(index, timeout);
      } else {
        onOpen(index);
      }
    },
    [onDoubleTap, onOpen],
  );
}
