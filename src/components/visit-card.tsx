import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import { FeedRatingStamp, STAMP_SIZE } from "@/components/ui/feed-rating-stamp";
import { RatingGlassBadgeGated } from "@/components/ui/rating-glass-badge-gated";
import { PostcardFlip } from "@/components/ui/postcard-flip";
import { PostcardMap } from "@/components/ui/postcard-map";
import { LayeredHeadline } from "@/components/ui/layered-headline";
import { PostcardGrain } from "@/components/ui/postcard-grain";
import {
  grainFor,
  seededGrain,
  seededStock,
  sheetFor,
} from "@/lib/postcard-stock";
import {
  pictureInsetFor,
  PostcardPaper,
  turnMarkInsetFor,
} from "@/components/ui/postcard-paper";
import {
  TURN_MARK_PANEL_INK,
  turnMarkClearance,
} from "@/components/ui/postcard-turn-mark";
import { PostcardPhotos } from "@/components/ui/postcard-photos";
import { Postmark } from "@/components/ui/postmark";
import { StretchText } from "@/components/ui/stretch-text";
import { TagSticker } from "@/components/ui/tag-sticker";
import { VisitActionsRow } from "@/components/visit-actions-row";
import { VisitMenu } from "@/components/visit-menu";
import { BrandColors, Spacing } from "@/constants/theme";
import { hapticLike, hapticUnlike } from "@/lib/haptics";
import type { FeedVisit } from "@/lib/feed";
import { useImageAccent } from "@/hooks/use-image-accent";
import { hashSeed } from "@/lib/seeded-random";
import { headlineTreatmentFor } from "@/lib/headline-style";
import { regionLabel } from "@/lib/place-region";
import {
  fitPicture,
  isSquarish,
  orientationForPhotos,
  POSTCARD_FRAME_RATIO,
} from "@/lib/postcard-orientation";
import { formatVisitedPostmark } from "@/lib/visited-date";

type CaptionAnchor = "top" | "bottom" | "float";

function pickCaptionAnchor(seed: string, options: CaptionAnchor[]): CaptionAnchor {
  return options[hashSeed(seed) % options.length];
}

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

// The narrowest strip of bare card either ornament will accept. Below this
// they are not sitting in a margin, they are sitting on the photo.
// Set so the smallest margin that qualifies still takes a stamp that is
// mostly ON that margin — below this the stamp overhangs the picture by
// more than it covers card, which is the thing being avoided.
const MIN_ORNAMENT_BAND = 48;
// Bounds on the stamp once it is sized to the margin it sits in, rather
// than always drawn at STAMP_SIZE.
const MIN_STAMP = 52;
// The stamp's ceiling, as a share of the card's width. It used to be a flat
// STAMP_SIZE, which is about a quarter of a phone card's width but only an
// eighth of a 750dp desktop one — so the identical stamp read as postage on a
// phone and as a speck on a monitor. Anchored to the card instead: STAMP_SIZE
// is what it came out at on a ~400dp phone card, and it grows from there.
const STAMP_WIDTH_SHARE = STAMP_SIZE / 400;

// How far in from the card's edge a tap still counts as "the side of the
// card" and turns it over. 44 is the smallest target Apple will call
// thumb-sized, and the printed border is only 14 — so on the picture side
// this deliberately reaches past the border and over the outer band of the
// photo. A tap that lands there was going for the edge; the middle of the
// picture still opens it, and still takes a double tap to like.
const FRONT_FLIP_REACH = 44;
// How close to the card's own edge the place name is allowed to run. The name
// is not the picture's caption, it is the card's — so it crosses whatever
// margin the picture left and carries on into the printed border, and only
// this stops it reaching the deckle.
const CAPTION_EDGE_INSET = 14;
// ...as a share of the card's width, so the clearance a phone card has is the
// clearance a desktop one has. A flat 14 is 3.5% of a phone card and half that
// of a 750dp one, which is how a name that sat inside the card on a phone came
// to run off the edge of the same card on a monitor.
const CAPTION_EDGE_SHARE = CAPTION_EDGE_INSET / 400;
// How long after one double tap another is ignored — see handleDoubleTap.
const DOUBLE_TAP_GUARD_MS = 500;
// How long a card will wait for its photographs before showing itself anyway.
// Long enough to cover a slow connection, short enough that a wedged request
// does not read as the feed being broken.
const REVEAL_TIMEOUT_MS = 4000;
// The fade in, once it is ready.
const REVEAL_FADE_MS = 180;
// How much of the name's band the region line is pulled back into, to sit
// against the lettering rather than off it. See the call site.
const REGION_TUCK_SHARE = 0.16;
// Clear card the sticker row has to leave above and below itself to count as
// fitting its band.
//
// Without it "fits" meant "is not taller than the band", which a row can
// satisfy by one point and still look wrong: measured on a phone, six labels
// came to 67pt in a 68.6pt band, so they passed — and then sat with their
// bottom row on the deckle and their top row against the underside of the
// photograph. Filling a band edge to edge is not sitting in it.
const STICKER_BAND_CLEARANCE = Spacing.two;
// What share of the card's height the name is lettered at. Fixed, so every
// card in a feed carries its name at the same size relative to the card rather
// than at whatever size its own character count produced — a short name was
// coming out enormous and a long one small.
const CAPTION_HEIGHT_SHARE = 0.25;
// The written side stops short of its own content, which begins 30pt in
// (the printed border plus the panel's padding). Reaching 44 here would put
// the strip straight on top of the like button.
const BACK_FLIP_REACH = 26;

// `visitNumber` optional (not required the way FeedVisit itself demands) —
// tagged-in.tsx's own TaggedVisit type (Omit<FeedVisit, 'visitNumber'>)
// doesn't compute it (a viewer's "Nth visit to this place" isn't a
// meaningful per-post number seeded from a *different* user's tagged post),
// so it just falls back to 1 (no "Nth visit" text) rather than requiring
// every caller to invent a value.
export type VisitCardVisit = Omit<FeedVisit, "visitNumber"> & { visitNumber?: number };

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
  // Open the card's comments straight away. The feed leaves them shut —
  // scanning many posts matters more there — but a screen you reached BY
  // pressing a review is already the answer to "which one", so making you
  // ask twice is a tap for nothing. See visit/[id].tsx.
  initialCommentsOpen?: boolean;
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
  initialCommentsOpen = false,
}: VisitCardProps) {
  const [isCommentsOpen, setIsCommentsOpen] = useState(initialCommentsOpen);
  const [commentCount, setCommentCount] = useState(visit.commentCount);
  // Which side is showing. A review can be written to open on its message
  // rather than its picture — some of them are the writing.
  const [isFlipped, setIsFlipped] = useState(visit.card.side === "message");
  // The picture frame's real size. Zero until the first layout pass, which
  // shows no ornaments at all — better than guessing high and having them
  // pop away.
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  // The card's own width. Everything that has to clear the printed border —
  // the picture, the place name, the stamp — is a fraction of this rather than
  // a fixed number of points, because the border itself is: the frame is one
  // image stretched over the card, so it reaches further in the bigger the
  // card gets. See pictureInsetFor.
  const [cardWidth, setCardWidth] = useState(0);
  // How wide the place name actually came out. `fill` is capped, so a short
  // name stops well short of its box — and the broader location line has to
  // stay within the NAME's range, not the box's. Zero until it is measured,
  // which falls back to the full width.
  const [nameWidth, setNameWidth] = useState(0);

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
  // Guarded because two things can see the same double tap: the photograph's
  // own timestamp-based one (see usePhotoTaps) and the card-wide gesture that
  // now covers the borders and the written side too. Where they overlap — the
  // photograph — both fire, and without this the heart bursts twice for one
  // gesture. The like itself was always idempotent; the animation was not.
  const lastBurstAtRef = useRef(0);

  // Both ways of liking go through here, so the knock is tied to the STATE
  // changing rather than to one of the two buttons. A double tap on a card
  // that is already liked replays the heart burst but changes nothing, and
  // buzzing for that would be buzzing for a no-op.
  function handleToggleLike() {
    if (visit.isLikedByMe) hapticUnlike();
    else hapticLike();
    onToggleLike();
  }

  function handleDoubleTap() {
    const now = Date.now();
    if (now - lastBurstAtRef.current < DOUBLE_TAP_GUARD_MS) return;
    lastBurstAtRef.current = now;

    if (!visit.isLikedByMe) handleToggleLike();
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

  // The name is lettered in a colour read off the review's own first
  // picture — see useImageAccent. The thumbnail where there is one: it is the
  // same photograph, a fraction of the pixels to decode, and the broad colour
  // of an image survives being shrunk.
  const accentSource =
    visit.photoIds.length > 0
      ? (photoThumbUrls?.[visit.photoIds[0]] ?? photoUrls[visit.photoIds[0]])
      : undefined;
  const accent = useImageAccent(accentSource);

  const photos = visit.photoIds
    .map((id, i) => ({ id, url: photoUrls[id], ratio: visit.photoAspectRatios[i] }))
    .filter((p): p is { id: string; url: string; ratio: number | null } => p.url != null);

  // Whether this card is still waiting to be worth looking at.
  //
  // Keyed on photoIds rather than on `photos`, which is the resolved list and
  // is EMPTY until the presigned urls arrive. Reading readiness off that
  // would call a card with four photographs ready a moment before it had any
  // of them, which is the exact flicker this exists to remove.
  const expectsPhotos = visit.photoIds.length > 0;
  const [photosReady, setPhotosReady] = useState(false);
  const revealed = !expectsPhotos || photosReady;

  useEffect(() => {
    if (!expectsPhotos || photosReady) return;
    // A picture that never arrives must not be able to keep a card off the
    // screen for good. PostcardPhotos already counts an error as ready, but
    // that only covers a request that FAILS — one that hangs, on a flaky
    // connection or behind a url that has quietly expired, reports nothing at
    // all. After this the card shows regardless, photographs or not.
    const timer = setTimeout(() => setPhotosReady(true), REVEAL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [expectsPhotos, photosReady]);

  const revealStyle = useAnimatedStyle(() => ({
    // Faded rather than switched on: a card snapping from invisible to solid
    // reads as a glitch, where a short fade reads as it arriving.
    opacity: withTiming(revealed ? 1 : 0, { duration: REVEAL_FADE_MS }),
  }));

  // The author's choice wins; otherwise the photos decide, which is what
  // every review written before the choice existed still does.
  const orientation =
    visit.card.orientation ??
    orientationForPhotos(
      photos.map((p) => p.ratio),
      photos.length,
    );
  const stock = visit.card.stock ?? seededStock(visit.id);
  const grain = visit.card.grain ?? seededGrain(visit.id);
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

  // What the picture leaves bare once it is fitted inside the frame rather
  // than cropped to fill it. That leftover is the only place the stamp and
  // the stickers may sit on this side: a review whose photo happens to
  // match the frame keeps a clean picture and carries both on the back.
  //
  // Single pictures only. A grid fits each tile into its own slot, so what
  // it leaves bare is a scatter of gaps between photos rather than one
  // margin wide enough to put anything in.
  const singlePictureRatio =
    photos.length === 1
      ? photos[0].ratio
      : photos.length === 0
        ? POSTCARD_FRAME_RATIO[orientation]
        : null;
  const fit = fitPicture(frame.width, frame.height, singlePictureRatio);

  // A square picture on a portrait card leaves one clean band under it, and
  // the place name is printed there rather than across the picture — see
  // isSquarish. Everything else keeps the name over the photo, where a margin
  // too thin to set type in is left to the stamp and the stickers instead.
  const captionBelow = isSquarish(singlePictureRatio) && orientation === "vertical";

  // Where the name sits on the card. Against an edge, not adrift in the
  // middle: a name floating partway up was the single thing that most stopped
  // these reading as printed cards.
  //
  // The exception is a picture that leaves the card bare somewhere. There the
  // name has somewhere of its own to go, so it is allowed to sit off an edge
  // and hold that space instead.
  const hasDeadSpace = fit.sideBand > 1 || fit.topBand > 1;
  const captionAnchor = hasDeadSpace
    ? pickCaptionAnchor(`caption-loose:${visit.id}`, ["bottom", "float"])
    : pickCaptionAnchor(`caption:${visit.id}`, ["top", "bottom"]);
  const sheet = sheetFor({ stock, orientation });
  // The card's own border counts toward the margin — it is the same strip of
  // bare card, just the part that is there on every post.
  const pictureInset = pictureInsetFor(cardWidth, orientation);
  // One draw for the pair. The region line takes the name's own colour and
  // its own face, and decides which side of the name it sits on and which
  // margin it runs to — see RegionTreatment.
  const headline = headlineTreatmentFor(visit.id, {
    accent,
    // The same box the name is lettered into, so the border-out outline can
    // be a share of the type rather than a fixed distance that reads
    // differently on a phone and on a desktop card.
    boxHeight: frame.height * CAPTION_HEIGHT_SHARE,
  });
  const captionEdgeInset = Math.max(
    CAPTION_EDGE_INSET,
    Math.round(cardWidth * CAPTION_EDGE_SHARE),
  );
  const sideMargin = fit.sideBand > 0 ? fit.sideBand + pictureInset : 0;
  const topMargin = fit.topBand > 0 ? fit.topBand + pictureInset : 0;

  // A picture narrower than the frame leaves columns down the sides; a
  // wider one leaves bands above and below. The stamp takes whichever
  // exists and is sized to it. The stickers need the horizontal one — a
  // stack of wide labels will not fit in a 40px column.
  const stampMargin = Math.max(sideMargin, topMargin);
  // Never alongside a printed caption: that band is the caption's, and the
  // two of them in it is a crowd.
  const showFrontStamp =
    visit.rating != null && !captionBelow && stampMargin >= MIN_ORNAMENT_BAND;
  // `max` rather than a straight share, so a stamp on a phone is never
  // smaller than it is today — this only ever lets it grow.
  const stampCap = Math.max(STAMP_SIZE, Math.round(cardWidth * STAMP_WIDTH_SHARE));
  const stampSize = Math.round(Math.min(stampCap, Math.max(MIN_STAMP, stampMargin * 1.1)));
  // The labels only go on the front when there is genuinely a clean band for
  // them. Two things can take that band away, and both were letting them
  // through onto the picture:
  //
  //  - The NAME, when it is set along the foot of the card. That is the same
  //    strip the labels sit in, so they printed straight over each other.
  //  - Their own number. The row wraps, and it used to be given a box of a
  //    fixed height — so a second row of labels did not make the box taller,
  //    it hung out of the top of it and over the photograph.
  //
  // The first is known up front. The second is only knowable once the row has
  // been laid out and measured, which is what stickerRowHeight is for.
  //
  // Nothing is lost by dropping them: every tag is printed on the written
  // side regardless, which is where a card carries them anyway.
  const [stickerRowHeight, setStickerRowHeight] = useState(0);
  const stickersMeasured = stickerRowHeight > 0;
  const stickersFit =
    stickersMeasured && stickerRowHeight + 2 * STICKER_BAND_CLEARANCE <= topMargin;
  // The right margin is not always free. The stamp sits in the card's
  // top-right corner, so a region line drawn there too ends up underneath it
  // — confirmed on a card whose line read "PROVENCE," with "FRANCE" behind
  // the stamp. The line gives way rather than the stamp: it is the smaller
  // thing and it has another margin to go to.
  //
  // The foot needs no equivalent. The turn-over mark is in the bottom-right,
  // but a name anchored there already inset the whole caption box past it
  // (see turnMarkClearance), and a line right-aligned inside that box clears
  // it for free.
  const regionAlignRight =
    headline.region.alignRight &&
    !(captionAnchor === "top" && headline.region.above && showFrontStamp);
  const showFrontStickers =
    visit.tags.length > 0 &&
    !captionBelow &&
    captionAnchor !== "bottom" &&
    topMargin >= MIN_ORNAMENT_BAND;

  const picture =
    photos.length > 0 ? (
      <PostcardPhotos
        urls={photos.map((p) => p.url)}
        thumbUrls={
          photoThumbUrls ? photos.map((p) => photoThumbUrls[p.id] ?? p.url) : undefined
        }
        orientation={orientation}
        // Printed above its caption, the picture keeps its own shape.
        frameRatio={
          captionBelow && singlePictureRatio != null ? singlePictureRatio : undefined
        }
        onDoubleTap={handleDoubleTap}
        onReady={() => setPhotosReady(true)}
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

  // The stamp and the tag stickers, in whatever bare card the picture left.
  //
  // These go in PostcardPaper's `footer`, which is drawn AFTER the frame, and
  // not in its body with the picture — which is where they used to be, and
  // where the frame was painted straight over them. A stamp sits in the
  // margin at the card's corner, which is exactly where the frame's ring is,
  // so the card's own border covered half of it: the rating was buried under
  // the cream corner and only the part hanging off the card was visible.
  //
  // Being in the footer also puts their boxes against the CARD rather than
  // against the picture's padded box, so the insets below are plain zeroes
  // where they used to have to reach back out by the picture's own inset.
  const ornaments = (
    <>
      {/* Laid along the bare card under the picture, never on top of it.
          Only the horizontal margin is ever wide enough: a stack of wide
          labels cannot fit in the 40-odd points a side column leaves. */}
      {showFrontStickers && (
        <View
          style={[
            styles.frontStickers,
            {
              // No fixed height — that is what let a wrapped second row hang
              // out of the box. The row takes its own height and is centred
              // in the band once that height is known.
              bottom: stickersMeasured ? Math.max((topMargin - stickerRowHeight) / 2, 0) : 0,
              // Held off the deckle by the same distance the picture is, so a
              // label never starts on the torn edge of the card.
              left: pictureInset + Spacing.three,
              right: pictureInset + Spacing.three,
              // Transparent until measured, so a row that turns out not to
              // fit is never seen doing it. It stays mounted rather than
              // being torn out — unmounting would lose the measurement and
              // the two would chase each other forever.
              opacity: stickersFit ? 1 : 0,
            },
          ]}
          pointerEvents="none"
          onLayout={(e) => setStickerRowHeight(e.nativeEvent.layout.height)}
        >
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

      {/* In the bare card the picture left behind — a column down the right
          when the picture is the narrower shape, the band across the top
          when it is the wider one. When the picture fills the frame there is
          no margin and no stamp here at all: it goes on the back, which is
          where a real card carries one anyway. */}
      {showFrontStamp && (
        <View
          style={[
            styles.frontStamp,
            sideMargin >= topMargin
              ? { top: 0, bottom: 0, right: 0, width: sideMargin }
              : { left: 0, right: 0, top: 0, height: topMargin },
          ]}
          pointerEvents="box-none"
        >
          <FeedRatingStamp
            rating={visit.rating!}
            seed={visit.id}
            tags={visit.tags.map((tag) => tag.slug)}
            placeId={visit.placeId}
            canSeep={false}
            corner="top-right"
            placement="corner"
            cornerInset={2}
            size={stampSize}
          />
        </View>
      )}
    </>
  );

  const front = (
    <PostcardPaper
      sheet={sheet}
      inset={pictureInset}
      framed
      footer={
        <>
          {captionBelow ? (
          // Printed on the card under the picture, not set across it. No
          // scrim and no cream: this is ink on paper, so the lettering
          // switches to the card's own dark — see headlineStyleFor's
          // `onCard`.
          <Pressable
            style={[
              styles.printedCaption,
              // The same two distances the overlaid caption keeps, and for
              // the same reason: both are a share of the card, because the
              // printed border they have to clear is.
              { paddingHorizontal: captionEdgeInset, paddingBottom: pictureInset },
            ]}
            onPress={() =>
              router.push({ pathname: "/place/[id]", params: { id: visit.placeId } })
            }
          >
            <StretchText
              type="headline"
              fill
              truncateLongText={false}
              style={[
                headlineTreatmentFor(visit.id, { onCard: true }).style,
                styles.printedCaptionName,
              ]}
            >
              {visit.placeName || " "}
            </StretchText>
            {(region || visitedLine) && (
              <ThemedText type="small" numberOfLines={1} style={styles.printedCaptionLine}>
                {[region, visitedLine].filter(Boolean).join(" · ")}
              </ThemedText>
            )}
          </Pressable>
        ) : (
          <View style={styles.captionLayer} pointerEvents="box-none">
            {/* No gradient behind the name any more. It was there to give
                light type a ground on an arbitrary photo, but once the
                caption started crossing onto the card's border the band had
                to cross with it — and a dark fade lying half on a photograph
                and half on cream paper stacks rather than blends. The
                lettering carries its own second colour (see headlineStyleFor,
                where every variant has a hard offset or a soft shadow), which
                is what a printed caption on a real card relies on too. */}

            {/* A plain View, not one big Pressable: the parts that are not
                text should fall through to the photo underneath, which has
                its own tap (open) and double tap (like). */}
            <View
              style={[
                styles.caption,
                {
                  // Which side of the name the region line falls on. Both
                  // orders put it last in the tree, so it paints over the
                  // name's plates rather than under them.
                  flexDirection: headline.region.above ? "column-reverse" : "column",
                  left: captionEdgeInset,
                  // Held off the turn-over mark when the name is set along
                  // the foot of the card, which is the one anchor that puts
                  // it in the same corner. The name is stretched to whatever
                  // box it is given, so this costs a little width rather than
                  // risking an overlap.
                  right:
                    captionAnchor === "bottom"
                      ? captionEdgeInset + turnMarkClearance(turnMarkInsetFor(cardWidth))
                      : captionEdgeInset,
                },
                captionAnchor === "top"
                  ? { top: pictureInset }
                  : captionAnchor === "bottom"
                    ? { bottom: pictureInset }
                    : // Floating: held off the picture's own foot, which is
                      // where it used to sit unconditionally.
                      { bottom: pictureInset + fit.topBand + Spacing.three },
              ]}
            >
              <Pressable
                onPress={() =>
                  router.push({ pathname: "/place/[id]", params: { id: visit.placeId } })
                }
              >
                {/* Never truncated, however long the name — see StretchText's
                    own note. Lettered differently per card, and struck in more
                    than one colour on most of them — see headlineTreatmentFor
                    and LayeredHeadline. */}
                <View style={{ height: frame.height * CAPTION_HEIGHT_SHARE }}>
                  <LayeredHeadline
                    fillHeight
                    style={headline.style}
                    back={headline.back}
                    onRenderedWidth={setNameWidth}
                  >
                    {visit.placeName || " "}
                  </LayeredHeadline>
                </View>
              </Pressable>

              {/* Rendered AFTER the name but shown above it — see the
                  column-reverse on styles.caption.

                  Above it, because StretchText's fill mode trades horizontal
                  compression for vertical stretch: a long name grows past the
                  box it was measured in, and a line sitting under it ends up
                  in its descenders however much gap it is given (16pt was not
                  enough). Above, there is nothing to collide with, and a small
                  line over a big one is how these cards are set anyway.

                  After it in the tree, because paint order is tree order on
                  both platforms: the name's plates are drawn behind the name
                  but still over anything earlier in the tree, and a treatment
                  that spreads out from the letters reaches this line. The
                  reverse direction is what lets the line be last, and so on
                  top, without moving.

                  It carries its own shadow because the gradient that used to
                  back this whole block is gone: grey type straight onto an
                  arbitrary photograph is unreadable about half the time. */}
              {(region || visitedLine) && (
                // Held to the name's own extent rather than the caption's.
                // The name grows from its left edge (StretchText's transform
                // origin), so its range is 0..nameWidth — and aligning the
                // line to the BOX instead put it out past the end of a short
                // name entirely, which is what this box exists to stop.
                <View
                  style={[
                    styles.regionRange,
                    nameWidth > 0 ? { width: nameWidth } : null,
                    {
                      alignItems: regionAlignRight ? "flex-end" : "flex-start",
                      // Tucked against the name rather than floating off it.
                      //
                      // The name is set with fillHeightExact, which fits its
                      // LAYOUT box — ascent and descent included — to the band
                      // it is given. The visible caps are a good deal shorter
                      // than that box, so a plain gap here left a space the
                      // size of the gap PLUS all the room the name's own box
                      // was not using, and the line read as unrelated to it.
                      // Pulling back a share of the band closes that, and a
                      // share rather than a number because the band scales
                      // with the card.
                      //
                      // On this box rather than the text inside it, so it
                      // acts on the caption's own column directly.
                      //
                      // Two pull-backs, because there are two different pieces
                      // of empty space between the name and this line and they
                      // scale differently. The first is the name's: a share of
                      // the band, because the name is fitted to the band and
                      // grows with the card. The second is this line's own —
                      // the part of its line box its letters do not reach,
                      // which is a fixed number of points because the type is
                      // a fixed size, and which differs per FACE. See
                      // region.tuck.
                      [headline.region.above ? "marginBottom" : "marginTop"]:
                        -frame.height * CAPTION_HEIGHT_SHARE * REGION_TUCK_SHARE -
                        headline.region.tuck,
                    },
                  ]}
                  pointerEvents="none"
                >
                <ThemedText numberOfLines={1} style={[styles.captionLine, headline.region.style]}>
                  {[region, visitedLine].filter(Boolean).join(" · ")}
                </ThemedText>
                </View>
              )}
            </View>
          </View>
          )}
          {ornaments}
        </>
      }
      onFlip={() => setIsFlipped(true)}
      flipLabel="Read the message"
      flipReach={FRONT_FLIP_REACH}
      onDoubleTap={handleDoubleTap}
      turnMark
    >
      <View
        style={[
          styles.picture,
          // With the caption printed under it, the picture stops being the
          // card's whole face and becomes a print at the top of it, keeping
          // its own shape. The band left below is the caption's.
          captionBelow && singlePictureRatio != null && { aspectRatio: singlePictureRatio },
        ]}
        onLayout={(e) => {
          const { width, height, y } = e.nativeEvent.layout;
          setFrame({ width, height });
          onPhotoLayout?.(y, height);
        }}
        collapsable={false}
      >
        {picture}

        {/* Over the print, under the type — see PostcardGrain. */}
        <PostcardGrain source={grainFor(grain)} />

        {/* The name is set ACROSS the picture, not above it — which means it
            needs ground of its own, because cream display type over an
            arbitrary photo is unreadable about half the time. A gradient
            rather than a flat bar, so the picture keeps going underneath. */}
        <Animated.View style={[styles.heartBurst, heartStyle]} pointerEvents="none">
          <Ionicons name="heart" size={72} color={BrandColors.cream} />
        </Animated.View>
      </View>

    </PostcardPaper>
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
    // The same sheet of card, seeded identically — turning a postcard over
    // does not change what it is printed on, so the shade and the worn edge
    // have to match the picture side exactly.
    <PostcardPaper
      sheet={sheet}
      onFlip={() => setIsFlipped(false)}
      flipLabel="Show the picture side"
      flipReach={BACK_FLIP_REACH}
      onDoubleTap={handleDoubleTap}
      turnMark
      // The written side is a dark panel, not bare card.
      turnMarkInk={TURN_MARK_PANEL_INK}
    >
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

        {/* The border turns the card back over, so only the overflow menu
            is left here. */}
        <View style={styles.backHeaderControls}>
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
          {/* Top of the address column, which is where a card actually
              carries its stamp — the picture side only gets one when the
              photo leaves a margin wide enough to stick it in. */}
          {!showFrontStamp && visit.rating != null && (
            // The badge directly, not FeedRatingStamp — that one is always
            // absolutely positioned, because its whole job on the picture
            // side is to sit crooked in a corner. Here it is stuck square
            // in the address column, which is how a stamp actually goes on.
            <RatingGlassBadgeGated
              rating={visit.rating}
              size={64}
              seed={visit.id}
              tags={visit.tags.map((tag) => tag.slug)}
              placeId={visit.placeId}
            />
          )}
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
          onToggleLike={handleToggleLike}
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
    </PostcardPaper>
  );

  return (
    <View
      style={styles.card}
      // The card is this box's full width, so measuring here measures the
      // card — and measuring the card itself would be circular, since its
      // height comes from the inset this width decides. See pictureInsetFor.
      onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
    >
      {byline}
      {/* Held back until the picture side has its pictures, then faded in.
          OPACITY rather than not rendering it: the card has to be mounted to
          load anything at all, and it has to occupy its height the whole time
          or the feed shoves itself around as each one arrives. */}
      <Animated.View style={revealStyle}>
        <PostcardFlip isFlipped={isFlipped} front={front} back={back} />
      </Animated.View>
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
  // No background and no clipping: the card underneath IS the background
  // now, and the margins the fitted picture leaves are the whole point —
  // covering them with an element colour would hide the paper the stamp and
  // stickers are supposed to be sitting on.
  picture: {
    position: "relative",
  },
  caption: {
    position: "absolute",
    // The name grows UPWARD out of its measured box (fill trades horizontal
    // compression for vertical stretch, anchored at its baseline), so the
    // clearance that matters is the gap above it, not below.
    gap: Spacing.two,
    // Reversed so the region line can be last in the tree — and so painted
    // last, over the oversize ghost — while still sitting above the name on
    // screen. See the line's own note at the call site.
    flexDirection: "column-reverse",
  },
  // Deliberately carries no colour, opacity or shadow of its own any more:
  // the region treatment supplies all three, so that this line is struck in
  // the same ink as the name above or below it and is given a ground only
  // when light type on a photograph actually needs one. A cream set here
  // would simply have been overridden on every card, and the flat 0.85
  // opacity was dimming a colour that had been chosen to match.
  captionLine: {},
  // The band the broader location line is allowed to sit in: exactly as wide
  // as the name above or below it. See the call site.
  regionRange: {
    alignSelf: "flex-start",
    // Never wider than the caption itself, whatever the name measured.
    //
    // The name's rendered width can come out slightly OVER the box it was
    // fitted to — measured at 703 against a 700pt box, from StretchText's own
    // 2pt safety margin — and StretchText's scale has a floor, so a name long
    // enough to hit it overflows its box outright. Either way this box would
    // inherit that width, and a right-aligned line inside it would be pushed
    // past the card's edge and clipped by captionLayer's overflow. Capping
    // here costs nothing in the ordinary case and removes that whole class.
    maxWidth: "100%",
  },
  // A row along the bare card under the picture. `height` is set inline to
  // whatever margin the picture actually left.
  frontStickers: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.two,
  },
  // The box the stamp anchors inside — one of the two margins the picture
  // left. Sized and sided inline.
  frontStamp: {
    position: "absolute",
  },
  // The band under a square picture on a portrait card. Flex so it takes
  // whatever the picture left, and centred in it.
  printedCaption: {
    // A direct child of the card rather than of its padded body, so it sets
    // its own margin — see the call site, which supplies both paddings.
    alignSelf: "stretch",
    gap: Spacing.one,
    // Centred through the TEXT, not through alignItems. StretchText's fill
    // mode scales the type to the width of the box it is handed, and
    // alignItems:'center' shrinks that box to the type's own width — which
    // leaves it measuring itself and scaling by one, the same trap the flex
    // version fell into.
  },
  // Everything printed over the picture, anchored to the CARD rather than to
  // the picture frame — which is what lets it cross the border, and what
  // keeps the frame ring from painting over its ends the way it did when this
  // lived inside the body.
  captionLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Clipped to the card, which nothing else on this face is.
    //
    // The name is deliberately allowed to cross off the picture and onto the
    // printed border, and the border-out treatment grows further outward
    // still from every letterform — so between them they can reach the
    // deckle. Ink stops at the edge of the card rather than carrying on onto
    // the app's own background, which reads as a rendering fault rather than
    // as something printed.
    //
    // Safe for the rest: this layer holds the name and its region line and
    // nothing else. The stamp and the stickers, which DO lean off the card on
    // purpose, are siblings of this in the footer rather than children of it.
    overflow: "hidden",
  },
  printedCaptionName: {
    textAlign: "center",
  },
  printedCaptionLine: {
    textAlign: "center",
    // The card's own ink, faded — it is a printed caption, not UI text on a
    // dark ground, so the theme's secondary cream would be invisible here.
    color: "rgba(28, 34, 24, 0.62)",
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
