import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { CommentsThread } from "@/components/comments-section";
import { DiscoverView } from "@/components/discover-view";
import { FeedAuthorLine } from "@/components/feed-author-line";
import { FeedCardHeaderText } from "@/components/feed-place-photo-block";
import { FeedSwitcher, type FeedMode } from "@/components/feed-switcher";
import { PhotoGrid } from "@/components/photo-grid";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Avatar } from "@/components/ui/avatar";
import { FeedRatingStamp } from "@/components/ui/feed-rating-stamp";
import { LoadableImage } from "@/components/ui/loadable-image";
import { PageLoader } from "@/components/ui/page-loader";
import { VisitActionsRow } from "@/components/visit-actions-row";
import { VisitMenu } from "@/components/visit-menu";
import {
  BrandColors,
  MaxContentWidth,
  Spacing,
  TopTabInset,
} from "@/constants/theme";
import { useBottomTabInset } from "@/hooks/use-bottom-tab-inset";
import { useHideOnScrollHandler } from "@/hooks/use-hide-on-scroll";
import { useTabFocusEffect } from "@/hooks/use-tab-pager";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth-context";
import { getAvatarViewUrls } from "@/lib/avatar";
import {
  getFeedItems,
  likeVisit,
  unlikeVisit,
  type FeedItem,
  type FeedVisit,
} from "@/lib/feed";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { getPhotoViewUrls } from "@/lib/photo-view";
import { shareText } from "@/lib/share";
import { supabase } from "@/lib/supabase";
import { getRecapCoverUrls, type FeedRecap } from "@/lib/travel-book-recaps";

function ordinal(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return `${n}st`;
  if (j === 2 && k !== 12) return `${n}nd`;
  if (j === 3 && k !== 13) return `${n}rd`;
  return `${n}th`;
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  const [viewMode, setViewMode] = useState<FeedMode>("feed");
  const [items, setItems] = useState<FeedItem[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [recapCoverUrls, setRecapCoverUrls] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [copiedVisitId, setCopiedVisitId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Captured once per screen focus, before feed_last_viewed_at gets bumped
  // to now() below — this is the boundary "already seen" divider needs.
  const [previousViewedAt] = useState(
    () => profile?.feed_last_viewed_at ?? null,
  );
  const scrollHandler = useHideOnScrollHandler();

  const loadFeed = useCallback(async () => {
    if (!session) return;
    setError(null);
    try {
      const feedItems = await getFeedItems(session.user.id);
      setItems(feedItems);
      const feedVisits = feedItems.flatMap((item) =>
        item.type === "visit" ? [item.visit] : [],
      );
      const feedRecaps = feedItems.flatMap((item) =>
        item.type === "recap" ? [item.recap] : [],
      );
      const photoIds = feedVisits.flatMap((v) => v.photoIds);
      const authorIds = [
        ...new Set([
          ...feedVisits.map((v) => v.user_id),
          ...feedRecaps.map((r) => r.authorId),
        ]),
      ];
      const [photos, avatars, recapCovers] = await Promise.all([
        photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
        authorIds.length > 0
          ? getAvatarViewUrls(authorIds)
          : Promise.resolve({}),
        feedRecaps.length > 0
          ? getRecapCoverUrls(feedRecaps.map((r) => r.id))
          : Promise.resolve({}),
      ]);
      setPhotoUrls(photos);
      setAvatarUrls(avatars);
      setRecapCoverUrls(recapCovers);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your feed.",
      );
    }
  }, [session]);

  // Refetch on every focus, not just on mount — tab navigators (native: a
  // PagerView, all 5 tabs mounted at once; web: a real Stack) keep sibling
  // screens mounted, so a plain useEffect(...,[session]) would never notice
  // a follow made on the People tab without this. See use-tab-pager.ts for
  // why this isn't plain useFocusEffect anymore.
  useTabFocusEffect(
    0,
    useCallback(() => {
      setIsLoading(true);
      loadFeed().finally(() => {
        setIsLoading(false);
        setHasLoadedOnce(true);
      });
      if (session) {
        getUnreadNotificationCount(session.user.id)
          .then(setUnreadCount)
          .catch(() => {});
        // Fire-and-forget — bumps the boundary for the *next* visit.
        // previousViewedAt (captured once at mount) stays fixed for this
        // whole session, so the divider doesn't jump around as the user
        // swipes between tabs and back.
        supabase
          .from("users")
          .update({ feed_last_viewed_at: new Date().toISOString() })
          .eq("id", session.user.id)
          .then(
            () => {},
            () => {},
          );
      }
    }, [loadFeed, session]),
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadFeed();
    setIsRefreshing(false);
  }

  async function handleToggleLike(visit: FeedVisit) {
    if (!session) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(session.user.id, visit.id);
      } else {
        await likeVisit(session.user.id, visit.id);
      }
      setItems((prev) =>
        prev.map((item) =>
          item.type === "visit" && item.visit.id === visit.id
            ? {
                ...item,
                visit: {
                  ...item.visit,
                  isLikedByMe: !item.visit.isLikedByMe,
                  likeCount:
                    item.visit.likeCount + (item.visit.isLikedByMe ? -1 : 1),
                },
              }
            : item,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update that like.",
      );
    }
  }

  function handleVisitDeleted(visitId: string) {
    setItems((prev) =>
      prev.filter(
        (item) => !(item.type === "visit" && item.visit.id === visitId),
      ),
    );
  }

  async function handleShareVisit(visit: FeedVisit) {
    const message = `${visit.authorName} ${visit.rating != null ? `rated ${visit.placeName} ${visit.rating.toFixed(1)}/10` : `visited ${visit.placeName}`}${
      visit.note ? `: "${visit.note}"` : ""
    } on Sightseer.`;
    const result = await shareText(message);

    if (result === "unsupported") {
      setError("Sharing is not supported in this browser.");
      return;
    }
    if (result === "error") {
      setError("Could not copy that visit — please try again.");
      return;
    }
    if (result === "copied") {
      setCopiedVisitId(visit.id);
      setTimeout(
        () =>
          setCopiedVisitId((current) =>
            current === visit.id ? null : current,
          ),
        2000,
      );
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  // Splice a divider in right before the first item posted before this
  // viewer's last feed visit — skipped entirely on a first-ever visit
  // (previousViewedAt null) or when nothing's new since last time (boundary
  // at index 0, which would just be a pointless divider at the very top).
  const displayItems: FeedItem[] = (() => {
    if (!previousViewedAt) return items;
    const boundaryIndex = items.findIndex(
      (item) => item.sortKey <= previousViewedAt,
    );
    if (boundaryIndex <= 0) return items;
    return [
      ...items.slice(0, boundaryIndex),
      { type: "divider", sortKey: "" } as const,
      ...items.slice(boundaryIndex),
    ];
  })();

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.screenHeaderRow, styles.gutter]}>
          <ThemedText type="displaySerif">Feed</ThemedText>
          <Pressable
            onPress={() => router.push("/notifications")}
            hitSlop={8}
            style={styles.bellButton}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={theme.text}
            />
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <ThemedText
                  type="small"
                  themeColor="background"
                  style={styles.badgeText}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </ThemedText>
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.gutter}>
          <FeedSwitcher active={viewMode} onChange={setViewMode} />
        </View>

        {error && (
          <ThemedText
            type="small"
            themeColor="textSecondary"
            style={styles.gutter}
          >
            {error}
          </ThemedText>
        )}

        {viewMode === "discover" ? (
          <View style={[styles.discoverWrap, styles.gutter]}>
            <DiscoverView />
          </View>
        ) : (
          <>
            {!isLoading && items.length === 0 && (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.gutter}
              >
                No visits yet from people you follow. Follow someone from the
                People tab, or check back once they log a visit.
              </ThemedText>
            )}

            {
              // Plain ScrollView + .map(), not FlatList — deliberately.
              // FlatList virtualizes/recycles cells, which on Android
              // structurally requires clipping each cell to its own
              // measured rect (so recycled views don't visually bleed into
              // a neighbor during scroll) — that's a real clipping layer
              // inside FlatList's own cell wrapper, not reachable via
              // styles on cardTop/cardWrap, and (confirmed live) not
              // avoidable via a custom CellRendererComponent either:
              // reanimated's Animated.FlatList didn't actually forward it
              // through to the real FlatList at runtime, despite
              // compiling fine. A plain ScrollView never recycles views,
              // so nothing here structurally needs to clip — the same
              // reason the stamp's overflow already works correctly on
              // visit/[id].tsx's plain ScrollView. Fine performance-wise
              // at this app's current feed scale (a personal social feed,
              // not an infinite-scroll timeline); worth revisiting if the
              // feed ever needs to hold hundreds+ of items at once.
            }
            <Animated.ScrollView
              contentContainerStyle={[
                styles.list,
                { paddingBottom: bottomInset },
              ]}
              showsVerticalScrollIndicator={false}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  tintColor={theme.sage}
                />
              }
            >
              {displayItems.map((item: FeedItem) =>
                item.type === "divider" ? (
                  <ThemedText
                    key="divider"
                    type="sectionLabel"
                    style={styles.dividerText}
                  >
                    Already seen
                  </ThemedText>
                ) : item.type === "recap" ? (
                  <RecapCard
                    key={`recap-${item.recap.id}`}
                    recap={item.recap}
                    avatarUrl={avatarUrls[item.recap.authorId]}
                    coverUrl={recapCoverUrls[item.recap.id]}
                  />
                ) : (
                  <VisitCard
                    key={`visit-${item.visit.id}`}
                    visit={item.visit}
                    photoUrls={photoUrls}
                    avatarUrl={avatarUrls[item.visit.user_id]}
                    isOwner={session?.user.id === item.visit.user_id}
                    isCopied={copiedVisitId === item.visit.id}
                    onToggleLike={() => handleToggleLike(item.visit)}
                    onShare={() => handleShareVisit(item.visit)}
                    onDeleted={() => handleVisitDeleted(item.visit.id)}
                  />
                ),
              )}
            </Animated.ScrollView>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

type VisitCardProps = {
  visit: FeedVisit;
  photoUrls: Record<string, string>;
  avatarUrl?: string;
  isOwner: boolean;
  isCopied: boolean;
  onToggleLike: () => void;
  onShare: () => void;
  onDeleted: () => void;
};

function VisitCard({
  visit,
  photoUrls,
  avatarUrl,
  isOwner,
  isCopied,
  onToggleLike,
  onShare,
  onDeleted,
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
    <>
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
            visit.visitNumber > 1
              ? `${ordinal(visit.visitNumber)} visit`
              : null,
            visit.note || null,
          ]
            .filter(Boolean)
            .join(" · ")}
          rating={visit.rating}
          stampSeed={visit.id}
          stampCanSeep={hasPhotos}
        />
      </Pressable>
    </>
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
      <View>
        {(() => {
          const photos = visit.photoIds
            .map((id, i) => ({
              url: photoUrls[id],
              ratio: visit.photoAspectRatios[i],
            }))
            .filter(
              (p): p is { url: string; ratio: number | null } => p.url != null,
            );
          return (
            <PhotoGrid
              urls={photos.map((p) => p.url)}
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

function RecapCard({
  recap,
  avatarUrl,
  coverUrl,
}: {
  recap: FeedRecap;
  avatarUrl?: string;
  coverUrl?: string;
}) {
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/travel-book/[id]",
          params: { id: recap.travelBookId },
        })
      }
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        {recap.rating != null && (
          <FeedRatingStamp
            rating={recap.rating}
            seed={recap.travelBookId}
            canSeep={!!coverUrl}
          />
        )}
        <View style={styles.headerRow}>
          <View style={styles.headerAuthor}>
            <Avatar uri={avatarUrl} name={recap.authorName} size={28} />
            <ThemedText type="smallBold" style={styles.headerText}>
              {recap.authorName} shared a trip recap
            </ThemedText>
          </View>
        </View>
        {coverUrl && (
          <LoadableImage source={{ uri: coverUrl }} style={styles.recapCover} />
        )}
        <ThemedText type="headline">{recap.title}</ThemedText>
        {recap.body && (
          <ThemedText type="small" numberOfLines={3}>
            {recap.body}
          </ThemedText>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Deliberately NO paddingHorizontal here — that inset lives on each child
  // instead (`gutter` below, and `list` for the scroll content). Putting it
  // here pushed the *ScrollView's own bounds* inward to exactly the cards'
  // edges, and Android clips a scroll container's content to its bounds —
  // so anything designed to extend past a card (the rating stamp leaning
  // off the corner, and `photoBreakout`'s full-bleed photos, which were
  // silently rendering at plain card width the whole time) got cut off at
  // precisely the card edge. With the inset moved inside, the ScrollView
  // spans the full column and that 24px gutter is ordinary in-bounds space
  // those elements can legitimately overflow into.
  safeArea: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  // The horizontal inset safeArea used to apply to everything at once —
  // now applied per-child so the scroll container itself can stay
  // full-width (see safeArea above).
  gutter: {
    paddingHorizontal: Spacing.four,
  },
  // DiscoverView used to be a direct flex child of safeArea; wrapping it to
  // apply the gutter would otherwise collapse it to its content height.
  discoverWrap: {
    flex: 1,
  },
  screenHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dividerText: {
    textAlign: "center",
  },
  bellButton: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BrandColors.sage,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
  // paddingBottom belongs on the FlatList's own scrollable content, not
  // this non-scrolling wrapper — putting it here (as it used to be) only
  // shrinks the FlatList's viewport height, it doesn't add space the list
  // can actually scroll into, so the last card had no clearance from the
  // floating nav bar once you scrolled all the way down.
  list: {
    gap: Spacing.three,
    // See safeArea — the cards' horizontal inset lives here, inside the
    // ScrollView's own clip bounds, so overflow past a card edge lands in
    // ordinary in-bounds space instead of being clipped away.
    paddingHorizontal: Spacing.four,
  },
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
  recapCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
});
