import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import type { HostInstance, ScrollView, View } from 'react-native';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

// Where things in a scrolling list are on screen, for what moves with the
// scroll: cards dealt in as they arrive, the routes drawn between them.
//
// Not measure(). That reads the scroll offset the layout engine was last
// told, which trails the real one: measured on the emulator, position plus
// offset for one element drifted by up to 50 points mid-scroll, and since
// nothing re-reads it once scrolling stops, cards were left sitting half
// dealt, a route half drawn. So each element measures where it sits in the
// list once, by layout alone (measureLayout leaves scroll offsets out), and
// its place on screen is that against the live scroll position:
//
//   top on screen = list top on screen + place in list - scrolled
//
// which is exact on every frame and costs nothing to work out.
export type ScrollStage = {
  scrollY: SharedValue<number>;
  // The scroll view's own top on screen. Moves when a header above it
  // collapses.
  viewportTop: SharedValue<number>;
  scrollRef: RefObject<ScrollView | null>;
  // Everything on the stage re-measures its place when the list's content
  // changes size: something above it grew or went away.
  listeners: Set<() => void>;
};

const ScrollStageContext = createContext<ScrollStage | null>(null);

// For the screen that owns the scroll view. Spread `scrollProps` on it, put
// `stage.scrollY` in its scroll handler, and wrap it in a ScrollStageProvider.
export function useScrollStage(scrollRef: RefObject<ScrollView | null>) {
  const scrollY = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const measureFrame = useRef<number | null>(null);
  // One set for the screen's life, made once.
  const [listeners] = useState(() => new Set<() => void>());

  const stage = useMemo<ScrollStage>(
    () => ({ scrollY, viewportTop, scrollRef, listeners }),
    [scrollY, viewportTop, scrollRef, listeners],
  );

  const remeasureAll = useCallback(() => {
    if (measureFrame.current != null) return;
    measureFrame.current = requestAnimationFrame(() => {
      measureFrame.current = null;
      scrollHost(scrollRef.current)?.measure((_x, _y, _width, _height, _pageX, pageY) => {
        viewportTop.set(pageY);
      });
      for (const remeasure of listeners) remeasure();
    });
  }, [listeners, scrollRef, viewportTop]);

  useEffect(() => () => {
    if (measureFrame.current != null) {
      cancelAnimationFrame(measureFrame.current);
      measureFrame.current = null;
    }
  }, []);

  return { stage, scrollProps: { onLayout: remeasureAll, onContentSizeChange: remeasureAll } };
}

export function ScrollStageProvider({ stage, children }: { stage: ScrollStage; children: ReactNode }) {
  return <ScrollStageContext.Provider value={stage}>{children}</ScrollStageContext.Provider>;
}

// For an element on the stage: put `ref` and `onLayout` on a View that does
// not itself move, and read `contentY` (its place in the list, -1 until
// measured) and `height`. Null stage when not inside a list that has one.
export function useStagedFrame() {
  const stage = useContext(ScrollStageContext);
  const ref = useRef<View>(null);
  const contentY = useSharedValue(-1);
  const height = useSharedValue(0);

  const measureNow = useCallback(() => {
    const node = ref.current;
    const host = scrollHost(stage?.scrollRef.current ?? null);
    if (!node || !host) return;
    node.measureLayout(
      host,
      (_x, y, _width, measuredHeight) => {
        contentY.set(y);
        height.set(measuredHeight);
      },
      () => {},
    );
  }, [stage, contentY, height]);

  useEffect(() => {
    if (!stage) return;
    const { listeners } = stage;
    listeners.add(measureNow);
    return () => {
      listeners.delete(measureNow);
    };
  }, [stage, measureNow]);

  return { stage, ref, onLayout: measureNow, contentY, height };
}

// The native scroll view behind whatever the screen's ref holds: an RN
// ScrollView, or the keyboard-aware one that wraps it.
function scrollHost(scroll: ScrollView | null): HostInstance | null {
  if (!scroll) return null;
  const withNative = scroll as ScrollView & { getNativeScrollRef?: () => HostInstance | null };
  return withNative.getNativeScrollRef?.() ?? null;
}
