import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { CommentsThread } from "@/components/comments-section";
import { FeedAuthorLine } from "@/components/feed-author-line";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Avatar } from "@/components/ui/avatar";
import {
  FeedRatingStamp,
  getStampCornerReach,
  STAMP_SIZE,
} from "@/components/ui/feed-rating-stamp";
import { PostcardFlip } from "@/components/ui/postcard-flip";
import { PostcardMap } from "@/components/ui/postcard-map";
import { PostcardPhotos } from "@/components/ui/postcard-photos";
import { Postmark } from "@/components/ui/postmark";
import { StretchText } from "@/components/ui/stretch-text";
import { TagSticker } from "@/components/ui/tag-sticker";
import { VisitActionsRow } from "@/components/visit-actions-row";
import { VisitMenu } from "@/components/visit-menu";
import { BrandColors, Colors, Spacing } from "@/constants/theme";
import type { FeedVisit } from "@/lib/feed";
import { regionLabel } from "@/lib/place-region";
import {
  orientationForPhotos,
  POSTCARD_FRAME_RATIO,
} from "@/lib/postcard-orientation";
import { formatVisitedPostmark } from "@/lib/visited-date";

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

// How tall one sticker stands, including the gap under it. Used to work out
// how many the picture side has room for — see frontStickerCount.
const STICKER_ROW = 34;
// Clear air between the stickers and whatever is above or below them.
const STICKER_MARGIN = 12;
// About what the headline block at the foot of the picture comes to (display
// line, the line under it, and the padding). Stickers stop above it. An
// estimate rather than a measurement because measuring it would mean a
// second layout pass on every card in the feed to place three stickers.
const CAPTION_RESERVE = 96;

// `visitNumber` optional (not required the way FeedVisit itself demands) —
// tagged-in.tsx's own TaggedVisit type (Omit<FeedVisit, 'visitNumber'>)
// doesn't compute it (a viewer's "Nth visit to this place" isn't a
// meaningful per-post number seeded from a *different* user's tagged post),
// so it just falls back to 1 (no "Nth visit" text) rather than requiring
// every caller to invent a value.
type VisitCardVisit = Omit<FeedVisit, "visitNumber"> & { visitNumber?: number };

type VisitCardProps = {
  visit: VisitCardVisit;
  photoUrls: Record<string, string>;
  // Grid-sized copies, keyed the same way. Optional: screens that haven't
  // fetched them just render full images, exactly as before.
  photoThumbUrls?: Record<string, string>;
  avatarUrl?: string;
  isOwner: boolean;
  isCopied: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onDeleted: () => void;
  // Reports where this card's picture sits within the card (offset from the
  // card's own top, and its height). Only the trip day swiper uses it, to
  // centre its arrows on the picture rather than on the whole card.
  onPhotoLayout?: (offsetY: number, height: number) => void;
  // Tagged-but-not-owner viewers only (see VisitMenu's own prop) — omitted
  // entirely (no "Untag yourself" option) when not supplied, which is every
  // caller except tagged-in.tsx today.
  onUntagSelf?: () => Promise<void>;
  // An absolute ceiling on how far the rating stamp may rise. Kept for the
  // callers that already set it; with the stamp anchored to the picture's
  // top corner rather than to a block of text, there is no longer anything
  // underneath it for it to bury.
  maxStampRise?: number;
};

// The feed's own visit card — a postcard with two sides.
//
// The picture side is the photos, the place name set across the bottom of
// them, and the rating stamp stuck on the top corner. The written side is
// the message, the tags, where it was and when, and everything you can do
// about it. That split is the design: the front is what you scroll past and
// the back is what you stop for, and the card only ever shows one of them.
//
// Every screen showing real visit posts (the feed, tagged-in, a trip's days)
// renders this, not a hand-copied lookalike that silently drifts the next
// time this one changes.
export function VisitCard({
  visit,
  photoUrls,
  photoThumbUrls,
  avatarUrl,
  isOwner,
  isCopied,
  onToggleLike,
  onShare,
  onDeleted,
  onUntagSelf,
  maxStampRise,
  onPhotoLayout,
}: VisitCardProps) {
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(visit.commentCount);
  // Which side is showing.
  const [isFlipped, setIsFlipped] = useState(false);
  // The picture's real height, for deciding how many stickers fit down its
  // edge. Zero until the first layout pass, which shows none — better than
  // guessing high and having them pop away.
  const [pictureHeight, setPictureHeight] = useState(0);

  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);

  const heartStyle = useAnimatedStyle(() => ({
    opacity: heartOpacity.value,
    transform: [{ scale: heartScale.value }],
  }));

  // Instagram-style double-tap: like-only, never unlikes an already-liked
  // post (so a stray extra tap can't accidentally undo a like) — the heart
  // still bursts every time as a tap acknowledgement, even when it's a
  // visual-only no-op on the like state itself.
  function handleDoubleTap() {
    if (!visit.isLikedByMe) onToggleLike();
    heartScale.value = 0.6;
    heartOpacity.value = 1;
    heartScale.value = withSequence(
      withTiming(1.15, { duration: 180 }),
      withTiming(1, { duration: 120 }),
    );
    heartOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withTiming(0, { duration: 400 }),
    );
  }

  const photos = visit.photoIds
    .map((id, i) => ({ id, url: photoUrls[id], ratio: visit.photoAspectRatios[i] }))
    .filter((p): p is { id: string; url: string; ratio: number | null } => p.url != null);

  const orientation = orientationForPhotos(
    photos.map((p) => p.ratio),
    photos.length,
  );
  const lat = visit.placeLat;
  const lng = visit.placeLng;
  const hasCoordinates = lat != null && lng != null;
  // Null when it would only repeat the place name — a country-level place is
  // its own stateCountry.
  const region = regionLabel(visit.placeName, visit.stateCountry);
  const postmarkDate = formatVisitedPostmark(visit.visited_on);
  const visitedLine = [
    visit.rating == null ? "Visited" : null,
    visit.visitNumber != null && visit.visitNumber > 1
      ? `${ordinal(visit.visitNumber)} visit`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Who posted it, above the card rather than inside it. A postcard does not
  // carry the sender's name on the picture, and keeping the byline outside
  // the flip means it stays put while the card turns — the card changes
  // sides, not owners.
  const byline = (
    <View style={styles.byline}>
      <Pressable
        onPress={() =>
          router.push({ pathname: "/user/[id]", params: { id: visit.user_id } })
        }
      >
        <Avatar uri={avatarUrl} name={visit.authorName} size={28} />
      </Pressable>
      <FeedAuthorLine
        authorId={visit.user_id}
        authorName={visit.authorName}
        taggedUsers={visit.taggedUsers}
        style={styles.bylineText}
      />
    </View>
  );

  // How many tags the picture side has room for down one of its edges, and
  // which edge that is. The rest are on the back, which carries all of them
  // regardless — this is a preview, not the list.
  //
  // The right edge first, as drawn: stickers trailing down from under the
  // stamp. A landscape frame with a stamp on it has almost nothing left
  // there, though — the stamp eats most of a short card's height — so
  // rather than showing none at all, they move to the left edge, which the
  // stamp never touches. Portrait cards are tall enough that the right edge
  // wins and they stay under the stamp.
  const stampReach =
    visit.rating != null ? getStampCornerReach(STAMP_SIZE, Spacing.three) : Spacing.three;
  const captionTop = pictureHeight - CAPTION_RESERVE;
  const rightBand = captionTop - (stampReach + STICKER_MARGIN);
  const leftBand = captionTop - STICKER_MARGIN * 2;
  const useRightEdge = rightBand >= STICKER_ROW;
  const stickerBand = useRightEdge ? rightBand : leftBand;
  const frontStickerCount = Math.max(
    0,
    Math.min(visit.tags.length, Math.floor(stickerBand / STICKER_ROW)),
  );

  const picture =
    photos.length > 0 ? (
      <PostcardPhotos
        urls={photos.map((p) => p.url)}
        thumbUrls={
          photoThumbUrls ? photos.map((p) => photoThumbUrls[p.id] ?? p.url) : undefined
        }
        orientation={orientation}
        onDoubleTap={handleDoubleTap}
      />
    ) : hasCoordinates ? (
      // A review with no photos gets the place itself as its picture. The
      // back carries a map too, but the two are never on screen together.
      <PostcardMap
        placeId={visit.placeId}
        placeName={visit.placeName}
        lat={lat}
        lng={lng}
        level={visit.placeLevel}
        size="block"
        ratio={POSTCARD_FRAME_RATIO[orientation]}
      />
    ) : (
      // Neither photos nor coordinates: an empty frame, so the card still
      // holds a postcard's shape instead of collapsing to a caption.
      <View style={{ width: "100%", aspectRatio: POSTCARD_FRAME_RATIO[orientation] }} />
    );

  const front = (
    // Nothing clips here, and position is relative — the stamp leans past
    // the top-right corner by design, the way one stuck on crooked does.
    <View style={styles.front} collapsable={false}>
      <View
        style={styles.picture}
        onLayout={(e) => {
          setPictureHeight(e.nativeEvent.layout.height);
          onPhotoLayout?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height);
        }}
      >
        {picture}

        {/* The name is set ACROSS the picture, not above it — which means it
            needs ground of its own, because cream display type over an
            arbitrary photo is unreadable about half the time. A gradient
            rather than a flat bar, so the picture keeps going underneath. */}
        <LinearGradient
          colors={["rgba(11,20,16,0)", "rgba(11,20,16,0.88)"]}
          style={styles.scrim}
          pointerEvents="none"
        />

        {/* A plain View, not one big Pressable: the parts that are not text
            should fall through to the photo underneath, which has its own
            tap (open) and double tap (like). */}
        <View style={styles.caption}>
          <Pressable
            onPress={() =>
              router.push({ pathname: "/place/[id]", params: { id: visit.placeId } })
            }
          >
            {/* Never truncated, however long the name — see StretchText's own
                note. The whole name is the point of a picture side that is
                otherwise wordless. */}
            <StretchText type="headline" fill truncateLongText={false}>
              {visit.placeName || " "}
            </StretchText>
          </Pressable>

          {/* The turn-over control shares this row rather than floating in
              the corner on its own. Floating, it collided with the headline
              on every card whose region line is suppressed for repeating the
              place name — the headline then occupies this row itself. */}
          <View style={styles.captionMeta}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
              style={styles.captionMetaText}
            >
              {[region, visitedLine].filter(Boolean).join(" · ")}
            </ThemedText>

            <Pressable
              onPress={() => setIsFlipped(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Read the message"
              style={({ pressed }) => [styles.turnOver, pressed && styles.pressed]}
            >
              <Ionicons name="sync-outline" size={16} color={BrandColors.cream} />
              <ThemedText type="small" style={styles.turnOverText}>
                Turn over
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {frontStickerCount > 0 && (
          <View
            style={[
              styles.frontStickers,
              useRightEdge
                ? { right: Spacing.two, top: stampReach + STICKER_MARGIN, alignItems: "flex-end" }
                : { left: Spacing.two, top: STICKER_MARGIN * 2, alignItems: "flex-start" },
            ]}
            pointerEvents="none"
          >
            {visit.tags.slice(0, frontStickerCount).map((tag) => (
              <TagSticker
                key={tag.slug}
                slug={tag.slug}
                label={tag.label}
                placementSeed={visit.id}
              />
            ))}
          </View>
        )}

        <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
          <Ionicons name="heart" size={72} color={BrandColors.cream} />
        </Animated.View>
      </View>

      {visit.rating != null && (
        <FeedRatingStamp
          rating={visit.rating}
          seed={visit.id}
          tags={visit.tags.map((tag) => tag.slug)}
          placeId={visit.placeId}
          canSeep
          corner="top-right"
          maxBottomOffset={maxStampRise}
        />
      )}

    </View>
  );

  const backMap = hasCoordinates ? (
    <PostcardMap
      placeId={visit.placeId}
      placeName={visit.placeName}
      lat={lat}
      lng={lng}
      level={visit.placeLevel}
      size={orientation === "horizontal" ? "block" : "thumb"}
    />
  ) : null;

  const back = (
    <ThemedView type="backgroundElement" style={styles.back} collapsable={false}>
      {/* Where it was, and the way back to the picture. The overflow menu
          lives here rather than on the front, where the stamp already owns
          the top corner. */}
      <View style={styles.backHeader}>
        <Pressable
          style={styles.backHeaderText}
          onPress={() =>
            router.push({ pathname: "/place/[id]", params: { id: visit.placeId } })
          }
        >
          <ThemedText type="smallBold" numberOfLines={1}>
            {visit.placeName}
          </ThemedText>
          {region && (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {region}
            </ThemedText>
          )}
          {visit.taggedPlaces.length > 0 && (
            <ThemedText type="small" themeColor="link" numberOfLines={1}>
              {visit.taggedPlaces.map((place) => place.name).join(" · ")}
            </ThemedText>
          )}
        </Pressable>

        {/* Both controls in one row of their own, so they share a baseline
            instead of each aligning to the top of a header block whose
            height varies with how many location lines there are. */}
        <View style={styles.backHeaderControls}>
          <Pressable
            onPress={() => setIsFlipped(false)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Show the picture side"
            style={({ pressed }) => [styles.flipBack, pressed && styles.pressed]}
          >
            <Ionicons name="sync-outline" size={16} color={Colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Front
            </ThemedText>
          </Pressable>

          <VisitMenu
            visitId={visit.id}
            isOwner={isOwner}
            onDeleted={onDeleted}
            authorId={visit.user_id}
            authorName={visit.authorName}
            authorAvatarUrl={avatarUrl}
            placeName={visit.placeName}
            note={visit.note}
            isViewerTagged={visit.isViewerTagged}
            onUntagSelf={onUntagSelf}
          />
        </View>
      </View>

      <View style={styles.rule} />

      <View style={styles.backBody}>
        <View style={styles.message}>
          {visit.note ? (
            <ThemedText type="body">{visit.note}</ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.noMessage}>
              No message
            </ThemedText>
          )}

          {/* Under the message rather than in the address column beside it.
              They went in the column first, to match the sketch, and a
              128px column broke every one of them across two lines — a tag
              is a printed label, and a label that wraps stops looking like
              one. Here they get the card's full text width, and the front
              edge shows as many as happen to fit up there. */}
          {visit.tags.length > 0 && (
            <View style={styles.backStickers}>
              {visit.tags.map((tag) => (
                <TagSticker
                  key={tag.slug}
                  slug={tag.slug}
                  label={tag.label}
                  placementSeed={visit.id}
                />
              ))}
            </View>
          )}
        </View>

        {/* On a real card this separates what you wrote from who it is going
            to; here it separates the message from where and when. */}
        <View style={styles.backDivider} />

        <View style={styles.backColumn}>
          <Postmark
            line={postmarkDate.line}
            year={postmarkDate.year}
            seed={visit.id}
            size={56}
          />
          {/* A landscape card has the width for a map you can read a location
              off. A portrait one does not, and gets its map as a thumbnail in
              the action row instead. */}
          {orientation === "horizontal" && backMap}
        </View>
      </View>

      {isCommentsOpen && (
        <CommentsThread
          visitId={visit.id}
          visitOwnerId={visit.user_id}
          knownCount={commentCount}
          onCountChange={setCommentCount}
        />
      )}

      <View style={styles.backFooter}>
        <VisitActionsRow
          visitId={visit.id}
          isLiked={visit.isLikedByMe}
          likeCount={visit.likeCount}
          onToggleLike={onToggleLike}
          onShare={onShare}
          isCopied={isCopied}
          isOwnerOrTagged={isOwner || visit.isViewerTagged}
          commentCount={commentCount}
          isCommentsOpen={isCommentsOpen}
          onToggleComments={() => setIsCommentsOpen((open) => !open)}
        />
        {orientation === "vertical" && backMap}
      </View>
    </ThemedView>
  );

  return (
    <View style={styles.card}>
      {byline}
      <PostcardFlip isFlipped={isFlipped} front={front} back={back} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  byline: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.one,
  },
  bylineText: {
    flex: 1,
  },

  // --- picture side ---
  front: {
    position: "relative",
  },
  picture: {
    borderRadius: Spacing.three,
    // The one thing here that DOES clip: photos have square corners and the
    // card does not. The stamp is a sibling of this rather than a child, so
    // it still hangs off the corner.
    overflow: "hidden",
    backgroundColor: Colors.backgroundElement,
  },
  scrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // Tall enough to carry the headline and the line under it, with the fade
    // starting well above the type rather than right at it.
    height: 170,
  },
  caption: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    gap: Spacing.one,
  },
  captionMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  captionMetaText: {
    flex: 1,
  },
  frontStickers: {
    position: "absolute",
    // Side, `top` and alignment are all set inline — see useRightEdge.
    gap: Spacing.two,
  },
  turnOver: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  turnOverText: {
    color: BrandColors.cream,
  },
  pressed: {
    opacity: 0.6,
  },
  heartBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },

  // --- written side ---
  back: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  backHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  backHeaderText: {
    flex: 1,
  },
  backHeaderControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  flipBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
  },
  rule: {
    height: 1,
    backgroundColor: `${BrandColors.cream}2e`,
  },
  backBody: {
    flexDirection: "row",
    // Enough that the ruled line reads as a divider running down a card
    // rather than an underline between two short rows.
    minHeight: 120,
    // Tight, because every point taken here comes off the message column,
    // and the longest tag labels need about 175 to stay on one line.
    gap: Spacing.two,
  },
  message: {
    flex: 1,
    paddingTop: Spacing.one,
    gap: Spacing.three,
  },
  backStickers: {
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  noMessage: {
    fontStyle: "italic",
    opacity: 0.6,
  },
  backDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: `${BrandColors.cream}2e`,
  },
  backColumn: {
    // Fixed rather than content-sized: a column whose width followed its
    // contents would move the ruled divider from card to card down the feed.
    // As narrow as the postmark and a legible map allow, for the same reason
    // as the gap above.
    width: 112,
    alignItems: "flex-end",
    gap: Spacing.two,
  },
  backFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.three,
  },
});
