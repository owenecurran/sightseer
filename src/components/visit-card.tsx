import { Ionicons } from "@expo/vector-icons";
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
import { FeedCardHeaderText } from "@/components/feed-place-photo-block";
import { PhotoGrid } from "@/components/photo-grid";
import { ThemedView } from "@/components/themed-view";
import { Avatar } from "@/components/ui/avatar";
import { VisitActionsRow } from "@/components/visit-actions-row";
import { VisitMenu } from "@/components/visit-menu";
import { BrandColors, Spacing } from "@/constants/theme";
import type { FeedVisit } from "@/lib/feed";

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

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
  // Reports where this card's photo block sits within the card (offset from
  // the card's own top, and its height). Only the trip day swiper uses it,
  // to centre its arrows on the photo rather than on the whole card — the
  // photo's position isn't derivable from outside, since the header above
  // it varies with the author line wrapping.
  onPhotoLayout?: (offsetY: number, height: number) => void;
  // Tagged-but-not-owner viewers only (see VisitMenu's own prop) — omitted
  // entirely (no "Untag yourself" option) when not supplied, which is every
  // caller except tagged-in.tsx today.
  onUntagSelf?: () => Promise<void>;
  // Passed straight through to FeedCardHeaderText — an absolute ceiling on
  // how high the rating stamp may sit. Undefined keeps the feed's own look;
  // tagged-in.tsx passes one per direct feedback that stamps sat too high
  // there.
  maxStampRise?: number;
};

// The feed's own visit card — pulled out of (tabs)/index.tsx so any other
// screen showing real visit posts (today: tagged-in.tsx) renders the exact
// same card, not a hand-copied lookalike that silently drifts the next time
// this one changes. Every interactive piece (like/comment/share, the
// author/menu row, double-tap-to-like) comes along with it, not just the
// header text/stamp the way FeedCardHeaderText alone does.
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

  const hasPhotos = visit.photoIds.length > 0;

  const header = (
    // Its own wrapper (not a bare fragment) purely so the author row and
    // the place-name block below it can sit at zero gap without also
    // collapsing the spacing between this whole block and the footer/photo
    // next to it — cardTop/card's own `gap` applies uniformly to every
    // direct child, so the two needed different containers. Zero gap is
    // deliberate: the place name's `fill` stretch grows *upward* inside its
    // own bottom-anchored box (see StretchText's fillBottom), so any gap
    // here is dead space it visibly stops short of, and per direct
    // feedback it should reach the bottom of the username instead.
    <View style={styles.headerBlock}>
      <View style={styles.headerRow}>
        <View style={styles.headerAuthor}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/user/[id]",
                params: { id: visit.user_id },
              })
            }
          >
            <Avatar uri={avatarUrl} name={visit.authorName} size={28} />
          </Pressable>
          <FeedAuthorLine
            authorId={visit.user_id}
            authorName={visit.authorName}
            taggedUsers={visit.taggedUsers}
            style={styles.headerText}
          />
        </View>
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
      <Pressable
        onPress={() =>
          router.push({ pathname: "/visit/[id]", params: { id: visit.id } })
        }
      >
        <FeedCardHeaderText
          placeName={visit.placeName}
          placeId={visit.placeId}
          stateCountry={visit.stateCountry}
          taggedPlaces={visit.taggedPlaces}
          visitedLine={[
            visit.rating == null ? "Visited" : null,
            visit.visitNumber != null && visit.visitNumber > 1
              ? `${ordinal(visit.visitNumber)} visit`
              : null,
            visit.note || null,
          ]
            .filter(Boolean)
            .join(" · ")}
          rating={visit.rating}
          stampSeed={visit.id}
          stampCanSeep={hasPhotos}
          maxStampRise={maxStampRise}
        />
      </Pressable>
    </View>
  );

  const footer = (
    <>
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
        onToggleComments={() => setIsCommentsOpen((prev) => !prev)}
      />

      {isCommentsOpen && (
        <CommentsThread
          visitId={visit.id}
          visitOwnerId={visit.user_id}
          onCountChange={setCommentCount}
        />
      )}
    </>
  );

  // No photo — one plain rounded card wrapping everything. With a photo,
  // the card splits into a top/bottom pair so the photo sits between them
  // with square edges instead of being inset inside a single rounded box.
  if (!hasPhotos) {
    return (
      <ThemedView
        type="backgroundElement"
        style={styles.card}
        collapsable={false}
      >
        {header}
        {footer}
      </ThemedView>
    );
  }

  return (
    // collapsable={false}: without it, Android's view-flattening
    // optimization can fold this plain, background-less View (a FlatList
    // renderItem's own direct output — the one structural difference from
    // visit/[id].tsx's single ThemedView card, which already has its own
    // backgroundColor and so was never a flattening candidate) into its
    // parent, which measurably broke the rating stamp's edge-of-screen
    // seep specifically inside the feed's FlatList — confirmed live: the
    // exact same seed/position math seeps correctly on the visit detail
    // page, seeded identically, so the *math* was never the difference.
    <View style={styles.cardWrap} collapsable={false}>
      <ThemedView
        type="backgroundElement"
        style={styles.cardTop}
        collapsable={false}
      >
        {header}
      </ThemedView>

      {/* Photos stay at the card's own width — no negative margin pulling
          them out to the screen edges. That full-bleed treatment existed
          here for a long time but never actually rendered (the scroll
          container clipped it at card width, same bug that pinned the
          rating stamp); once the clip was lifted it started bleeding for
          real, which read as photos spilling into the screen gutter. The
          stamp still overflows into that gutter deliberately — the point
          of this being a plain sibling View with no clipping is that the
          two are independent. */}
      <View
        onLayout={(e) =>
          onPhotoLayout?.(e.nativeEvent.layout.y, e.nativeEvent.layout.height)
        }
      >
        {(() => {
          const photos = visit.photoIds
            .map((id, i) => ({
              id,
              url: photoUrls[id],
              ratio: visit.photoAspectRatios[i],
            }))
            .filter(
              (p): p is { id: string; url: string; ratio: number | null } => p.url != null,
            );
          return (
            <PhotoGrid
              urls={photos.map((p) => p.url)}
              thumbUrls={
                photoThumbUrls ? photos.map((p) => photoThumbUrls[p.id] ?? p.url) : undefined
              }
              aspectRatios={photos.map((p) => p.ratio)}
              onDoubleTap={handleDoubleTap}
            />
          );
        })()}
        <Animated.View
          style={[styles.heartBurst, heartStyle]}
          pointerEvents="none"
        >
          <Ionicons name="heart" size={72} color={BrandColors.cream} />
        </Animated.View>
      </View>

      <ThemedView type="backgroundElement" style={styles.cardBottom}>
        {footer}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  // position:'relative' on this and cardTop below: FeedRatingStamp
  // positions itself absolutely against whichever of these is its nearest
  // ancestor, and deliberately leans *past* their edges (a real stamp stuck
  // crooked on an envelope corner) — nothing here clips overflow, which is
  // what actually lets that show instead of getting cut off at the card's
  // own bounds.
  card: {
    position: "relative",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  cardWrap: {
    gap: Spacing.two,
  },
  // Split top/bottom instead of one wrapping card so the photo between them
  // can bleed past the rounded card edges all the way to the screen edges —
  // a single rounded box can't do that without either clipping the photo or
  // showing background peeking out around its corners.
  cardTop: {
    position: "relative",
    // Needed for the rating stamp (nested inside this block's own
    // FeedCardHeaderText) to actually paint in front of the photo View
    // below when it seeps into it, not behind it — that photo is a later
    // *sibling* of this whole block (both direct children of cardWrap),
    // and zIndex only resolves stacking among elements sharing one
    // immediate parent, so the stamp's own zIndex (scoped to its
    // grandparent FeedCardHeaderText) can't win that fight on its own.
    zIndex: 2,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
    borderTopLeftRadius: Spacing.three,
    borderTopRightRadius: Spacing.three,
    gap: Spacing.two,
  },
  // paddingVertical (not a smaller top / bigger bottom split) — the split
  // version left the actions row sitting visibly closer to its top edge
  // than its bottom whenever comments aren't open (its only content most
  // of the time), reading as off-center within this segment.
  cardBottom: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomLeftRadius: Spacing.three,
    borderBottomRightRadius: Spacing.three,
    gap: Spacing.two,
  },
  // See the `header` JSX's own comment — zero gap so the place name's
  // upward stretch lands against the username row rather than stopping
  // short of it.
  headerBlock: {
    gap: 0,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.two,
  },
  headerAuthor: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
  heartBurst: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
});
