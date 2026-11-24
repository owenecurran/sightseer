import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { ThemedView } from '@/components/themed-view';
import type { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Declared before anything that uses them, and that is not tidiness. With
// constants like these at the foot of the file, below the worklets that read
// them, an earlier version of this box never drew at all; moved up, it did.
// A worklet's closure is taken where the worklet is defined, so they most
// likely reached it undefined.
//
// How long one panel takes to swing from edge-on to flat, and how long after
// one panel starts the next one does.
const PANEL_TURN = 300;
const PANEL_STAGGER = 85;
// However many rows a box has, the whole unfold takes no longer than this. A
// long list gets a tighter stagger instead: twenty rows at the full stagger
// would be two seconds of waiting to use a menu.
const UNFOLD_LONGEST = 760;
const PERSPECTIVE = 900;
const SHADE_AWAY = 0.55;
const SHADE_TOWARD = 0.14;
// What a fold is before it is placed, and after it has landed.
const FLAT = [{ perspective: PERSPECTIVE }, { translateY: 0 }, { rotateX: '0deg' }];

type Hold = 'top' | 'bottom';

type Band = { top: number; height: number };
type Placement = { band: number; origin: [number, number] };

type UnfoldLayout = {
  // Changes only when something measured does, so a re-measure that finds
  // the box as it was does not re-render every fold in it.
  key: string;
  width: number;
  height: number;
  // In the order they open: from the held edge outward.
  bands: Band[];
  heights: number[];
  placements: Map<string, Placement>;
  stagger: number;
  total: number;
};

type UnfoldContextValue = {
  register: (id: string, ref: RefObject<View | null>) => () => void;
  layout: UnfoldLayout | null;
  elapsed: SharedValue<number>;
  hold: Hold;
};

const UnfoldContext = createContext<UnfoldContextValue | null>(null);

type UnfoldProps = {
  children: ReactNode;
  // The edge the box is held by while it falls open: 'top' for one that
  // drops open (a dialog, a menu under its button), 'bottom' for a sheet
  // that rises off the foot of the screen.
  from?: Hold;
  // What the box is printed on. The box's own ThemedView type, or 'none' for
  // rows that sit on the page with no box behind them.
  paper?: ThemeColor | 'screen' | 'none';
  // Held shut until true, for a box whose rows are not in yet.
  ready?: boolean;
  // How long after it is ready to start, in ms. For rows that should open as
  // the next rows of another box (see unfoldDelayAfter).
  delay?: number;
  // The box itself: its slot and its look. Padding, gap, a border, a width
  // or height cap. Not its background, which is `paper`.
  style?: StyleProp<ViewStyle>;
};

// How every box in the app opens: a sheet folded once per row, falling open
// from the edge it is held by, the way a map does when you hold one side.
//
// The rows ARE the panels. Each row in the box is wrapped in a Fold, and it
// is the row itself, text and controls and all, that swings down into place.
// Nothing is drawn twice, so a text field, a list or a captcha in a box is
// the same live one throughout. Under the rows the box's paper is cut into
// strips, one behind each row, that swing with it; that is what covers the
// box's padding and the gaps between rows while it opens.
//
// Rows side by side (two tag tiles, a line of report reasons) are one panel.
// Anything in the box that is NOT in a Fold shows at once, so every row
// should be in one.
//
// Transforms only, never layout. A box in the page takes its full space at
// once and unfolds inside it, because anything that grows the page frame by
// frame fights whatever measures it: a card's back sizes itself from a
// measurement in JS, and growing the comment thread inside one left the next
// card's byline drawn over it until that measurement caught up.
export function Unfold({
  children,
  from = 'top',
  paper = 'background',
  ready = true,
  delay = 0,
  style,
}: UnfoldProps) {
  const theme = useTheme();
  const boxRef = useRef<View>(null);
  const folds = useRef(new Map<string, RefObject<View | null>>());
  const isOpenRef = useRef(false);
  const isMeasureQueued = useRef(false);
  const hasStarted = useRef(false);
  const [layout, setLayout] = useState<UnfoldLayout | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const elapsed = useSharedValue(0);

  const measure = useCallback(() => {
    const box = boxRef.current;
    if (!box || isOpenRef.current) return;
    box.measure((_x, _y, width, height) => {
      // Not laid out yet. The box's own onLayout measures again once it is.
      if (!(width > 0 && height > 0)) return;
      const entries = [...folds.current.entries()];
      const rects: FoldRect[] = [];
      let pending = entries.length;
      const settle = () => {
        const next = layoutFor(rects, width, height, from);
        setLayout((previous) => (previous?.key === next.key ? previous : next));
      };
      if (pending === 0) {
        settle();
        return;
      }
      for (const [id, ref] of entries) {
        const done = () => {
          pending -= 1;
          if (pending === 0) settle();
        };
        const node = ref.current;
        if (!node) {
          done();
          continue;
        }
        // Relative to the box, and without transforms: a row measured while
        // it is halfway through its swing is still where it will land.
        node.measureLayout(
          box,
          (x, y, rowWidth, rowHeight) => {
            rects.push({ id, x, y, width: rowWidth, height: rowHeight });
            done();
          },
          done,
        );
      }
    });
  }, [from]);

  // A row that mounts on its own, after the box (a list filling in), joins
  // the fold rather than showing flat on no paper. Batched, so a list of
  // twenty measures once rather than twenty times.
  const register = useCallback(
    (id: string, ref: RefObject<View | null>) => {
      folds.current.set(id, ref);
      if (!isMeasureQueued.current) {
        isMeasureQueued.current = true;
        queueMicrotask(() => {
          isMeasureQueued.current = false;
          measure();
        });
      }
      return () => {
        folds.current.delete(id);
      };
    },
    [measure],
  );

  // Every render until open, not once: rows move when what is in the box
  // changes, and measureLayout answers on the spot, so this lands before the
  // frame it describes is drawn.
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    if (!layout || !ready || isOpen) return;
    const finish = () => {
      isOpenRef.current = true;
      setIsOpen(true);
    };
    if (layout.bands.length === 0) {
      finish();
      return;
    }
    // The delay is time before zero on the same clock, rather than a timer
    // of its own: the panels are already held shut at anything below zero.
    const startAt = hasStarted.current ? null : -delay;
    hasStarted.current = true;
    const total = layout.total;
    // On the UI thread, because the duration depends on where the clock has
    // got to and only the UI thread knows that. Read from JS straight after
    // setting it, the clock still said 0 (seen on the emulator), which ran a
    // delayed fold half as fast again as it should.
    scheduleOnUI(() => {
      'worklet';
      if (startAt != null) elapsed.value = startAt;
      // From wherever it has got to: when a row arrives partway through, the
      // fold carries on over the new rows rather than starting again.
      elapsed.value = withTiming(
        total,
        {
          duration: Math.max(0, total - elapsed.value),
          // Linear on purpose: every panel eases on its own (see foldAngle),
          // and easing the whole as well would bunch them into the first half.
          easing: Easing.linear,
          // Opens at once for anyone who has asked the system for less motion.
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          'worklet';
          if (finished) scheduleOnRN(finish);
        },
      );
    });
  }, [layout, ready, isOpen, delay, elapsed]);

  const folding = !isOpen;
  const hold = from;
  const flat = StyleSheet.flatten(style) ?? {};
  const border = { width: flat.borderWidth ?? 0, color: flat.borderColor };
  const printed = paper === 'none' ? null : paper;
  const paperColor = printed == null || printed === 'screen' ? undefined : theme[printed];

  const creases = (layer: 'paper' | 'shade') =>
    folding && layout && printed
      ? layout.bands.map((band, index) => (
          <Crease
            key={`${layer}-${index}`}
            layer={layer}
            index={index}
            band={band}
            layout={layout}
            elapsed={elapsed}
            hold={hold}
            paper={printed}
            paperColor={paperColor}
            border={border}
          />
        ))
      : null;

  return (
    <UnfoldContext.Provider value={{ register, layout, elapsed, hold }}>
      <View
        ref={boxRef}
        onLayout={folding ? () => measure() : undefined}
        style={[
          style,
          { backgroundColor: !folding && paperColor ? paperColor : 'transparent' },
          // The box's border is drawn on its paper strips while it opens, so
          // it folds too, and only becomes the box's own once flat.
          folding && border.width > 0 && styles.borderless,
        ]}>
        {paper === 'screen' && !folding && (
          <ThemedView type="screen" pointerEvents="none" style={StyleSheet.absoluteFill} />
        )}
        {creases('paper')}
        {children}
        {creases('shade')}
      </View>
    </UnfoldContext.Provider>
  );
}

type FoldProps = {
  children: ReactNode;
  // The row's slot, so a Fold can stand in for the View that held the row.
  // Its opacity is the fold's own while it opens.
  style?: StyleProp<ViewStyle>;
};

// One row of a box, and one panel of its fold. Outside an Unfold (a list
// shared with a screen, say) it is a plain View.
export function Fold({ children, style }: FoldProps) {
  const unfold = useContext(UnfoldContext);
  if (!unfold) return <View style={style}>{children}</View>;
  return (
    <FoldPanel unfold={unfold} style={style}>
      {children}
    </FoldPanel>
  );
}

function FoldPanel({
  unfold,
  style,
  children,
}: FoldProps & { unfold: UnfoldContextValue }) {
  const { register, layout, elapsed, hold } = unfold;
  const id = useId();
  const ref = useRef<View>(null);

  useLayoutEffect(() => register(id, ref), [register, id]);

  const placement = layout?.placements.get(id);
  const isMeasured = layout != null;
  const band = placement?.band ?? -1;
  const heights = layout?.heights;
  const stagger = layout?.stagger ?? 0;

  const foldStyle = useAnimatedStyle(() => {
    // Nothing shows before the box is measured: until then there is no
    // telling which panel this row is.
    if (!isMeasured) return { opacity: 0, transform: FLAT };
    // Arrived after the fold was laid out, or out of sight in a scroll view.
    if (band < 0 || !heights) return { opacity: 1, transform: FLAT };
    return panelStyle(elapsed.value, band, heights, stagger, hold);
  });

  return (
    <Animated.View
      ref={ref}
      style={[
        style,
        // The hinge is the panel's held edge, which is rarely the row's own:
        // the panel includes the gap around the row. Pivoting at the paper's
        // centre too keeps the row's perspective the same as its strip's.
        placement && { transformOrigin: originFor(placement.origin) },
        foldStyle,
      ]}>
      {children}
    </Animated.View>
  );
}

// One strip of the box's paper, or of the shading laid over it, swinging
// with the rows that sit on it.
function Crease({
  layer,
  index,
  band,
  layout,
  elapsed,
  hold,
  paper,
  paperColor,
  border,
}: {
  layer: 'paper' | 'shade';
  index: number;
  band: Band;
  layout: UnfoldLayout;
  elapsed: SharedValue<number>;
  hold: Hold;
  paper: ThemeColor | 'screen';
  paperColor: string | undefined;
  border: { width: number; color: ViewStyle['borderColor'] };
}) {
  const { heights, stagger } = layout;
  const turn = index % 2 === 0 ? -1 : 1;

  const creaseStyle = useAnimatedStyle(() => {
    const panel = panelStyle(elapsed.value, index, heights, stagger, hold);
    if (layer === 'paper') return panel;
    // A panel tipped away from the light darkens as it turns, the one facing
    // it catches the light, and both clear as they come flat. Light AND dark
    // rather than two depths of dark: the boxes are dark paper over a dimmed
    // page, and with only darkening the zigzag was barely there.
    const angle = foldAngle(elapsed.value, index, stagger);
    return {
      opacity: panel.opacity * Math.sin(toRadians(angle)) * (turn < 0 ? SHADE_AWAY : SHADE_TOWARD),
      transform: panel.transform,
    };
  });

  const isFirst = band.top <= 0;
  const isLast = band.top + band.height >= layout.height;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.crease,
        {
          // Absolute children are placed inside the box's border; these are
          // laid out across it, since they carry the border while it folds.
          left: -border.width,
          top: band.top - border.width,
          width: layout.width,
          height: band.height,
          transformOrigin: hold,
        },
        layer === 'shade' && (turn < 0 ? styles.shadeAway : styles.shadeToward),
        layer === 'paper' && paperColor && { backgroundColor: paperColor },
        layer === 'paper' && paper === 'screen' && styles.slice,
        layer === 'paper' &&
          border.width > 0 && {
            borderColor: border.color,
            borderLeftWidth: border.width,
            borderRightWidth: border.width,
            borderTopWidth: isFirst ? border.width : 0,
            borderBottomWidth: isLast ? border.width : 0,
          },
        creaseStyle,
      ]}>
      {/* The screen's paper is a gradient over the whole box, so each strip
          shows its own slice of it rather than a flat colour that would
          change as the box lands. */}
      {layer === 'paper' && paper === 'screen' && (
        <ThemedView
          type="screen"
          style={{ position: 'absolute', left: 0, top: -band.top, width: layout.width, height: layout.height }}
        />
      )}
    </Animated.View>
  );
}

type FoldRect = { id: string; x: number; y: number; width: number; height: number };

// Cuts the box into one panel per row, from where each row was measured.
//
// The panels tile the box exactly: each takes half the gap to either side of
// its rows, and the end panels take the box's own padding, so that once all
// are flat the paper is the box's whole background, seamlessly.
function layoutFor(rects: FoldRect[], width: number, height: number, hold: Hold): UnfoldLayout {
  // Only what is inside the box: a row scrolled out of sight has nothing to
  // show, and is left flat.
  const inside = rects
    .filter((rect) => rect.height > 0 && rect.y < height && rect.y + rect.height > 0)
    .sort((a, b) => a.y - b.y);

  const groups: { top: number; bottom: number; members: FoldRect[] }[] = [];
  for (const rect of inside) {
    const last = groups[groups.length - 1];
    if (last && rect.y < last.bottom - 0.5) {
      last.bottom = Math.max(last.bottom, rect.y + rect.height);
      last.members.push(rect);
    } else {
      groups.push({ top: rect.y, bottom: rect.y + rect.height, members: [rect] });
    }
  }

  const tiled = groups.map((group, index) => {
    const top = index === 0 ? 0 : (groups[index - 1].bottom + group.top) / 2;
    const bottom = index === groups.length - 1 ? height : (group.bottom + groups[index + 1].top) / 2;
    return {
      top: clamp(top, 0, height),
      bottom: clamp(bottom, 0, height),
      members: group.members,
    };
  });
  const ordered = hold === 'top' ? tiled : [...tiled].reverse();

  const placements = new Map<string, Placement>();
  ordered.forEach((band, index) => {
    const hinge = hold === 'top' ? band.top : band.bottom;
    for (const member of band.members) {
      placements.set(member.id, { band: index, origin: [width / 2 - member.x, hinge - member.y] });
    }
  });

  const count = ordered.length;
  const bands = ordered.map((band) => ({ top: band.top, height: band.bottom - band.top }));

  return {
    key: JSON.stringify([
      round(width),
      round(height),
      bands.map((band) => [round(band.top), round(band.height)]),
      [...placements].map(([id, placed]) => [id, placed.band, ...placed.origin.map(round)]),
    ]),
    width,
    height,
    bands,
    heights: bands.map((band) => band.height),
    placements,
    stagger: staggerFor(count),
    total: unfoldDuration(count),
  };
}

function staggerFor(count: number) {
  return count > 1 ? Math.min(PANEL_STAGGER, (UNFOLD_LONGEST - PANEL_TURN) / (count - 1)) : 0;
}

function unfoldDuration(count: number) {
  return count > 0 ? PANEL_TURN + staggerFor(count) * (count - 1) : 0;
}

// When rows outside a box should start, to open as that box's next rows: as
// its last row comes all but flat (halfway through its turn, which the ease
// has carried most of the way). They cannot hang from that row the way a row
// inside the box does, so they wait for it rather than swinging in below a
// box that is still folded. See CommentsThread's write field.
export function unfoldDelayAfter(rows: number) {
  return Math.max(0, unfoldDuration(rows) - PANEL_TURN / 2);
}

// Native takes the origin as numbers (its string form has no negatives or
// fractions, and these are both); the web takes CSS.
function originFor([x, y]: [number, number]): ViewStyle['transformOrigin'] {
  return Platform.OS === 'web' ? `${x}px ${y}px` : [x, y, 0];
}

// How far a panel is still folded, in degrees: 90 is edge-on, 0 is flat.
// Each panel starts a stagger after the one before it and eases out on its
// own, so the fold opens one crease at a time from the held edge outward.
//
// Above panelStyle, which calls it, for the same reason the constants are at
// the top: a worklet takes what it calls when it is defined.
function foldAngle(elapsed: number, index: number, stagger: number) {
  'worklet';
  const t = Math.min(1, Math.max(0, (elapsed - index * stagger) / PANEL_TURN));
  return 90 * Math.pow(1 - t, 3);
}

function toRadians(degrees: number) {
  'worklet';
  return (degrees * Math.PI) / 180;
}

// Where a panel is at a moment of the unfold.
//
// Each panel is turned about its held edge, then carried to wherever the
// panels before it have reached, so they stay joined end to end however far
// each has opened. Alternate panels turn opposite ways, which is what makes
// it a zigzag fold rather than a stack of flaps.
function panelStyle(elapsed: number, index: number, heights: number[], stagger: number, hold: Hold) {
  'worklet';
  let lift = 0;
  for (let before = 0; before < index; before++) {
    lift += heights[before] * (1 - Math.cos(toRadians(foldAngle(elapsed, before, stagger))));
  }
  const angle = foldAngle(elapsed, index, stagger);
  const turn = index % 2 === 0 ? -1 : 1;
  return {
    // Edge-on is drawn as nothing rather than trusted to come out as a line:
    // Android rebuilds the transform from a matrix, and at exactly 90 degrees
    // that matrix has no height left to rebuild it from.
    opacity: angle > 89.5 ? 0 : 1,
    transform: [
      // Deeper for a tall panel, which would otherwise swell towards the eye
      // as it swings: a photo crop's frame is a third of the screen.
      { perspective: Math.max(PERSPECTIVE, heights[index] * 3) },
      { translateY: (hold === 'top' ? -1 : 1) * lift },
      { rotateX: `${turn * angle}deg` },
    ],
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value * 2) / 2;
}

const styles = StyleSheet.create({
  borderless: {
    borderColor: 'transparent',
  },
  crease: {
    position: 'absolute',
  },
  slice: {
    overflow: 'hidden',
  },
  shadeAway: {
    backgroundColor: '#000',
  },
  shadeToward: {
    backgroundColor: '#fff',
  },
});
