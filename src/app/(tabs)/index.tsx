import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import type { ScrollView } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { DiscoverView, type DiscoverViewHandle } from "@/components/discover-view";
import { DealIn } from "@/components/ui/deal-in";
import { ScrollStageProvider, useScrollStage } from "@/components/ui/scroll-stage";
import { JourneyLine } from "@/components/ui/journey-line";
import { KeyboardAwareScroll } from "@/components/keyboard-aware-scroll";
import { FeedSwitcher, type FeedMode } from "@/components/feed-switcher";
import { ThemedText } from "@/components/themed-text";
import { PaperPanel } from "@/components/ui/paper-panel";
import { ThemedView } from "@/components/themed-view";
import { HomeLocationPrompt } from "@/components/home-location-prompt";
import { TripSuggestionPrompt } from "@/components/trip-suggestion-prompt";
import { TripGroupCard } from "@/components/trip-group-card";
import { Avatar } from "@/components/ui/avatar";
import { FeedRatingStamp } from "@/components/ui/feed-rating-stamp";
import { LoadableImage } from "@/components/ui/loadable-image";
import { PageLoader } from "@/components/ui/page-loader";
import { VisitCard } from "@/components/visit-card";
import {
  BrandColors,
  MaxContentWidth,
  Spacing,
} from "@/constants/theme";
import { useBottomTabInset } from "@/hooks/use-bottom-tab-inset";
import { useHideOnScrollHandler, useNavBarHidden } from "@/hooks/use-hide-on-scroll";
import { useTabFocusEffect, useTabRetapEffect } from "@/hooks/use-tab-pager";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/lib/auth-context";
import { journeyItemId, journeyStop } from "@/lib/journey";
import { getAvatarViewUrls } from "@/lib/avatar";
import {
  getFeedItems,
  likeVisit,
  unlikeVisit,
  type FeedItem,
  type FeedVisit,
} from "@/lib/feed";
import { listHomeLocations } from "@/lib/home-locations";
import { getUnreadNotificationCount } from "@/lib/notifications";
import { getPhotoUrls } from "@/lib/photo-view";
import { shareText } from "@/lib/share";
import { supabase } from "@/lib/supabase";
import { getRecapCoverUrls, type FeedRecap } from "@/lib/travel-book-recaps";
import {
  getHomeLocationSuggestion,
  getTripSuggestion,
  type HomeLocationSuggestion,
  type TripSuggestion,
} from "@/lib/trips";

// Generous enough for the title row plus the switcher; maxHeight only ever
// clips when collapsing, so overshooting costs nothing while a value that's
// too small would crop the header at rest.
const HEADER_MAX_HEIGHT = 140;
// The screen's own background, as solid as the status bar needs.
const STATUS_SCRIM = "rgba(3, 16, 9, 0.85)";
const INITIAL_FEED_ROWS = 5;
const FEED_BATCH_SIZE = 3;
const FEED_BATCH_INTERVAL_MS = 48;
const INITIAL_THUMBNAILS = 10;

function initialPhotoIds(items: FeedItem[]): string[] {
  return items.slice(0, INITIAL_FEED_ROWS).flatMap((item) => {
    if (item.type === "visit") return item.visit.photoIds;
    if (item.type !== "trip") return [];
    return item.feedTrip.days.slice(-3).flatMap((day) => day.visits[0]?.photoIds ?? []);
  }).slice(0, INITIAL_THUMBNAILS);
}

export default function HomeScreen() {
  const { session, profile } = useAuth();
  return <HomeFeedScreen key={session?.user.id} viewerId={session?.user.id} viewedAt={profile?.feed_last_viewed_at} />;
}

function HomeFeedScreen({ viewerId, viewedAt }: { viewerId?: string; viewedAt?: string | null }) {
  const theme = useTheme();
  const bottomInset = useBottomTabInset();
  // Which tab this launch opens on is DERIVED below, from whether the feed
  // actually has anything new in it. This holds only an explicit choice.
  //
  // Null until the switcher is touched, so the derived answer keeps applying
  // until somebody overrules it — and once they have, their choice stands for
  // the rest of the session rather than being quietly re-decided underneath
  // them on the next reload.
  const [pickedMode, setPickedMode] = useState<FeedMode | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  // "You've been in X a while — is this home now?" Null unless the viewer's
  // own ongoing trip has run long enough to be worth asking about.
  const [homeSuggestion, setHomeSuggestion] = useState<HomeLocationSuggestion | null>(null);
  // A trip suggestion the user saw after publishing but never answered —
  // ignoring it writes nothing, so it resurfaces here. An explicit "Not a
  // trip" is the only thing that stops it coming back.
  const [tripSuggestion, setTripSuggestion] = useState<TripSuggestion | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoThumbUrls, setPhotoThumbUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [recapCoverUrls, setRecapCoverUrls] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [startupPainted, setStartupPainted] = useState(false);
  const [renderedRows, setRenderedRows] = useState(INITIAL_FEED_ROWS);
  const loadInFlight = useRef<Promise<boolean> | null>(null);
  const startupFrame = useRef<number | null>(null);
  const [copiedVisitId, setCopiedVisitId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  // Captured once per screen focus, before feed_last_viewed_at gets bumped
  // to now() below — this is the boundary "already seen" divider needs.
  const [previousViewedAt] = useState(() => viewedAt ?? null);
  // Where each card and route in the feed is on screen, for the cards
  // dealt in as they arrive and the routes drawn between them.
  const feedScrollRef = useRef<ScrollView>(null);
  const { stage, scrollProps } = useScrollStage(feedScrollRef);
  const scrollHandler = useHideOnScrollHandler(stage.scrollY);
  // Same shared value the floating nav bar reads, so the top header and the
  // bottom bar collapse and return together instead of drifting apart.
  const navHidden = useNavBarHidden();
  // The status bar's height. Padded inside the header rather than around the
  // screen, so it collapses with the header (see headerSpace).
  const insets = useSafeAreaInsets();
  // Height is animated (not just opacity) so the feed actually reclaims the
  // space — fading it out alone would leave a dead gap at the top. The
  // header carries all the space above the feed, the status bar included;
  // it used to sit on safeArea, where it never collapsed.
  //
  // The padding collapses with it, because a maxHeight of 0 cannot take a
  // view below its own padding: the space for the status bar stayed, and
  // left the feed cut off a band below the top of the screen.
  const headerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(navHidden.value, [0, 1], [1, 0]),
    maxHeight: interpolate(navHidden.value, [0, 1], [HEADER_MAX_HEIGHT + insets.top, 0]),
    paddingTop: interpolate(navHidden.value, [0, 1], [insets.top + Spacing.four, 0]),
    paddingBottom: interpolate(navHidden.value, [0, 1], [Spacing.three, 0]),
    transform: [{ translateY: interpolate(navHidden.value, [0, 1], [0, -12]) }],
  }));

  const loadFeed = useCallback((): Promise<boolean> => {
    if (!viewerId) return Promise.resolve(false);
    if (loadInFlight.current) return loadInFlight.current;

    setError(null);
    const request = (async () => {
      try {
        const feedItems = await getFeedItems(viewerId);
        const visits = feedItems.flatMap((item) => {
          if (item.type === "visit") return [item.visit];
          if (item.type === "trip") return item.feedTrip.days.flatMap((day) => day.visits);
          return [];
        });
        const recaps = feedItems.flatMap((item) => item.type === "recap" ? [item.recap] : []);
        const authorIds = [...new Set([
          ...visits.map((visit) => visit.user_id),
          ...recaps.map((recap) => recap.authorId),
        ])];
        const orderedPhotoIds = [...new Set([
          ...initialPhotoIds(feedItems),
          ...visits.flatMap((visit) => visit.photoIds),
        ])];

        // The feed can still show its text and maps if a media service fails.
        const [photoResult, avatarResult, coverResult] = await Promise.allSettled([
          getPhotoUrls(orderedPhotoIds),
          getAvatarViewUrls(authorIds),
          getRecapCoverUrls(recaps.map((recap) => recap.id)),
        ]);

        if (photoResult.status === "fulfilled") {
          const { photos, thumbs } = photoResult.value;
          setPhotoUrls(photos);
          setPhotoThumbUrls(thumbs);
        }
        if (avatarResult.status === "fulfilled") setAvatarUrls(avatarResult.value);
        if (coverResult.status === "fulfilled") setRecapCoverUrls(coverResult.value);
        setItems(feedItems);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your feed.");
        return false;
      } finally {
        loadInFlight.current = null;
        setHasLoadedOnce(true);
      }
    })();

    loadInFlight.current = request;
    return request;
  }, [viewerId]);

  // Keep the startup loader over the first batch until the rows have laid
  // out and had a frame to paint. The rest mount while the feed is idle.
  const handleInitialLayout = useCallback(() => {
    if (startupPainted || startupFrame.current != null) return;
    startupFrame.current = requestAnimationFrame(() => {
      startupFrame.current = requestAnimationFrame(() => {
        startupFrame.current = null;
        setStartupPainted(true);
      });
    });
  }, [startupPainted]);

  useEffect(() => () => {
    if (startupFrame.current != null) cancelAnimationFrame(startupFrame.current);
  }, []);

  async function reloadAfterChange() {
    await loadInFlight.current;
    await loadFeed();
  }

  // Refetch on every focus, not just on mount — tab navigators (native: a
  // PagerView, all 5 tabs mounted at once; web: a real Stack) keep sibling
  // screens mounted, so a plain useEffect(...,[session]) would never notice
  // a follow made on the People tab without this. See use-tab-pager.ts for
  // why this isn't plain useFocusEffect anymore.
  useTabFocusEffect(
    0,
    useCallback(() => {
      setIsLoading(true);
      const viewedAt = new Date().toISOString();
      void loadFeed().then((loaded) => {
        setIsLoading(false);
        if (!loaded || !viewerId) return;
        // Mark only after a successful load. Its starting timestamp leaves
        // posts published during the request eligible for the next session.
        void supabase
          .from("users")
          .update({ feed_last_viewed_at: viewedAt })
          .eq("id", viewerId)
          .then(() => {}, () => {});
      });
      if (viewerId) {
        // Best-effort and independent of the feed itself — a failure here
        // just means no prompt, never a broken feed.
        // Re-offer the most recent unanswered day. Checked against today
        // and yesterday only: a suggestion for a day last month has been
        // passed over enough times to count as declined in spirit.
        (async () => {
          const now = new Date();
          for (const daysAgo of [0, 1]) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            const found = await getTripSuggestion(viewerId, key);
            if (found) return found;
          }
          return null;
        })()
          .then(setTripSuggestion)
          .catch(() => setTripSuggestion(null));

        listHomeLocations(viewerId)
          .then((homes) =>
            getHomeLocationSuggestion(
              viewerId,
              homes.map((h) => h.placeId),
            ),
          )
          .then(setHomeSuggestion)
          .catch(() => setHomeSuggestion(null));
        getUnreadNotificationCount(viewerId)
          .then(setUnreadCount)
          .catch(() => {});
      }
    }, [loadFeed, viewerId]),
  );

  async function handleRefresh() {
    setIsRefreshing(true);
    await loadFeed();
    setIsRefreshing(false);
  }

  const discoverRef = useRef<DiscoverViewHandle>(null);

  // Tapping Home while already on Home: back to the top, and fetch again.
  //
  // Both refs are addressed without asking which half is showing, because
  // the two are rendered in an either/or below — whichever is not on screen
  // is not mounted, so its ref is null and its line here does nothing. That
  // is one fewer copy of the feed/discover decision to keep in step with the
  // real one.
  //
  // The feed is reloaded either way. It is the Home tab's own data, and
  // having it already fresh behind Discover is the point of asking.
  useTabRetapEffect(0, () => {
    feedScrollRef.current?.scrollTo({ y: 0, animated: true });
    discoverRef.current?.refresh();
    void handleRefresh();
  });

  const handleToggleLike = useCallback(async (visit: FeedVisit) => {
    if (!viewerId) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(viewerId, visit.id);
      } else {
        await likeVisit(viewerId, visit.id);
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
  }, [viewerId]);

  // Flips a trip block from "Make this a travel book" to a link to the new
  // book without refetching the whole feed — the trip's grouping and
  // contents haven't changed, only what it's now linked to.
  const handleTripConverted = useCallback((tripKey: string, travelBookId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.type === "trip" && item.feedTrip.trip.key === tripKey
          ? {
              ...item,
              feedTrip: {
                ...item.feedTrip,
                trip: { ...item.feedTrip.trip, travelBookId },
              },
            }
          : item,
      ),
    );
  }, []);

  const handleVisitDeleted = useCallback((visitId: string) => {
    setItems((prev) =>
      prev.filter(
        (item) => !(item.type === "visit" && item.visit.id === visitId),
      ),
    );
  }, []);

  const handleShareVisit = useCallback(async (visit: FeedVisit) => {
    const message = `${visit.authorName} ${visit.rating != null ? `rated ${visit.placeName} ${visit.rating.toFixed(1)}/10` : `visited ${visit.placeName}`}${
      visit.note ? `: "${visit.note}"` : ""
    } on Sightseer.`;
    const result = await shareText(message);

    if (result === "unsupported") {
      setError("Sharing is not supported in this browser.");
      return;
    }
    if (result === "error") {
      setError("Could not copy that visit. Please try again.");
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
  }, []);

  // Discover only when the people you follow have nothing new.
  //
  // It used to open on Discover whenever the tutorial had not been seen,
  // which stood in for "brand new account". That proxy drifted: an account
  // that skipped the tutorial, or predates the flag, never sets it — so the
  // app opened on Discover more or less every launch, for people with a feed
  // full of posts they had not read.
  //
  // The real question is the one the feed can answer directly: is there
  // anything here I have not seen? Same test the divider below uses, so the
  // tab that opens and the line marking where you left off can never
  // disagree.
  //
  // Decided after the load rather than at mount, which costs nothing: the
  // screen is already behind PageLoader until hasLoadedOnce, so the answer
  // arrives before either tab has been drawn. No flash, no switch.
  //
  // A viewer who has never opened the feed has no boundary to compare
  // against, so "anything at all" is the test — a brand-new account follows
  // nobody, gets an empty feed, and still lands on Discover, which is what
  // the old rule was really for.
  const hasUnseenFromFollows =
    previousViewedAt == null
      ? items.length > 0
      : items.some((item) => item.sortKey > previousViewedAt);
  const viewMode: FeedMode = pickedMode ?? (hasUnseenFromFollows ? "feed" : "discover");

  // Splice a divider in right before the first item posted before this
  // viewer's last feed visit — skipped entirely on a first-ever visit
  // (previousViewedAt null) or when nothing's new since last time (boundary
  // at index 0, which would just be a pointless divider at the very top).
  const displayItems = useMemo<FeedItem[]>(() => {
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
  }, [items, previousViewedAt]);

  // Reuse existing row elements while the startup batches append new ones.
  const feedRows = useMemo(() => displayItems.map((item, index) => (
    // Descending zIndex, one wrapper per card. The rating stamp
    // hangs below its card by design (canSeep lets bottomOffset
    // go to -size*0.45), and on a short post that overhang clears
    // the card's own bottom entirely and lands over the NEXT
    // card. Neither the stamp's own zIndex nor cardTop's could
    // ever fix that: both are scoped inside one card, and zIndex
    // only resolves stacking among elements sharing an immediate
    // parent. Cards are siblings HERE, so here is the only place
    // the order between them can be decided.
    //
    // Descending rather than a flat value because siblings paint
    // in document order by default — every card must outrank the
    // one after it, not merely tie with it.
    //
    // collapsable={false} is load-bearing, not defensive: on
    // Android a View whose only job is a style like this is
    // exactly what the view-flattening pass removes, and it was
    // flattening that broke the stamp's seep before (see
    // visit-card.tsx's cardWrap). A removed wrapper takes the
    // zIndex with it and the bug returns, silently and only on
    // Android.
    <View
      key={
        item.type === "divider"
          ? "divider"
          : item.type === "recap"
            ? `recap-${item.recap.id}`
            : item.type === "trip"
              ? `trip-${item.feedTrip.trip.key}`
              : `visit-${item.visit.id}`
      }
      style={{ zIndex: displayItems.length - index }}
      collapsable={false}
    >
      {/* The route from the post above to this one, or a tear
          line where there is no route to draw. Not before the
          first, and not around the "Already seen" label, which
          is a boundary in its own right and does not want a
          second rule stacked on it. */}
      {index > 0 &&
        item.type !== "divider" &&
        displayItems[index - 1]?.type !== "divider" && (
          <JourneyLine
            from={journeyStop(displayItems[index - 1], "last")}
            to={journeyStop(item, "first")}
            seed={`${journeyItemId(displayItems[index - 1])}-${journeyItemId(item)}`}
            style={styles.journey}
          />
        )}

      {item.type === "divider" ? (
        <ThemedText type="sectionLabel" style={styles.dividerText}>
          Already seen
        </ThemedText>
      ) : item.type === "recap" ? (
        <DealIn seed={item.recap.id}>
          <RecapCard
            recap={item.recap}
            avatarUrl={avatarUrls[item.recap.authorId]}
            coverUrl={recapCoverUrls[item.recap.id]}
          />
        </DealIn>
      ) : item.type === "trip" ? (
        <DealIn seed={item.feedTrip.trip.key}>
          <TripGroupCard
            feedTrip={item.feedTrip}
            photoUrls={photoUrls}
            photoThumbUrls={photoThumbUrls}
            avatarUrls={avatarUrls}
            viewerId={viewerId}
            copiedVisitId={copiedVisitId}
            onToggleLike={handleToggleLike}
            onShare={handleShareVisit}
            onVisitDeleted={handleVisitDeleted}
            onConverted={handleTripConverted}
          />
        </DealIn>
      ) : (
        <DealIn seed={item.visit.id}>
          <VisitCard
            visit={item.visit}
            photoUrls={photoUrls}
            photoThumbUrls={photoThumbUrls}
            preferPhotoThumbnails
            avatarUrl={avatarUrls[item.visit.user_id]}
            isOwner={viewerId === item.visit.user_id}
            isCopied={copiedVisitId === item.visit.id}
            onToggleLike={() => handleToggleLike(item.visit)}
            onShare={() => handleShareVisit(item.visit)}
            onDeleted={() => handleVisitDeleted(item.visit.id)}
          />
        </DealIn>
      )}
    </View>
  )), [
    avatarUrls, copiedVisitId, displayItems, handleShareVisit, handleToggleLike,
    handleTripConverted, handleVisitDeleted, photoThumbUrls, photoUrls,
    recapCoverUrls, viewerId,
  ]);

  useEffect(() => {
    if (!startupPainted || viewMode !== "feed" || renderedRows >= displayItems.length) return;
    const timer = setTimeout(() => {
      startTransition(() => setRenderedRows((count) => count + FEED_BATCH_SIZE));
    }, FEED_BATCH_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [displayItems.length, renderedRows, startupPainted, viewMode]);

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      {/* Neither the top nor the bottom: the header pads itself below the
          status bar and the list pads its own end above the gesture bar, so
          once the header has collapsed the feed runs to both edges of the
          screen. */}
      <SafeAreaView edges={["left", "right"]} style={styles.safeArea} onLayout={handleInitialLayout}>
        <Animated.View style={headerStyle}>
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
          <FeedSwitcher active={viewMode} onChange={setPickedMode} />
        </View>
        </Animated.View>

        {error && (
          <ThemedText
            type="small"
            themeColor="danger"
            style={[styles.gutter, styles.notice]}
          >
            {error}
          </ThemedText>
        )}

        {viewMode === "discover" ? (
          <View style={styles.discoverWrap}>
            <DiscoverView ref={discoverRef} />
          </View>
        ) : (
          <>
            {!isLoading && items.length === 0 && (
              <ThemedText
                type="caption"
                style={[styles.gutter, styles.notice]}
              >
                {/* "From the People tab" used to close this sentence, and
                    there is no People tab -- the five are Home, Search,
                    Create, Boards and Profile. People are found under
                    Search. */}
                No visits yet from people you follow. Find people to follow
                in Search, or check back once they log a visit.
              </ThemedText>
            )}

            {/* A single scroll container preserves the stamp overlap on
                Android and keeps the inline comment input keyboard-aware. */}
            <ScrollStageProvider stage={stage}>
            <KeyboardAwareScroll
              ref={feedScrollRef}
              {...scrollProps}
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
              {tripSuggestion && viewerId && (
                <TripSuggestionPrompt
                  userId={viewerId}
                  suggestion={tripSuggestion}
                  onResolved={(promoted) => {
                    setTripSuggestion(null);
                    // Accepting changes what's a trip, so the grouping has
                    // to be recomputed; declining changes nothing visible.
                    if (promoted) void reloadAfterChange();
                  }}
                />
              )}

              {homeSuggestion && (
                <HomeLocationPrompt
                  suggestion={homeSuggestion}
                  onResolved={() => {
                    setHomeSuggestion(null);
                    // Adding a home location changes what counts as a trip,
                    // so the grouping has to be recomputed rather than just
                    // hiding the prompt.
                    void reloadAfterChange();
                  }}
                />
              )}
              {feedRows.slice(0, renderedRows)}
            </KeyboardAwareScroll>
            </ScrollStageProvider>
          </>
        )}
      </SafeAreaView>
      {/* What scrolls up under the status bar fades into it, so the clock
          and battery stay readable over a bright photograph or the cream of
          a card. Solid behind the bar, then gone a little below it: past
          that, the screen's own edge does the cutting. */}
      <LinearGradient
        pointerEvents="none"
        colors={[STATUS_SCRIM, STATUS_SCRIM, "rgba(3, 16, 9, 0)"]}
        locations={[0, 0.55, 1]}
        style={[styles.statusScrim, { height: insets.top * 1.8 }]}
      />
      {!startupPainted && (
        <View style={StyleSheet.absoluteFill}>
          <PageLoader />
        </View>
      )}
    </ThemedView>
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
      <PaperPanel seed={`recap-${recap.travelBookId}`} accentIndex={2} allowOverflow style={styles.card}>
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
        <ThemedText type="headlineWrapped">{recap.title}</ThemedText>
        {recap.body && (
          <ThemedText type="small" numberOfLines={3}>
            {recap.body}
          </ThemedText>
        )}
      </PaperPanel>
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
  // Full width on purpose — MaxContentWidth is applied to the CONTENT
  // below (`gutter` and `list`), never to this frame. On web an RN
  // ScrollView is its own overflow container, so capping the frame means
  // the scrollable region is only the centered column: a mouse wheel
  // anywhere in the empty margins of a wide window hits a non-scrolling
  // element and does nothing. Capping the content instead keeps the
  // reading column identical while letting the scroll surface span the
  // whole window. (Same frame-vs-content distinction as the horizontal
  // padding note below, for a different reason.)
  safeArea: {
    flex: 1,
    width: "100%",
  },
  // A line of text between the header and the list (an error, the empty
  // feed), spaced from the list the way the header is.
  notice: {
    marginBottom: Spacing.three,
  },
  statusScrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  // The horizontal inset safeArea used to apply to everything at once —
  // now applied per-child so the scroll container itself can stay
  // full-width (see safeArea above).
  gutter: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
  },
  // No gutter on this one: DiscoverView is a scroll view, and the gutter
  // here inset the scroll view itself, which cut stamps and the places strip
  // off short of the screen's edge (see safeArea above). It pads its own
  // content instead.
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
  // Up into the list's gap, so the route starts at the post above.
  journey: {
    marginTop: -Spacing.three,
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
    // ordinary in-bounds space instead of being clipped away. The reading
    // column's width cap lives here too, for the same reason.
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: Spacing.four,
  },
  // position:'relative' on this and cardTop below: FeedRatingStamp
  // positions itself absolutely against whichever of these is its nearest
  // ancestor, and deliberately leans *past* their edges (a real stamp stuck
  // crooked on an envelope corner) — nothing here clips overflow, which is
  // what actually lets that show instead of getting cut off at the card's
  // own bounds.
  // Still used by RecapCard below (VisitCard's own identical copy of these
  // four — card/headerRow/headerAuthor/headerText — now lives in
  // visit-card.tsx instead, see that file).
  card: {
    position: "relative",
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
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
  recapCover: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: Spacing.two,
  },
});
