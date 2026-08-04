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
import { LoadableImage } from "@/components/ui/loadable-image";
import { StretchText } from "@/components/ui/stretch-text";
import { BrandColors, Spacing } from "@/constants/theme";

type ReviewPromptCardProps = {
  label: string;
  visitId: string;
  placeName: string;
  rating: number | null;
  note: string | null;
  photoUrl?: string;
};

// Small, even sage border around the photo, matching the card's own
// background — see `photoWrap`/`photo` styles below.
const PHOTO_BORDER = Spacing.two;
// Interim shape while the real photo is still loading (see `photoWrap`'s
// `aspectRatio` below) — arbitrary but close to a typical photo, just to
// avoid an extreme flash of shape before the real one is known.
const DEFAULT_PHOTO_ASPECT_RATIO = 1;

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
export function ReviewPromptCard({
  label,
  visitId,
  placeName,
  rating,
  note,
  photoUrl,
}: ReviewPromptCardProps) {
  const [photoBox, setPhotoBox] = useState({ width: 0, height: 0 });
  const [photoAspectRatio, setPhotoAspectRatio] = useState(DEFAULT_PHOTO_ASPECT_RATIO);
  const badgeSize = clamp(photoBox.height * 0.24, 40, 72);

  function handlePhotoLoad(event: ImageLoadEventData) {
    const { width, height } = event.source;
    if (width > 0 && height > 0) setPhotoAspectRatio(width / height);
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="sectionLabel">{label}</ThemedText>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/visit/[id]", params: { id: visitId } })
        }
        style={styles.card}
      >
        <View
          style={[styles.photoWrap, { aspectRatio: photoAspectRatio }]}
          onLayout={(e: LayoutChangeEvent) =>
            setPhotoBox({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
        >
          <LoadableImage
            source={photoUrl ? { uri: photoUrl } : undefined}
            style={styles.photo}
            contentFit="contain"
            onLoad={handlePhotoLoad}
          />
          {/* Overlay occupies the bottom third of the photo, positioned
              against `photoWrap`'s own outer edge (not the padded/bordered
              inner area the image sits in — see `photo` above) so it always
              reads flush with the card's true bottom edge. Any sub-pixel
              shortfall between the text's rendered bottom and that edge
              lands on the sage border, which reads as intentional instead
              of as a bug — sidesteps needing pixel-perfect agreement
              between platforms on font leading/line-height. */}
          <View style={styles.placeOverlay}>
            <StretchText type="headline" outline>
              {placeName}
            </StretchText>
          </View>
        </View>
        <View style={styles.info}>
          {rating != null && (
            <View
              style={[
                styles.ratingBadge,
                {
                  width: badgeSize,
                  height: badgeSize,
                  borderRadius: badgeSize / 2,
                },
              ]}
            >
              <ThemedText
                type="roundedStat"
                themeColor="background"
                style={{ fontSize: clamp(badgeSize * 0.32, 14, 28) }}
              >
                {rating.toFixed(1)}
              </ThemedText>
            </View>
          )}
          {note && (
            <ThemedText type="default" themeColor="background">
              {note}
            </ThemedText>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.one,
  },
  card: {
    flexDirection: "row",
    backgroundColor: BrandColors.sage,
    borderRadius: Spacing.three,
    overflow: "hidden",
  },
  photoWrap: {
    width: "55%",
    backgroundColor: BrandColors.sage,
    overflow: "hidden",
  },
  // Inset by PHOTO_BORDER on every side instead of `StyleSheet.absoluteFill`
  // — leaves an even sliver of `photoWrap`'s own sage background showing as
  // a border around the image. A small rounded corner on the image itself
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
  // inset above and always spans the card's true bottom/left/right edges —
  // see the comment at its call site for why.
  placeOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "33%",
    justifyContent: "flex-end",
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingTop: Spacing.two,
  },
  info: {
    flex: 1,
    padding: Spacing.three,
    gap: Spacing.two,
    justifyContent: "center",
  },
  ratingBadge: {
    backgroundColor: BrandColors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
});
