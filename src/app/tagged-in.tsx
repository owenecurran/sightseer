import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { PageLoader } from "@/components/ui/page-loader";
import { VisitCard } from "@/components/visit-card";
import { MaxContentWidth, Spacing, TopTabInset } from "@/constants/theme";
import { useBottomTabInset } from "@/hooks/use-bottom-tab-inset";
import { useHideOnScrollHandler } from "@/hooks/use-hide-on-scroll";
import { useAuth } from "@/lib/auth-context";
import { getAvatarViewUrls } from "@/lib/avatar";
import { likeVisit, unlikeVisit } from "@/lib/feed";
import { getPhotoViewUrls } from "@/lib/photo-view";
import { shareText } from "@/lib/share";
import {
  getVisitsTaggedIn,
  untagSelf,
  type TaggedVisit,
} from "@/lib/tagged-visits";

// An absolute ceiling (px) on how far a rating stamp may rise above its
// own block's bottom edge, applied to this screen only — per direct
// feedback the stamps sat too high here. 0 means "never above the block's
// bottom edge"; a stamp over a photo can still dip *below* it (that's
// FeedRatingStamp's own canSeep behavior, deliberately kept). This is the
// one number to raise if they should be allowed a little more height —
// the feed passes nothing and keeps its own taller range.
const MAX_STAMP_RISE = -100;

// Same real feed card (VisitCard) the main feed uses — not a hand-copied
// lookalike — filtered down to just the posts the viewer is tagged in. Also
// a plain ScrollView + .map(), not FlatList, matching (tabs)/index.tsx's own
// fix for the same reason: FlatList virtualizes/recycles cells, which on
// Android structurally requires clipping each cell to its own bounds — that
// was silently clipping the rating stamp's deliberate corner overflow here
// too, the same bug the main feed already moved off FlatList to fix.
export default function TaggedInScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [visits, setVisits] = useState<TaggedVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [copiedVisitId, setCopiedVisitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const scrollHandler = useHideOnScrollHandler();

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      (async () => {
        try {
          const taggedVisits = await getVisitsTaggedIn(session.user.id);
          setVisits(taggedVisits);

          const photoIds = taggedVisits.flatMap((v) => v.photoIds);
          const authorIds = [...new Set(taggedVisits.map((v) => v.user_id))];
          const [photos, avatars] = await Promise.all([
            photoIds.length > 0
              ? getPhotoViewUrls(photoIds)
              : Promise.resolve({}),
            authorIds.length > 0
              ? getAvatarViewUrls(authorIds)
              : Promise.resolve({}),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not load posts you’re tagged in.",
          );
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session]),
  );

  // Mirrors (tabs)/index.tsx's own handleToggleLike exactly, just against
  // this screen's own `visits` list instead of the feed's items.
  async function handleToggleLike(visit: TaggedVisit) {
    if (!session) return;
    setError(null);
    try {
      if (visit.isLikedByMe) {
        await unlikeVisit(session.user.id, visit.id);
      } else {
        await likeVisit(session.user.id, visit.id);
      }
      setVisits((prev) =>
        prev.map((v) =>
          v.id === visit.id
            ? {
                ...v,
                isLikedByMe: !v.isLikedByMe,
                likeCount: v.likeCount + (v.isLikedByMe ? -1 : 1),
              }
            : v,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update that like.",
      );
    }
  }

  function handleVisitDeleted(visitId: string) {
    setVisits((prev) => prev.filter((v) => v.id !== visitId));
  }

  // Mirrors (tabs)/index.tsx's own handleShareVisit exactly.
  async function handleShareVisit(visit: TaggedVisit) {
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

  // Passed to VisitCard's own onUntagSelf — it awaits this and closes its
  // menu on success, so both the actual removal (DB call) and this screen's
  // own list update happen here, in one place, matching the shape
  // onDeleted/handleVisitDeleted already uses for the owner-delete path.
  async function handleUntagSelf(visitId: string) {
    if (!session) return;
    await untagSelf(visitId, session.user.id);
    setVisits((prev) => prev.filter((v) => v.id !== visitId));
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>
          <ThemedText type="displaySerif">Tagged in</ThemedText>
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          {visits.length === 0 && !error && (
            <ThemedText type="small" themeColor="textSecondary">
              Not tagged in anything yet.
            </ThemedText>
          )}
        </View>

        <Animated.ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        >
          {visits.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              photoUrls={photoUrls}
              avatarUrl={avatarUrls[visit.user_id]}
              isOwner={session?.user.id === visit.user_id}
              isCopied={copiedVisitId === visit.id}
              onToggleLike={() => handleToggleLike(visit)}
              onShare={() => handleShareVisit(visit)}
              onDeleted={() => handleVisitDeleted(visit.id)}
              onUntagSelf={() => handleUntagSelf(visit.id)}
              maxStampRise={MAX_STAMP_RISE}
            />
          ))}
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Deliberately NO paddingHorizontal here — see (tabs)/index.tsx's
  // identical safeArea comment: that inset lives on `list` below instead,
  // inside the ScrollView's own clip bounds, so the rating stamp's
  // deliberate overflow past a card edge lands in ordinary in-bounds space
  // rather than getting clipped at the scroll container's own edge.
  safeArea: {
    flex: 1,
    alignSelf: "center",
    width: "100%",
    maxWidth: MaxContentWidth,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  header: {
    width: "100%",
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
});
