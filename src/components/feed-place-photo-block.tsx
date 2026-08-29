import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import {
  FeedRatingStamp,
  getStampSide,
  getStampTextReserve,
  STAMP_EFFECTIVE_HEIGHT,
} from "@/components/ui/feed-rating-stamp";
import { StretchText } from "@/components/ui/stretch-text";
import { TagSticker } from "@/components/ui/tag-sticker";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

// How much of the location line the stamp's top edge is allowed to cover,
// at most — per direct feedback, effectively "basically none."
const LOCATION_OVERLAP_ALLOWANCE = 30;

export type FeedTaggedPlace = { name: string; category: string | null };

// Blue for water, brown for trails, red for food & drink — everything else
// (and unclassified places) stays the default secondary text color. Shared
// so review-form.tsx's preview colors tagged spots identically to the real
// feed card, not just approximately.
const CATEGORY_COLORS: Record<string, string> = {
  water: "#1E88E5",
  trail: "#8B5E3C",
  food_drink: "#D32F2F",
};

function categoryColor(category: string | null, defaultColor: string): string {
  return (category && CATEGORY_COLORS[category]) || defaultColor;
}

export type FeedCardHeaderTextProps = {
  placeName: string;
  // The visit's own place — lets the state/country line navigate to that
  // place's own page (a different destination than the visit page this
  // whole header is otherwise wrapped in, at the call sites that do that;
  // see the nested Pressable below for how the two coexist without one
  // swallowing the other's tap).
  placeId?: string;
  stateCountry?: string | null;
  taggedPlaces?: FeedTaggedPlace[];
  visitedLine?: string | null;
  rating: number | null;
  // FeedRatingStamp's own props — see that file. Required whenever `rating`
  // is non-null; this component is the stamp's one positioning root (see
  // `wrap` below), not each individual caller anymore, so every caller that
  // wants a stamp goes through these two instead of rendering
  // FeedRatingStamp itself.
  stampSeed?: string;
  stampCanSeep?: boolean;
  // An absolute ceiling (px) on how far the stamp may rise from this
  // block's bottom edge, applied on top of whatever the location line
  // itself allows — see maxStampBottomOffset below. Per-caller because the
  // same range doesn't read the same on every screen: tagged-in.tsx passes
  // one after its stamps read as sitting too high. Undefined leaves the
  // location line as the only ceiling, which is the feed's own look.
  maxStampRise?: number;
  // The review's descriptive tags, at most 3 (see MAX_VISIT_TAGS). Rendered
  // as stickers under the review line.
  tags?: { slug: string; label: string }[];
  // Stable per review, so a tag's tilt varies between reviews but holds
  // still across re-renders and re-scrolls.
  tagSeed?: string;
};

// The place-name/rating text portion of a feed visit card's header — pulled
// out of (tabs)/index.tsx's VisitCard specifically so review-form.tsx's
// "Preview" section renders the *same* code, not a hand-copied lookalike
// that silently drifts the next time the real feed card's header changes.
// Photo rendering itself stays out of this component and is up to each
// caller (PhotoGrid is already the shared, single source of truth for that
// part) — the feed bleeds photos full-width past its own card edges, which
// makes no sense for a preview living inside its own bordered section, so
// the two contexts need different wrapping around the same PhotoGrid call.
export function FeedCardHeaderText({
  placeName,
  placeId,
  stateCountry,
  taggedPlaces = [],
  visitedLine,
  rating,
  stampSeed,
  stampCanSeep = false,
  maxStampRise,
  tags = [],
  tagSeed,
}: FeedCardHeaderTextProps) {
  const theme = useTheme();
  // The stamp anchors to *this* block's own bottom-right corner (see
  // FeedRatingStamp), not the outer card's — reserving space on the text
  // most likely to actually share that corner (the last couple of lines
  // this component renders) is what approximates "wraps around it"; see
  // getStampTextReserve's own comment for why it's an approximation and
  // not true per-line reflow. Computed per-post (not a flat worst-case
  // constant) so text runs right up to where *this* post's own stamp
  // actually starts, not stopping short by the same amount regardless of
  // where the random draw landed.
  const stampTextReserve =
    rating != null && stampSeed != null ? getStampTextReserve(stampSeed) : 0;
  // Which side of the block this post's stamp lands on — per direct
  // feedback, stamps shouldn't be stuck on the right forever, but text that
  // shares a corner with a left-anchored stamp has to mirror it (right-align,
  // reserve space on the left instead) or it'd run straight under the stamp.
  // Defaults 'right' when there's no stamp at all, matching every line's
  // plain untouched look in that case.
  const stampSide = rating != null && stampSeed != null ? getStampSide(stampSeed) : "right";
  const stampAlignStyle = stampSide === "left" ? styles.rightAlign : null;
  const stampReserveStyle =
    stampTextReserve > 0
      ? stampSide === "left"
        ? { paddingLeft: stampTextReserve }
        : { paddingRight: stampTextReserve }
      : null;

  // Measured (not assumed) so the stamp's ceiling — see maxBottomOffset
  // below — reflects this specific post's real layout: how tall this
  // whole block ends up, and exactly where the location line's own bottom
  // edge lands within it, both of which vary with content (a long place
  // name wrapping, tagged spots present or not, etc).
  const [wrapHeight, setWrapHeight] = useState(0);
  const [locationBottom, setLocationBottom] = useState<number | null>(null);

  // Undefined (no ceiling) until measured, or when there's no location
  // line to protect in the first place — FeedRatingStamp falls back to its
  // own default range either way. Once both measurements land, this caps
  // how far the stamp may rise so its top edge — worst-case rotation
  // included (STAMP_EFFECTIVE_HEIGHT) — covers at most
  // LOCATION_OVERLAP_ALLOWANCE px of the location text.
  const locationCeiling =
    stateCountry && wrapHeight > 0 && locationBottom != null
      ? wrapHeight -
        locationBottom +
        LOCATION_OVERLAP_ALLOWANCE -
        STAMP_EFFECTIVE_HEIGHT
      : undefined;

  // The caller's own absolute cap wins wherever it's tighter — and, unlike
  // locationCeiling above, applies even when there's no location line at
  // all. That gap is exactly why an earlier attempt at this knob (which
  // only adjusted the allowance feeding locationCeiling) did nothing on
  // posts without a location: the whole expression went undefined and
  // FeedRatingStamp silently fell back to its own internal, uncontrollable
  // rise range.
  const maxStampBottomOffset =
    locationCeiling != null && maxStampRise != null
      ? Math.min(locationCeiling, maxStampRise)
      : (locationCeiling ?? maxStampRise);

  return (
    <View
      style={styles.wrap}
      onLayout={(e: LayoutChangeEvent) =>
        setWrapHeight(e.nativeEvent.layout.height)
      }
    >
      {/* Never cut here, however long the name. This one component renders
          the title for every full review card in the app — the feed, a trip's
          days, a board's reviews, the review form's preview — and the review
          screen you land on from any of them, and those are the places where
          the whole name is the point. An ellipsis left no way to find out
          what "Greene Valley Scenic…" actually was. The compact tiles that
          only reference a review (teaser cards, collection rows) still cut,
          which is what StretchText's default is for. */}
      {/* The name goes to the place, same as the location line under it.
          Tapping the name of somewhere is the obvious way to ask about
          that somewhere, and it previously did one of two wrong things:
          nothing at all, or — inside a feed card, where this whole header
          sits in a Pressable to the review — it opened the review you were
          already looking at. Nested Pressables resolve inner-first, which
          is what lets this take the tap while the rest of the header still
          opens the review. */}
      <Pressable
        disabled={!placeId}
        onPress={() =>
          placeId && router.push({ pathname: "/place/[id]", params: { id: placeId } })
        }
      >
        <StretchText type="headline" fill truncateLongText={false}>
          {placeName || " "}
        </StretchText>
      </Pressable>
      {stateCountry && (
        <Pressable
          disabled={!placeId}
          onPress={() =>
            placeId &&
            router.push({ pathname: "/place/[id]", params: { id: placeId } })
          }
          onLayout={(e: LayoutChangeEvent) =>
            setLocationBottom(
              e.nativeEvent.layout.y + e.nativeEvent.layout.height,
            )
          }
          hitSlop={4}
        >
          <ThemedText type="roundedStat" themeColor="textSecondary" style={stampAlignStyle}>
            {stateCountry}
          </ThemedText>
        </Pressable>
      )}
      {taggedPlaces.length > 0 && (
        <ThemedText type="small" style={[stampAlignStyle, stampReserveStyle]}>
          {taggedPlaces.map((place, index) => (
            <ThemedText
              key={place.name}
              type="small"
              style={{
                color: categoryColor(place.category, theme.textSecondary),
              }}
            >
              {index > 0 ? " · " : ""}
              {place.name}
            </ThemedText>
          ))}
        </ThemedText>
      )}
      {visitedLine && (
        // Full-brightness "text" (matching the location line's own color),
        // not the dimmer "textSecondary" this used before — per direct
        // feedback, the review itself should draw the eye, not read as a
        // muted afterthought under the location line.
        <ThemedText type="small" themeColor="text" style={[stampAlignStyle, stampReserveStyle]}>
          {visitedLine}
        </ThemedText>
      )}
      {/* Under the review line, sharing the stamp's reserved space so a row
          of stickers can't run underneath the stamp leaning off the corner.
          Wraps, since three of the longer labels don't fit one phone line. */}
      {tags.length > 0 && (
        <View style={[styles.tagRow, stampReserveStyle]}>
          {tags.map((tag) => (
            <TagSticker
              key={tag.slug}
              slug={tag.slug}
              label={tag.label}
              placementSeed={tagSeed}
            />
          ))}
        </View>
      )}
      {rating != null && stampSeed != null && (
        <FeedRatingStamp
          rating={rating}
          seed={stampSeed}
          canSeep={stampCanSeep}
          maxBottomOffset={maxStampBottomOffset}
          side={stampSide}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  // zIndex here (not just on the stamp itself) matters whenever this block
  // sits as a *direct* sibling of a photo it might seep into (review-form's
  // preview: FeedCardHeaderText and PhotoGrid both direct children of the
  // same previewCard) — zIndex only resolves stacking among elements
  // sharing one immediate parent, so the stamp's own zIndex (scoped to
  // *this* block's children) can't by itself win against a sibling of this
  // whole block. (tabs)/index.tsx's real feed nests this block one level
  // deeper inside cardTop, which needs the equivalent fix on cardTop
  // itself instead — see that file.
  wrap: {
    position: "relative",
    zIndex: 2,
    gap: 4,
  },
  // Mirrors the location/tagged-places/note lines to the right when the
  // stamp lands on the left instead (see stampSide) — plain left-aligned
  // text would otherwise run straight under a left-anchored stamp.
  rightAlign: {
    textAlign: "right",
  },
});
