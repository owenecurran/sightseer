import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { TripDayReviews } from '@/components/trip-day-reviews';
import { TripMapSquare } from '@/components/trip-map-square';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getVisitsByIds, groupVisitsIntoDays, type TripDay } from '@/lib/feed';
import { likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';
import { getTripsForUsers, type Trip } from '@/lib/trips';

// Every day of one trip, scrollable — the feed only ever previews a single
// day of a long trip (see TripGroupCard), and this is where "see all N
// days" lands. Identified by the trip's own key parts rather than a row id,
// since trips are derived and have no table of their own.
export default function TripScreen() {
  const { user: userId, start: startDate } = useLocalSearchParams<{ user?: string; start?: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const scrollHandler = useHideOnScrollHandler();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [days, setDays] = useState<TripDay[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [copiedVisitId, setCopiedVisitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session || !userId || !startDate) return;
      setError(null);
      (async () => {
        try {
          const trips = await getTripsForUsers([userId]);
          const found = trips.find((t) => t.startDate === startDate) ?? null;
          setTrip(found);
          if (!found) return;

          const visits = await getVisitsByIds(found.visitIds, session.user.id);
          setDays(groupVisitsIntoDays(visits));

          const photoIds = visits.flatMap((v) => v.photoIds);
          const authorIds = [...new Set(visits.map((v) => v.user_id))];
          const [photos, avatars] = await Promise.all([
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
            authorIds.length > 0 ? getAvatarViewUrls(authorIds) : Promise.resolve({}),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this trip.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session, userId, startDate])
  );

  async function handleToggleLike(visit: FeedVisit) {
    if (!session) return;
    try {
      if (visit.isLikedByMe) await unlikeVisit(session.user.id, visit.id);
      else await likeVisit(session.user.id, visit.id);
      setDays((prev) =>
        prev.map((day) => ({
          ...day,
          visits: day.visits.map((v) =>
            v.id === visit.id
              ? { ...v, isLikedByMe: !v.isLikedByMe, likeCount: v.likeCount + (v.isLikedByMe ? -1 : 1) }
              : v
          ),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that like.');
    }
  }

  async function handleShare(visit: FeedVisit) {
    const message = `${visit.authorName} ${visit.rating != null ? `rated ${visit.placeName} ${visit.rating.toFixed(1)}/10` : `visited ${visit.placeName}`} on Sightseer.`;
    const result = await shareText(message);
    if (result === 'copied') {
      setCopiedVisitId(visit.id);
      setTimeout(() => setCopiedVisitId((current) => (current === visit.id ? null : current)), 2000);
    }
  }

  function handleVisitDeleted(visitId: string) {
    setDays((prev) =>
      prev.map((day) => ({ ...day, visits: day.visits.filter((v) => v.id !== visitId) })).filter((day) => day.visits.length > 0)
    );
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const allVisits = days.flatMap((day) => day.visits);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          {!trip ? (
            <ThemedText type="small" themeColor="textSecondary">
              {error ?? 'This trip is no longer available.'}
            </ThemedText>
          ) : (
            <>
              <View style={styles.header}>
                <TripMapSquare
                  visits={allVisits}
                  center={trip.areaLat != null && trip.areaLng != null ? { lat: trip.areaLat, lng: trip.areaLng } : null}
                />
                <View style={styles.headerText}>
                  <ThemedText type="sectionLabel">Trip</ThemedText>
                  <StretchText type="headline" fill>
                    {trip.areaName}
                  </StretchText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {allVisits.length} review{allVisits.length === 1 ? '' : 's'} · {days.length} day
                    {days.length === 1 ? '' : 's'}
                  </ThemedText>
                </View>
              </View>

              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}

              {/* Newest first, same order as the feed's own preview — the
                  day number stays chronological. */}
              {days
                .map((day, index) => ({ day, dayNumber: index + 1 }))
                .reverse()
                .map(({ day, dayNumber }) => (
                <TripDayReviews
                  key={day.date}
                  day={day}
                  dayNumber={dayNumber}
                  photoUrls={photoUrls}
                  avatarUrls={avatarUrls}
                  viewerId={session?.user.id}
                  copiedVisitId={copiedVisitId}
                  onToggleLike={handleToggleLike}
                  onShare={handleShare}
                  onVisitDeleted={handleVisitDeleted}
                />
              ))}
            </>
          )}
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Width cap lives on the content, not this frame — see (tabs)/index.tsx's
  // own safeArea comment: capping the scroll container itself means a wheel
  // in the margins of a wide window hits nothing.
  safeArea: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
});
