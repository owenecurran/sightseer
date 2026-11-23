import { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from 'react-native';

import { chooseCalloutSide, type CalloutSide } from '@/components/ui/sticker-callout';
import { TagStickerGraphic, stickerBody, stickerBox, stickerFootprint } from '@/components/ui/tag-sticker-graphic';
import {
  arrangeStickers,
  GAP,
  stickerRoomFor,
  type Rect,
  type StickerSpot,
  type Wall,
} from '@/lib/sticker-scatter';

// The tag stickers on a postcard, on both faces. The back sets them out as a
// group beside the writing; the front puts the same stickers, smaller, in a
// row along the bare card under the picture. Same drawings, colours, die-cut
// and lean on both faces: the same placementSeed (the review's id) decides
// all of them.

type Tag = { slug: string; label: string };

// Clear card kept round the writing and round the postmark column, so a
// sticker's cut edge never touches either.
const WRITING_CLEARANCE = 6;
const COLUMN_CLEARANCE = 4;
// Clear card kept either side of the line between the message and the
// address. A sticker used to be allowed over it, and one came to rest with
// its edge just touching the line, which looked like a mistake rather than a
// sticker stuck across it. Now a group sits wholly on one side: beside the
// writing, or down the address side under the postmark.
const DIVIDER_CLEARANCE = 4;
// How far inside the panel's own edge a tapped sticker's name label has to
// stay. The panel clips what crosses its edge.
const CALLOUT_MARGIN = 4;

// The front's stickers, as large as fit their band but never above this.
const FRONT_MAX_SIZE = 44;
// Nor below this. Smaller, and the words on the labels and stamps are too
// small to read; the stickers are all on the back regardless.
const FRONT_MIN_SIZE = 28;

export type FrontStickerRow = {
  size: number;
  // Each sticker's box, from the band's top-left.
  spots: { left: number; top: number }[];
};

// Where the front's stickers go in a band `width` by `height` points, keeping
// `clearance.above` of bare card between them and the picture and
// `clearance.below` between them and the band's foot, or null when they
// cannot be shown at a size worth showing. One row from the left, spaced as
// on the back: the same gap between die-cut edges, whatever shape each
// sticker is and however it leans, and each one's middle (its box's middle,
// see Footprint) on one line, set midway between the two clearances. `seed`
// is the review's id, which decides each sticker's lean.
export function frontStickerRow(
  tags: Tag[],
  width: number,
  height: number,
  clearance: { above: number; below: number },
  seed: string,
): FrontStickerRow | null {
  if (tags.length === 0) return null;
  for (let size = FRONT_MAX_SIZE; size >= FRONT_MIN_SIZE; size--) {
    const box = stickerBox(size);
    const feet = tags.map((tag) => stickerFootprint(tag.slug, tag.label, size, seed));
    // How far the row reaches above and below the line its middles are on.
    const up = Math.max(...feet.map((foot) => foot.height / 2 - foot.dy));
    const down = Math.max(...feet.map((foot) => foot.height / 2 + foot.dy));
    const across = feet.reduce((sum, foot) => sum + foot.width, 0) + GAP * (feet.length - 1);
    const spare = height - clearance.above - clearance.below - up - down;
    if (spare < 0 || across > width) continue;
    const line = clearance.above + up + spare / 2;
    let x = 0;
    const spots = feet.map((foot) => {
      // The box goes wherever puts the sticker's visible left edge at x.
      const left = x + foot.width / 2 - foot.dx - box / 2;
      x += foot.width + GAP;
      return { left, top: line - box / 2 };
    });
    return { size, spots };
  }
  return null;
}

// The front's stickers, placed by frontStickerRow, inside its band. Not
// pressable: the front of the card turns over when its border is pressed,
// and these sit on that border.
export function FrontStickers({ tags, row, seed }: { tags: Tag[]; row: FrontStickerRow; seed: string }) {
  return (
    <>
      {tags.map((tag, i) => {
        const spot = row.spots[i];
        if (spot == null) return null;
        return (
          <TagStickerGraphic
            key={tag.slug}
            slug={tag.slug}
            label={tag.label}
            placementSeed={seed}
            size={row.size}
            interactive={false}
            style={[styles.placed, { left: spot.left, top: spot.top }]}
          />
        );
      })}
    </>
  );
}

function rectOf(e: LayoutChangeEvent): Rect {
  const { x, y, width, height } = e.nativeEvent.layout;
  return { x, y, width, height };
}

function sameRect(a: Rect | null, b: Rect): boolean {
  return a != null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// Keeps the old state when a layout event repeats itself, so a repeat does
// not re-render and re-scatter for nothing.
function keepIfSame(next: Rect) {
  return (was: Rect | null) => (sameRect(was, next) ? was : next);
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + by * 2, height: rect.height + by * 2 };
}

// The tag stickers on the written side of a postcard, set out as a small
// group in bare card beside the writing. See sticker-scatter.ts.
//
// The caller lays out the area (the row holding the message and the address
// column) and reports four things measured in it: the area itself, the
// block of writing, the address column, and the line between them. All
// positions have to be relative to the area. The writing's lines, from its onTextLayout, are
// better than its block: a sticker can then sit beside a short last line
// instead of only under the lot. The area takes `room` as its minHeight,
// which is the height the stickers need beside what is already written. The
// stickers then go in `<BackStickerLayer>`, drawn last inside the area.
//
// The panel the area sits in (the written side, which clips) reports its size
// through `onPanelLayout`, so that each sticker's name, when tapped, can be put
// on a side where it fits inside the panel rather than running off it.
export function useBackStickers(tags: Tag[], seed: string, floor: number) {
  const [area, setArea] = useState<Rect | null>(null);
  const [panel, setPanel] = useState<{ width: number; height: number } | null>(null);
  const [writing, setWriting] = useState<Rect | null>(null);
  const [column, setColumn] = useState<Rect | null>(null);
  const [divider, setDivider] = useState<Rect | null>(null);
  // Each line of the writing, relative to the writing's own box.
  const [lines, setLines] = useState<Rect[] | null>(null);
  const box = stickerBox();
  const count = tags.length;
  // Keyed on the tags' text rather than the array, which the caller may
  // rebuild on every render.
  const tagKey = tags.map((tag) => `${tag.slug}:${tag.label}`).join('|');
  // Each sticker as this card has it stuck on, leaning its own way: what the
  // layout spaces them by, and what each one's arrow points at.
  const feet = useMemo(
    () => tags.map((tag) => stickerFootprint(tag.slug, tag.label, undefined, seed)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tagKey, seed],
  );
  const bodies = useMemo(
    () => tags.map((tag) => stickerBody(tag.slug, tag.label, undefined, seed)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tagKey, seed],
  );

  // Its place in the panel as well as its size: the name labels are fitted to
  // the panel, and the area's own coordinates are what they are placed in.
  const onAreaLayout = useCallback((e: LayoutChangeEvent) => setArea(keepIfSame(rectOf(e))), []);
  const onPanelLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setPanel((was) => (was?.width === width && was.height === height ? was : { width, height }));
  }, []);
  const onWritingLayout = useCallback((e: LayoutChangeEvent) => setWriting(keepIfSame(rectOf(e))), []);
  const onColumnLayout = useCallback((e: LayoutChangeEvent) => setColumn(keepIfSame(rectOf(e))), []);
  const onDividerLayout = useCallback((e: LayoutChangeEvent) => setDivider(keepIfSame(rectOf(e))), []);
  const onWritingTextLayout = useCallback((e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const next = e.nativeEvent.lines
      .filter((line) => line.width > 0)
      .map(({ x, y, width, height }) => ({ x, y, width, height }));
    setLines((was) =>
      was != null && was.length === next.length && was.every((line, i) => sameRect(line, next[i]))
        ? was
        : next,
    );
  }, []);

  // Each written line, in the area's coordinates.
  const writtenLines = useMemo(() => {
    if (writing == null) return null;
    return lines && lines.length > 0
      ? lines.map((line) => ({ ...line, x: writing.x + line.x, y: writing.y + line.y }))
      : [writing];
  }, [writing, lines]);

  const obstacles = useMemo(() => {
    if (writtenLines == null || column == null) return null;
    return [...writtenLines.map((line) => grow(line, WRITING_CLEARANCE)), grow(column, COLUMN_CLEARANCE)];
  }, [writtenLines, column]);

  // Only its left and right matter: it runs the area's whole height.
  const walls = useMemo<Wall[] | null>(
    () =>
      divider == null
        ? null
        : [{ x: divider.x - DIVIDER_CLEARANCE, width: divider.width + DIVIDER_CLEARANCE * 2 }],
    [divider],
  );

  // From the width, the obstacles and the walls only, never the area's own
  // height, so feeding it back as the area's minHeight cannot loop.
  const width = area?.width ?? 0;
  const room = useMemo(
    () => (obstacles && walls && width > 0 ? stickerRoomFor(feet, width, obstacles, walls, floor) : floor),
    [obstacles, walls, width, feet, floor],
  );

  const height = area?.height ?? 0;
  const spots = useMemo(
    () =>
      obstacles && walls && width > 0 && height > 0 && count > 0
        ? arrangeStickers(feet, box, width, height, obstacles, walls, seed)
        : null,
    [obstacles, walls, width, height, count, feet, box, seed],
  );

  // Which side of each sticker its name goes on when tapped: wherever it fits
  // inside the panel, in the area's coordinates, and, where it can, without
  // covering the writing, the stamp and postmark, or another sticker. Before
  // the panel has reported, the area itself is the limit.
  const sides = useMemo(() => {
    if (spots == null || area == null) return null;
    const limits = panel
      ? {
          x: -area.x + CALLOUT_MARGIN,
          y: -area.y + CALLOUT_MARGIN,
          width: panel.width - CALLOUT_MARGIN * 2,
          height: panel.height - CALLOUT_MARGIN * 2,
        }
      : { x: 0, y: 0, width: area.width, height: area.height };
    const stickerRects = spots.map((spot, i) => ({
      x: spot.left + box / 2 + feet[i].dx - feet[i].width / 2,
      y: spot.top + box / 2 + feet[i].dy - feet[i].height / 2,
      width: feet[i].width,
      height: feet[i].height,
    }));
    // The panel above and below this area: the place's name over it, the
    // like and comment buttons and the map under it.
    const header = { x: limits.x, y: limits.y, width: limits.width, height: Math.max(0, -limits.y) };
    const footer = {
      x: limits.x,
      y: area.height,
      width: limits.width,
      height: Math.max(0, limits.y + limits.height - area.height),
    };
    const printed = [...(writtenLines ?? []), ...(column ? [column] : []), header, footer];
    return spots.map((spot, i) =>
      chooseCalloutSide(
        { left: spot.left, top: spot.top, box, target: bodies[i] },
        tags[i]?.label ?? '',
        limits,
        [...printed, ...stickerRects.filter((_, j) => j !== i)],
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, area, panel, box, tagKey, feet, bodies, writtenLines, column]);

  return {
    room,
    spots,
    sides,
    onAreaLayout,
    onPanelLayout,
    onWritingLayout,
    onWritingTextLayout,
    onColumnLayout,
    onDividerLayout,
  };
}

type BackStickerLayerProps = {
  tags: Tag[];
  spots: StickerSpot[] | null;
  // Which side each sticker's name goes on (see useBackStickers).
  sides: CalloutSide[] | null;
  seed: string;
};

// Over the whole area and catching nothing itself, so only the stickers take
// a tap. One sticker's name shows at a time: tapping another closes the first.
export function BackStickerLayer({ tags, spots, sides, seed }: BackStickerLayerProps) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  if (spots == null) return null;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {tags.map((tag, i) => {
        const spot = spots[i];
        if (spot == null) return null;
        return (
          <TagStickerGraphic
            key={tag.slug}
            slug={tag.slug}
            label={tag.label}
            placementSeed={seed}
            calloutSide={sides?.[i]}
            revealed={openSlug === tag.slug}
            onRevealChange={setOpenSlug}
            style={[styles.placed, { left: spot.left, top: spot.top }]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  placed: {
    position: 'absolute',
  },
});
