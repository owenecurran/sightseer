import { type ImageLoadEventData } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  type LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { FeedRatingStamp, getStampMaxReach } from "@/components/ui/feed-rating-stamp";
import { LoadableImage } from "@/components/ui/loadable-image";
import { StretchText } from "@/components/ui/stretch-text";
import { CARD_RADIUS } from "@/components/ui/teaser-card";
import { BrandColors, Spacing } from "@/constants/theme";

type ReviewPromptCardProps = {
  label: string;
  visitId: string;
  placeName: string;
  rating: number | null;
  note: string | null;
  photoUrl?: string;
  // Set by the prompt editor's live preview, which renders this exact
  // component against in-progress (possibly unsaved) attachment data — a
  // preview should never actually navigate to /visit/[id] on tap.
  disabled?: boolean;
};

// Small, even sage border around the photo, matching the card's own
// background — see `photoWrap`/`photo` styles below.
const PHOTO_BORDER = Spacing.two;
// Interim shape while the real photo is still loading (see `photoWrap`'s
// `aspectRatio` below) — arbitrary but close to a typical photo, just to
// avoid an extreme flash of shape before the real one is known.
const DEFAULT_PHOTO_ASPECT_RATIO = 1;
// The place-name overlay runs a little wider than the photo on its right
// side only ("seep over the image", earlier feedback) — nothing clips it
// (see `photoWrap`/`cardBackground` below). The left side deliberately
// doesn't get the same overshoot (direct follow-up feedback: it read as
// "too far off the left side" — the text should start flush with the box,
// not past its edge).
const OVERLAY_OVERSHOOT = Spacing.two;
// Approximates the *natural* (unset) line height at the note's 16px base
// size — used only to translate a pixel height budget into a numberOfLines
// count for adjustsFontSizeToFit below (see noteMaxLines). Deliberately not
// themed-text.tsx's own fixed 24 anymore: a fixed lineHeight doesn't shrink
// along with adjustsFontSizeToFit's own fontSize reduction (a real RN
// limitation, confirmed live — shrunk text kept its full-size 24px line
// gaps, reading as way too loose relative to the now-smaller glyphs), so
// the note text below no longer sets an explicit lineHeight at all and
// instead relies on the platform's own per-fontSize default, which scales
// with fontSize the way a fixed pixel value can't.
const NOTE_LINE_HEIGHT = 20;

// Text and the rating badge both scale with the card's actual size instead
// of using fixed constants, clamped to sane bounds so a tiny card doesn't
// get illegibly small text and a huge one doesn't get a comically large
// badge.
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// The rich sage-card treatment shared by every review-type prompt answer
// (originally built just for a fixed "Favorite trip review" section before
// that became a regular selectable prompt like any other).
//
// The photo box's aspect ratio comes from the actual loaded image
// (`LoadableImage`'s `onLoad` reports the real decoded pixel dimensions —
// see `handlePhotoLoad` below), not a hardcoded constant and not a photo's
// stored `width`/`height` row. Both alternatives were tried and both broke:
// a hardcoded 1:1 square (on the assumption every upload is cropped square
// at the source) turned out wrong for real existing photos that predate or
// bypass that crop step; trusting stored width/height was *also* wrong for
// a real row that had stale/incorrect metadata. Either mismatch between the
// box's assumed shape and the image's real shape means `contentFit="contain"`
// letterboxes the image unevenly inside the box — the actual root cause of
// both the earlier "text isn't at the bottom of the image" bug and an uneven
// border around the photo. Measuring the real loaded image directly can't
// drift out of sync with itself the way either derived-elsewhere value can.
//
// The card's own layout depends on the photo's actual shape: a
// portrait/square photo keeps the original side-by-side row (photo left,
// rating+note right, the card's own height pinned to the photo's so a long
// note shrinks to fit instead of growing the row past the image — see
// noteMaxLines below); a landscape photo (wider than tall) switches to a
// stacked layout instead — full-width image on top, rating+note below it —
// since a wide photo squeezed into ~65% of the card's width would render
// small and the leftover info column would end up cramped and narrow.
// Stacked mode has no competing height to fit into, so the note there is
// plain, unshrunk, unlimited-line text.
//
// Clipping is scoped much more narrowly than a single outer `overflow:
// hidden` would allow: only `cardBackground` (the sage fill, rounded) and
// `photoClip` (just the photo itself) clip anything. `photoWrap` and `card`
// don't, so the place-name overlay — despite living inside `photoWrap` — is
// free to visually run past the photo's own edges and past the card's
// rounded corner without being cut off.
export function ReviewPromptCard({
  label,
  visitId,
  placeName,
  rating,
  note,
  photoUrl,
  disabled,
}: ReviewPromptCardProps) {
  const [photoBox, setPhotoBox] = useState({ width: 0, height: 0 });
  const [photoAspectRatio, setPhotoAspectRatio] = useState(DEFAULT_PHOTO_ASPECT_RATIO);
  const isHorizontal = photoAspectRatio > 1;
  // Same scaling the stamp used as an inline badge — now sizes the
  // floating corner stamp instead (see the FeedRatingStamp call below), so
  // it still tracks the photo's own size instead of a fixed constant.
  const badgeSize = clamp(photoBox.height * 0.3, 48, 88);
  // adjustsFontSizeToFit shrinks to fit *this many lines*, not a pixel
  // height directly — derived from the actual space left in `info` once
  // padding is accounted for, so a short/tall photo gets a correspondingly
  // generous/tight line budget instead of one fixed number that's
  // sometimes way more room than the box actually has (silently never
  // shrinking, confirmed live: an 8-line cap let a long note overflow
  // straight through the card's own fixed height and into whatever
  // rendered below it) and sometimes way less. Only meaningful in row mode
  // — stacked mode's note isn't fitted into anything. No longer budgets for
  // the rating badge's own footprint — that's a floating corner stamp now
  // (see below), not a flow child sharing this column with the note.
  const availableNoteHeight = photoBox.height - Spacing.three * 2;
  const noteMaxLines = clamp(Math.floor(availableNoteHeight / NOTE_LINE_HEIGHT), 1, 12);

  function handlePhotoLoad(event: ImageLoadEventData) {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setPhotoAspectRatio(width / height);
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <Pressable
        disabled={disabled}
        onPress={() =>
          router.push({ pathname: "/visit/[id]", params: { id: visitId } })
        }
        style={[
          isHorizontal ? styles.cardStacked : styles.cardRow,
          !isHorizontal && photoBox.height > 0 ? { height: photoBox.height } : null,
        ]}
      >
        <View style={styles.cardBackground} />
        <View
          style={[
            isHorizontal ? styles.photoWrapFull : styles.photoWrapPartial,
            { aspectRatio: photoAspectRatio },
          ]}
          onLayout={(e: LayoutChangeEvent) =>
            setPhotoBox({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          <View style={styles.photoClip}>
            <LoadableImage
              source={photoUrl ? { uri: photoUrl } : undefined}
              style={styles.photo}
              contentFit="contain"
              onLoad={handlePhotoLoad}
            />
          </View>
          {/* Positioned against `photoWrap`'s own outer edge (not the
              padded/bordered inner area the image sits in — see `photo`
              above), and a little wider still (`OVERLAY_OVERSHOOT`) so it
              always reads flush with — and slightly past — the photo's
              true edges. Nothing here clips it (see the comment above the
              component). */}
          <View style={styles.placeOverlay}>
            <StretchText type="headline" outline>
              {placeName}
            </StretchText>
          </View>
        </View>
        <View style={[styles.info, isHorizontal ? styles.infoStacked : null]}>
          {note &&
            (isHorizontal ? (
              <ThemedText type="default" themeColor="background">
                {note}
              </ThemedText>
            ) : (
              <ThemedText
                type="default"
                themeColor="background"
                // Overrides `default`'s own fixed lineHeight:24 back to
                // unset — see NOTE_LINE_HEIGHT's comment for why a fixed
                // pixel value can't track adjustsFontSizeToFit's own
                // shrinking.
                style={styles.noteText}
                numberOfLines={noteMaxLines}
                adjustsFontSizeToFit
                minimumFontScale={0.4}
              >
                {note}
              </ThemedText>
            ))}
        </View>
        {rating != null && (
          <FeedRatingStamp rating={rating} seed={visitId} canSeep={false} size={badgeSize} corner="top-right" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  // position:'relative' on both — FeedRatingStamp positions itself
  // absolutely against this Pressable directly (top-right corner of the
  // whole card, not just the photo or info column), and neither this nor
  // any ancestor here clips overflow (see the component's own comment), so
  // the stamp is free to sit slightly past the card's true edge.
  cardRow: {
    position: "relative",
    flexDirection: "row",
  },
  cardStacked: {
    position: "relative",
    flexDirection: "column",
  },
  // Separate from `card` itself (see the component's own comment) so this
  // is the only thing clipped to the card's rounded shape — the place-name
  // overlay, a sibling deeper in the tree, is unaffected by it.
  cardBackground: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BrandColors.sage,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
  },
  // Inflated from an original 55% — direct feedback wanted a bigger photo.
  // Only used in row mode; stacked mode's photo runs the card's full width
  // instead (see photoWrapFull).
  photoWrapPartial: {
    width: "65%",
  },
  photoWrapFull: {
    width: "100%",
  },
  // Clips just the image itself — was previously `photoWrap`'s own
  // overflow, which also (unintentionally) clipped the place-name overlay
  // sharing that parent.
  photoClip: {
    ...StyleSheet.absoluteFill,
    overflow: "hidden",
  },
  // Inset by PHOTO_BORDER on every side instead of `StyleSheet.absoluteFill`
  // — leaves an even sliver of the card's own sage background showing as a
  // border around the image. A small rounded corner on the image itself
  // keeps that border reading as a deliberate frame instead of a stray gap
  // next to the card's own (larger) outer rounding.
  photo: {
    position: "absolute",
    top: PHOTO_BORDER,
    left: PHOTO_BORDER,
    right: PHOTO_BORDER,
    bottom: PHOTO_BORDER,
    borderRadius: Spacing.one,
  },
  // Absolutely positioned against `photoWrap`'s outer edge (not a normal
  // flow child) specifically so it ignores `photoWrap`'s padding-less border
  // inset above and always spans the card's true bottom/right edges — see
  // the comment at its call site for why. Left starts flush at 0 (not
  // overshot — see OVERLAY_OVERSHOOT's own comment); right still overshoots
  // past that edge for the "seep over the image" effect. 25% of the photo's
  // height, not the full third it used to be, per direct feedback — less
  // vertical band for `outline` mode's fill-the-band math to stretch into,
  // so the rendered title reads shorter/smaller without any other change.
  placeOverlay: {
    position: "absolute",
    left: 0,
    right: -OVERLAY_OVERSHOOT,
    bottom: 0,
    height: "25%",
    justifyContent: "flex-end",
    paddingRight: Spacing.one,
    paddingTop: Spacing.two,
  },
  info: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    justifyContent: "center",
    // Safety net, not the primary mechanism (that's noteMaxLines above) —
    // catches the case where minimumFontScale's own floor is reached before
    // the text actually fits (an extreme note), so it clips cleanly at the
    // card's own fixed height instead of spilling into whatever renders
    // after this card. Row mode only — stacked mode overrides both below.
    overflow: "hidden",
  },
  // Stacked mode: no fixed height to fill or clip against (the image isn't
  // beside this anymore, it's above it), so this just flows at its own
  // natural height instead of trying to stretch/center/clip like row mode.
  infoStacked: {
    flex: 0,
    justifyContent: "flex-start",
    overflow: "visible",
  },
  // See NOTE_LINE_HEIGHT's comment — explicitly un-fixes `default`'s own
  // lineHeight:24 so the note's line spacing tracks adjustsFontSizeToFit's
  // shrinking instead of staying pinned to the full-size value.
  noteText: {
    lineHeight: undefined,
  },
});
