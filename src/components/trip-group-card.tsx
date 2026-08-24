import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { StickerLink } from '@/components/ui/sticker-link';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui/avatar';
import { ThemedView } from '@/components/themed-view';
import { TripDayReviews } from '@/components/trip-day-reviews';
import { TripMapSquare } from '@/components/trip-map-square';
import { StretchText } from '@/components/ui/stretch-text';
import { Spacing } from '@/constants/theme';
import type { FeedTrip, FeedVisit } from '@/lib/feed';
import { createTravelBookFromTrip } from '@/lib/travel-books';
import { getAreaOptions, setTripDisplayPlace, type AreaOption } from '@/lib/trips';

type TripGroupCardProps = {
  feedTrip: FeedTrip;
  photoUrls: Record<string, string>;
  photoThumbUrls?: Record<string, string>;
  avatarUrls: Record<string, string>;
  viewerId?: string;
  copiedVisitId: string | null;
  onToggleLike: (visit: FeedVisit) => void;
  onShare: (visit: FeedVisit) => void;
  onVisitDeleted: (visitId: string) => void;
  // Lets the feed refresh its own copy once a trip becomes a travel book,
  // so the offer turns into a link without a full reload.
  onConverted: (tripKey: string, travelBookId: string) => void;
};

// "Aug 3 – Aug 11" / "Aug 3" when a trip somehow spans one calendar day.
// Deliberately parsed as local-noon rather than passed straight to Date():
// `visited_on` is a bare date (no time or zone), and `new Date('2026-08-03')`
// parses as UTC midnight, which renders as the *previous* day for anyone
// west of Greenwich.
function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// A trip shows every one of its days inline until it reaches this many —
// at that point it previews just the latest day and sends you to its own
// page for the rest, so one long trip can't become most of someone's feed.
const INLINE_DAY_LIMIT = 3;
// How many days a trip past that limit still previews in the feed.
const PREVIEW_DAY_COUNT = 1;

function formatRange(startDate: string, endDate: string): string {
  return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

// A finished trip, collapsed into one block that still separates its days.
// Only ever rendered for trips the feed has already decided are over — an
// ongoing trip's reviews stay as individual cards (see groupVisitsIntoTrips)
// so a trip in progress still reads day by day as it happens.
export function TripGroupCard({
  feedTrip,
  photoUrls,
  photoThumbUrls,
  avatarUrls,
  viewerId,
  copiedVisitId,
  onToggleLike,
  onShare,
  onVisitDeleted,
  onConverted,
}: TripGroupCardProps) {
  const { trip, days } = feedTrip;
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held locally so the header updates the instant a level is picked; the
  // write is persisted in the background and a later feed refresh reads the
  // same value back from trip_overrides.
  const [areaName, setAreaName] = useState(trip.areaName);
  const [isPickingArea, setIsPickingArea] = useState(false);
  const [areaOptions, setAreaOptions] = useState<AreaOption[] | null>(null);

  const isOwnTrip = viewerId != null && viewerId === trip.userId;
  const allVisits = days.flatMap((day) => day.visits);
  const visitCount = allVisits.length;
  // Every review in a trip belongs to the same author (trips are clustered
  // per user), so the first one speaks for all of them.
  const authorName = allVisits[0]?.authorName ?? 'Someone';
  // An outing is a single dense day rather than a multi-day trip — see
  // TripKind. The whole block is otherwise identical, so only the label and
  // the day-by-day breakdown differ.
  const isOuting = trip.kind === 'outing';
  // Newest day first — a trip reads as "what happened most recently",
  // matching the feed around it, rather than starting from day one. The day
  // NUMBER stays chronological (day 1 is still the first day of the trip),
  // so it's paired here before reversing rather than derived from the
  // reversed position.
  const numberedDays = days.map((day, index) => ({ day, dayNumber: index + 1 })).reverse();
  const isLongTrip = days.length >= INLINE_DAY_LIMIT;
  const previewDays = isLongTrip ? numberedDays.slice(0, PREVIEW_DAY_COUNT) : numberedDays;

  async function handleOpenAreaPicker() {
    setIsPickingArea((open) => !open);
    if (areaOptions != null) return;
    try {
      setAreaOptions(await getAreaOptions(trip.autoAreaPlaceId));
    } catch {
      // A missing option list just means the name stays as detected.
      setAreaOptions([]);
    }
  }

  async function handlePickArea(option: AreaOption) {
    setAreaName(option.name);
    setIsPickingArea(false);
    try {
      // The auto pick is stored as "no override" rather than as itself, so
      // it keeps tracking detection if more reviews later widen the trip.
      await setTripDisplayPlace(trip, option.placeId === trip.autoAreaPlaceId ? null : option.placeId);
    } catch (err) {
      setAreaName(trip.areaName);
      setError(err instanceof Error ? err.message : 'Could not change how this is labeled.');
    }
  }

  async function handleMakeTravelBook() {
    setError(null);
    setIsConverting(true);
    try {
      const bookId = await createTravelBookFromTrip(trip, trip.areaName);
      onConverted(trip.key, bookId);
      router.push({ pathname: '/travel-book/[id]', params: { id: bookId } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make a travel book from this trip.');
    } finally {
      setIsConverting(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {/* Author first, exactly like a normal feed post. Without it the card
            opened straight onto a place name, and it wasn't clear the
            reviews below were somebody's — per direct feedback, that the
            location didn't obviously relate to the posts under it. */}
        <View style={styles.authorRow}>
          <Pressable
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: trip.userId } })}
            hitSlop={6}>
            <Avatar uri={avatarUrls[trip.userId]} name={authorName} size={28} />
          </Pressable>
          <ThemedText
            type="smallBold"
            style={styles.authorName}
            onPress={() => router.push({ pathname: '/user/[id]', params: { id: trip.userId } })}>
            {authorName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {isOuting ? 'had a night out' : 'took a trip'}
          </ThemedText>
        </View>

        <View style={styles.headerRow}>
          <TripMapSquare
            visits={allVisits}
            center={trip.areaLat != null && trip.areaLng != null ? { lat: trip.areaLat, lng: trip.areaLng } : null}
          />
          <View style={styles.headerText}>
            {/* No "Trip"/"Night out" label here any more — the author line
                above already says it, and having both put the same word on
                screen twice within two lines.

                The area name comes from the deepest place every review sits
                inside — a city when it all stayed in one, a country once it
                spans two (see deepest_common_area). Tapping it (your own
                only) relabels it at a broader level; narrower isn't
                offered, since a narrower place wouldn't contain every
                review. */}
            <Pressable onPress={isOwnTrip ? handleOpenAreaPicker : undefined} disabled={!isOwnTrip}>
              <StretchText type="headline" fill>
                {areaName}
              </StretchText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">
              {formatRange(trip.startDate, trip.endDate)} · {visitCount} review
              {visitCount === 1 ? '' : 's'}
              {isOuting ? '' : ` · ${days.length} day${days.length === 1 ? '' : 's'}`}
            </ThemedText>
          </View>
        </View>

        {isPickingArea && areaOptions != null && (
          <View style={styles.areaOptions}>
            {areaOptions.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                No broader area to show this as.
              </ThemedText>
            ) : (
              areaOptions.map((option) => (
                <Pressable key={option.placeId} onPress={() => handlePickArea(option)}>
                  <ThemedView
                    type={option.name === areaName ? 'backgroundSelected' : 'background'}
                    style={styles.areaChip}>
                    <ThemedText type="small">{option.name}</ThemedText>
                  </ThemedView>
                </Pressable>
              ))
            )}
          </View>
        )}

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {trip.travelBookId ? (
          <StickerLink
            label="View travel book"
            seed={trip.key}
            onPress={() =>
              router.push({ pathname: '/travel-book/[id]', params: { id: trip.travelBookId! } })
            }
          />
        ) : (
          // Only the person whose trip it is can turn it into a travel book
          // — travel_books rows are owned, and the RLS insert policy would
          // reject anyone else anyway.
          isOwnTrip && (
            <Pressable onPress={handleMakeTravelBook} disabled={isConverting} hitSlop={8}>
              <ThemedText type="small" themeColor="sage">
                {isConverting ? 'Making travel book…' : 'Make this a travel book'}
              </ThemedText>
            </Pressable>
          )
        )}
      </View>

      {/* An outing is a single day, so it's just that day's reviews. */}
      {isOuting ? (
        <TripDayReviews
          day={days[0]}
          tripKey={trip.key}
          dayNumber={1}
          photoUrls={photoUrls}
          photoThumbUrls={photoThumbUrls}
          avatarUrls={avatarUrls}
          viewerId={viewerId}
          copiedVisitId={copiedVisitId}
          onToggleLike={onToggleLike}
          onShare={onShare}
          onVisitDeleted={onVisitDeleted}
        />
      ) : (
        <>
          {previewDays.map(({ day, dayNumber }) => (
            <TripDayReviews
              key={day.date}
              day={day}
              tripKey={trip.key}
              dayNumber={dayNumber}
              photoUrls={photoUrls}
              photoThumbUrls={photoThumbUrls}
              avatarUrls={avatarUrls}
              viewerId={viewerId}
              copiedVisitId={copiedVisitId}
              onToggleLike={onToggleLike}
              onShare={onShare}
              onVisitDeleted={onVisitDeleted}
            />
          ))}

          {isLongTrip && (
            <StickerLink
              label={`See all ${days.length} days of this trip`}
              seed={`${trip.key}-days`}
              onPress={() =>
                router.push({
                  pathname: '/trip',
                  params: { user: trip.userId, start: trip.startDate },
                })
              }
            />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // One frame around the whole trip: the destination header and every day
  // previewed under it. Before this each day was a loose sibling of the
  // header, so a trip read as a heading followed by unrelated posts rather
  // than as one thing.
  //
  // Tinted-transparent rather than filled: the header used to be its own
  // `backgroundElement` plate, and the VisitCards inside are that same
  // colour, so a filled frame would have flattened into the cards it is
  // meant to contain. A sage wash this faint separates the group from the
  // screen without competing with anything in it.
  //
  // No `overflow: 'hidden'` anywhere here on purpose — rating stamps lean
  // off their cards' corners and the day stepper's arrows sit slightly
  // outside the cards, and all of that is supposed to cross the frame.
  wrap: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(160,189,145,0.22)',
    backgroundColor: 'rgba(160,189,145,0.06)',
  },
  header: {
    gap: Spacing.one,
  },
  // The map square sits beside the trip's own text rather than above it —
  // the square is fixed-size, so the text column takes whatever's left.
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // Sits between the avatar and the trailing descriptor, so a long name
  // truncates rather than pushing "took a trip" off the card.
  authorName: {
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  dayLabel: {
    paddingHorizontal: Spacing.one,
  },
  areaOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  areaChip: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.five,
  },
});
