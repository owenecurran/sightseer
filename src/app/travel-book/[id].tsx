import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getRecap, type TravelBookRecapRow } from '@/lib/travel-book-recaps';
import {
  addVisitToTravelBook,
  getEligibleVisitsForTravelBook,
  getTravelBookDetail,
  getTravelBookItems,
  removeVisitFromTravelBook,
  type TravelBookCollaborator,
  type TravelBookItem,
  type TravelBookRow,
} from '@/lib/travel-books';
import type { TaggedVisit } from '@/lib/tagged-visits';

export default function TravelBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [book, setBook] = useState<TravelBookRow | null>(null);
  const [collaborators, setCollaborators] = useState<TravelBookCollaborator[]>([]);
  const [items, setItems] = useState<TravelBookItem[]>([]);
  const [recap, setRecap] = useState<TravelBookRecapRow | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [isAddExpanded, setIsAddExpanded] = useState(false);
  const [eligibleVisits, setEligibleVisits] = useState<TaggedVisit[]>([]);
  const [isLoadingEligible, setIsLoadingEligible] = useState(false);

  const scrollHandler = useHideOnScrollHandler();

  const isParticipant = Boolean(
    session && (book?.user_id === session.user.id || collaborators.some((c) => c.userId === session.user.id))
  );

  useFocusEffect(
    useCallback(() => {
      if (!id || !session) return;
      setError(null);
      (async () => {
        try {
          const [detail, bookItems, bookRecap] = await Promise.all([
            getTravelBookDetail(id),
            getTravelBookItems(id, session.user.id),
            getRecap(id),
          ]);
          setBook(detail.book);
          setCollaborators(detail.collaborators);
          setItems(bookItems);
          setRecap(bookRecap);

          const photoIds = bookItems.flatMap((item) => item.photoIds);
          const authorIds = [
            detail.book.user_id,
            ...detail.collaborators.map((c) => c.userId),
            ...bookItems.map((item) => item.user_id),
          ];
          const [photos, avatars] = await Promise.all([
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
            getAvatarViewUrls([...new Set(authorIds)]),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load this travel book.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [id, session])
  );

  async function handleExpandAdd() {
    if (!session || !id) return;
    setIsAddExpanded(true);
    setIsLoadingEligible(true);
    try {
      setEligibleVisits(await getEligibleVisitsForTravelBook(session.user.id, id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your eligible reviews.');
    } finally {
      setIsLoadingEligible(false);
    }
  }

  async function handleAddVisit(visit: TaggedVisit) {
    if (!session || !id) return;
    setError(null);
    try {
      await addVisitToTravelBook(id, visit.id, session.user.id);
      setEligibleVisits((prev) => prev.filter((v) => v.id !== visit.id));
      setItems(await getTravelBookItems(id, session.user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that review.');
    }
  }

  async function handleRemoveItem(item: TravelBookItem) {
    setError(null);
    try {
      await removeVisitFromTravelBook(item.itemId);
      setItems((prev) => prev.filter((i) => i.itemId !== item.itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that review.');
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const members = book ? [{ userId: book.user_id, name: '' }, ...collaborators] : [];

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          <ThemedText type="displaySerif">{book?.title ?? 'Travel book'}</ThemedText>
          {book?.description && (
            <ThemedText type="small" themeColor="textSecondary">
              {book.description}
            </ThemedText>
          )}

          {collaborators.length > 0 && (
            <View style={styles.membersRow}>
              {members.map((member) => (
                <Avatar key={member.userId} uri={avatarUrls[member.userId]} name={member.name} size={28} />
              ))}
            </View>
          )}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <View style={styles.section}>
            {items.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary">
                No reviews in this trip yet.
              </ThemedText>
            )}
            {items.map((item) => (
              <Pressable key={item.itemId} onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}>
                <ThemedView type="backgroundElement" style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.visited_on} · {item.authorName}
                    </ThemedText>
                    <ThemedText type="headline">{item.placeName}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.rating.toFixed(1)} ★{item.note ? ` · ${item.note}` : ''}
                    </ThemedText>
                    <PhotoGrid urls={item.photoIds.map((pid) => photoUrls[pid]).filter((url) => url != null)} />
                  </View>
                  {session && (item.addedBy === session.user.id || book?.user_id === session.user.id) && (
                    <Pressable onPress={() => handleRemoveItem(item)} hitSlop={8}>
                      <ThemedText type="small" themeColor="textSecondary">
                        Remove
                      </ThemedText>
                    </Pressable>
                  )}
                </ThemedView>
              </Pressable>
            ))}
          </View>

          {isParticipant && (
            <View style={styles.section}>
              {!isAddExpanded ? (
                <Button label="Add a visit" variant="secondary" onPress={handleExpandAdd} />
              ) : (
                <View style={styles.section}>
                  <ThemedText type="sectionLabel">Add one of your eligible reviews</ThemedText>
                  {isLoadingEligible && <ThemedText type="small">Loading…</ThemedText>}
                  {!isLoadingEligible && eligibleVisits.length === 0 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      Nothing eligible to add — only your own reviews, or ones you're tagged in, can go in this book.
                    </ThemedText>
                  )}
                  {eligibleVisits.map((visit) => (
                    <Pressable key={visit.id} onPress={() => handleAddVisit(visit)}>
                      <ThemedView type="backgroundSelected" style={styles.eligibleRow}>
                        <ThemedText type="small">{visit.placeName}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {visit.rating.toFixed(1)} ★
                        </ThemedText>
                      </ThemedView>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Trip recap</ThemedText>
            {recap ? (
              <ThemedView type="backgroundElement" style={styles.recapCard}>
                <ThemedText type="headline">{recap.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {recap.is_published ? 'Published to your feed' : 'Draft — not published yet'}
                </ThemedText>
              </ThemedView>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                No recap written yet.
              </ThemedText>
            )}
            {session && book?.user_id === session.user.id && (
              <Button
                label={recap ? 'Edit recap' : 'Write the trip recap'}
                variant="secondary"
                onPress={() => router.push({ pathname: '/travel-book/[id]/recap', params: { id } })}
              />
            )}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    paddingBottom: BottomTabInset,
  },
  membersRow: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  itemInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  eligibleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  recapCard: {
    gap: Spacing.half,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
