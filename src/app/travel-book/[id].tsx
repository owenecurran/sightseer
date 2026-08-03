import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDeleteModal } from '@/components/confirm-delete-modal';
import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { LoadableImage } from '@/components/ui/loadable-image';
import { PageLoader } from '@/components/ui/page-loader';
import { StretchText } from '@/components/ui/stretch-text';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getCoverViewUrls, uploadCoverPhoto } from '@/lib/covers';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getRecap, type TravelBookRecapRow } from '@/lib/travel-book-recaps';
import {
  addVisitToTravelBook,
  getEligibleVisitsForTravelBook,
  getTravelBookDetail,
  getTravelBookItems,
  removeVisitFromTravelBook,
  setTravelBookCoverPhoto,
  type TravelBookCollaborator,
  type TravelBookItem,
  type TravelBookRow,
} from '@/lib/travel-books';
import type { TaggedVisit } from '@/lib/tagged-visits';

export default function TravelBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [book, setBook] = useState<TravelBookRow | null>(null);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<TravelBookCollaborator[]>([]);
  const [items, setItems] = useState<TravelBookItem[]>([]);
  const [recap, setRecap] = useState<TravelBookRecapRow | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [customCoverUrl, setCustomCoverUrl] = useState<string | undefined>();
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const [isAddExpanded, setIsAddExpanded] = useState(false);
  const [eligibleVisits, setEligibleVisits] = useState<TaggedVisit[]>([]);
  const [isLoadingEligible, setIsLoadingEligible] = useState(false);
  const [confirmingItem, setConfirmingItem] = useState<TravelBookItem | null>(null);

  const theme = useTheme();
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
          setLocationName(detail.locationName);
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
          if (detail.book.cover_photo_r2_key) {
            const urls = await getCoverViewUrls('travel_books', [detail.book.id]);
            setCustomCoverUrl(urls[detail.book.id]);
          }
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

  async function handleSetCover(photoId: string) {
    if (!book) return;
    setError(null);
    try {
      await setTravelBookCoverPhoto(book.id, photoId);
      setBook({ ...book, cover_photo_id: photoId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set that cover photo.');
    }
  }

  async function handleUploadCover() {
    if (!book) return;
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required.');
      return;
    }
    if (!result) return;
    setError(null);
    setIsUploadingCover(true);
    try {
      const r2Key = await uploadCoverPhoto({
        table: 'travel_books',
        id: book.id,
        uri: result.uri,
        mimeType: result.mimeType,
      });
      setBook({ ...book, cover_photo_r2_key: r2Key });
      const urls = await getCoverViewUrls('travel_books', [book.id]);
      setCustomCoverUrl(urls[book.id]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that cover photo.');
    } finally {
      setIsUploadingCover(false);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  const members = book ? [{ userId: book.user_id, name: '' }, ...collaborators] : [];

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="link">← Back</ThemedText>
          </Pressable>

          {customCoverUrl && (
            <View style={styles.coverWrap}>
              <LoadableImage source={{ uri: customCoverUrl }} style={styles.cover} />
            </View>
          )}

          <ThemedText type="displaySerif">{book?.title ?? 'Travel book'}</ThemedText>
          {locationName && (
            <ThemedText type="small" themeColor="sage">
              {locationName}
            </ThemedText>
          )}
          {book?.description && (
            <ThemedText type="small" themeColor="textSecondary">
              {book.description}
            </ThemedText>
          )}

          {session && book?.user_id === session.user.id && (
            <Pressable onPress={handleUploadCover} disabled={isUploadingCover}>
              <ThemedText type="small" themeColor="sage">
                {isUploadingCover ? 'Uploading…' : customCoverUrl ? 'Change cover photo' : 'Add a cover photo'}
              </ThemedText>
            </Pressable>
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
                    <StretchText type="headline" fill>{item.placeName}</StretchText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {item.rating.toFixed(1)} ★{item.note ? ` · ${item.note}` : ''}
                    </ThemedText>
                    <PhotoGrid urls={item.photoIds.map((pid) => photoUrls[pid]).filter((url) => url != null)} />
                    {session && book?.user_id === session.user.id && item.photoIds[0] && (
                      <Pressable onPress={() => handleSetCover(item.photoIds[0])} hitSlop={8}>
                        <ThemedText type="small" themeColor="sage">
                          {book.cover_photo_id === item.photoIds[0] ? 'Cover photo ✓' : 'Set as cover'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </View>
                  {session && (item.addedBy === session.user.id || book?.user_id === session.user.id) && (
                    <Pressable
                      onPress={() => setConfirmingItem(item)}
                      hitSlop={12}
                      style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}>
                      <Ionicons name="ellipsis-horizontal" size={20} color={theme.textSecondary} />
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

      <ConfirmDeleteModal
        visible={confirmingItem != null}
        message="Remove this review from the trip?"
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmingItem) handleRemoveItem(confirmingItem);
          setConfirmingItem(null);
        }}
        onCancel={() => setConfirmingItem(null)}
      />
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
  },
  coverWrap: {
    width: '100%',
    height: 160,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  cover: {
    width: '100%',
    height: '100%',
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
  menuButton: {
    padding: Spacing.two,
  },
  pressed: {
    opacity: 0.5,
  },
});
