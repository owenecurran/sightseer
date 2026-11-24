import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from 'react';
import { View, type HostInstance, type ScrollView, type StyleProp, type ViewStyle } from 'react-native';
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
  // What the routes drawn between postcards keep clear of: a byline's
  // avatar and name, a travel book's date. See useClearZone.
  clearZones: ClearZoneStore;
};

// A box in the list, in the list's own coordinates (as measureLayout gives
// them, scroll left out), that a route passes under rather than through.
export type ClearZone = { x: number; y: number; width: number; height: number };

// The boxes registered on one stage, and who to tell when they change.
// useSyncExternalStore reads `version`, so a change re-renders only what
// reads the zones (the routes), not the screen.
export type ClearZoneStore = {
  zones: Map<string, ClearZone>;
  version: number;
  subscribers: Set<() => void>;
};

function makeClearZoneStore(): ClearZoneStore {
  return { zones: new Map(), version: 0, subscribers: new Set() };
}

function setClearZone(store: ClearZoneStore, id: string, zone: ClearZone | null) {
  const current = store.zones.get(id);
  if (zone == null) {
    if (!current) return;
    store.zones.delete(id);
  } else {
    if (
      current &&
      Math.abs(current.x - zone.x) < 0.5 &&
      Math.abs(current.y - zone.y) < 0.5 &&
      Math.abs(current.width - zone.width) < 0.5 &&
      Math.abs(current.height - zone.height) < 0.5
    )
      return;
    store.zones.set(id, zone);
  }
  store.version += 1;
  for (const notify of store.subscribers) notify();
}

const ScrollStageContext = createContext<ScrollStage | null>(null);

// For the screen that owns the scroll view. Spread `scrollProps` on it, put
// `stage.scrollY` in its scroll handler, and wrap it in a ScrollStageProvider.
export function useScrollStage(scrollRef: RefObject<ScrollView | null>) {
  const scrollY = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const measureFrame = useRef<number | null>(null);
  // One set for the screen's life, made once.
  const [listeners] = useState(() => new Set<() => void>());
  const [clearZones] = useState(makeClearZoneStore);

  const stage = useMemo<ScrollStage>(
    () => ({ scrollY, viewportTop, scrollRef, listeners, clearZones }),
    [scrollY, viewportTop, scrollRef, listeners, clearZones],
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

// For something a route should pass under: put `ref` and `onLayout` on a
// View hugging it (the avatar and name, not the whole row), and its box is
// registered on the stage while it is mounted. Does nothing outside a stage.
export function useClearZone() {
  const stage = useContext(ScrollStageContext);
  const id = useId();
  const ref = useRef<View>(null);

  const measureNow = useCallback(() => {
    const node = ref.current;
    const host = scrollHost(stage?.scrollRef.current ?? null);
    if (!stage || !node || !host) return;
    node.measureLayout(
      host,
      (x, y, width, height) => setClearZone(stage.clearZones, id, { x, y, width, height }),
      () => {},
    );
  }, [stage, id]);

  useEffect(() => {
    if (!stage) return;
    const { listeners, clearZones } = stage;
    listeners.add(measureNow);
    return () => {
      listeners.delete(measureNow);
      setClearZone(clearZones, id, null);
    };
  }, [stage, measureNow, id]);

  return { ref, onLayout: measureNow };
}

// For a route: its own box in the list (null until measured), and the clear
// zones on the stage, re-read whenever either changes.
export function useClearZones() {
  const stage = useContext(ScrollStageContext);
  const ref = useRef<View>(null);
  const [frame, setFrame] = useState<ClearZone | null>(null);

  const measureNow = useCallback(() => {
    const node = ref.current;
    const host = scrollHost(stage?.scrollRef.current ?? null);
    if (!node || !host) return;
    node.measureLayout(
      host,
      (x, y, width, height) =>
        setFrame((current) =>
          current && Math.abs(current.x - x) < 0.5 && Math.abs(current.y - y) < 0.5 && current.width === width && current.height === height
            ? current
            : { x, y, width, height },
        ),
      () => {},
    );
  }, [stage]);

  useEffect(() => {
    if (!stage) return;
    const { listeners } = stage;
    listeners.add(measureNow);
    return () => {
      listeners.delete(measureNow);
    };
  }, [stage, measureNow]);

  const store = stage?.clearZones;
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!store) return () => {};
      store.subscribers.add(notify);
      return () => {
        store.subscribers.delete(notify);
      };
    },
    [store],
  );
  const version = useSyncExternalStore(subscribe, () => store?.version ?? 0, () => 0);
  const zones = useMemo(
    () => (store ? [...store.zones.values()] : []),
    // version is what says the map has changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, version],
  );

  return { ref, onLayout: measureNow, frame, zones };
}

// useClearZone as a View, for where a hook cannot go (a row built inside a
// map) and to keep the ref plumbing out of the screens. Give it a style that
// hugs what it holds: its box is what the road leaves out.
export function ClearZoneView({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { ref, onLayout } = useClearZone();
  return (
    <View ref={ref} collapsable={false} style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}

// The native scroll view behind whatever the screen's ref holds: an RN
// ScrollView, or the keyboard-aware one that wraps it.
function scrollHost(scroll: ScrollView | null): HostInstance | null {
  if (!scroll) return null;
  const withNative = scroll as ScrollView & { getNativeScrollRef?: () => HostInstance | null };
  return withNative.getNativeScrollRef?.() ?? null;
}
