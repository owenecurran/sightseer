import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGrid } from '@/components/photo-grid';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { getVisitsTaggedIn, untagSelf, type TaggedVisit } from '@/lib/tagged-visits';

function formatAuthorLine(authorName: string, taggedUserNames: string[]): string {
  if (taggedUserNames.length === 0) return authorName;
  if (taggedUserNames.length === 1) return `${authorName} with ${taggedUserNames[0]}`;
  return `${authorName} with ${taggedUserNames[0]} + ${taggedUserNames.length - 1} other${taggedUserNames.length > 2 ? 's' : ''}`;
}

export default function TaggedInScreen() {
  const { session } = useAuth();
  const bottomInset = useBottomTabInset();
  const [visits, setVisits] = useState<TaggedVisit[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [untaggingId, setUntaggingId] = useState<string | null>(null);
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
            photoIds.length > 0 ? getPhotoViewUrls(photoIds) : Promise.resolve({}),
            authorIds.length > 0 ? getAvatarViewUrls(authorIds) : Promise.resolve({}),
          ]);
          setPhotoUrls(photos);
          setAvatarUrls(avatars);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not load posts you’re tagged in.');
        } finally {
          setHasLoadedOnce(true);
        }
      })();
    }, [session])
  );

  async function handleUntagSelf(visitId: string) {
    if (!session) return;
    setError(null);
    setUntaggingId(visitId);
    try {
      await untagSelf(visitId, session.user.id);
      setVisits((prev) => prev.filter((v) => v.id !== visitId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that tag.');
    } finally {
      setUntaggingId(null);
    }
  }

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.FlatList
          data={visits}
          keyExtractor={(item: TaggedVisit) => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
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
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}
              style={styles.contentWrap}>
              <ThemedView type="backgroundElement" style={styles.visitCard}>
                <View style={styles.headerRow}>
                  <Avatar uri={avatarUrls[item.user_id]} name={item.authorName} size={28} />
                  <ThemedText type="smallBold" style={styles.headerText}>
                    {formatAuthorLine(item.authorName, item.taggedUserNames)}
                  </ThemedText>
                </View>
                <ThemedText type="headline">{item.placeName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.rating.toFixed(1)} ★
                  {item.note ? ` · ${item.note}` : ''}
                </ThemedText>
                <PhotoGrid urls={item.photoIds.map((id) => photoUrls[id]).filter((url) => url != null)} />
                <Pressable onPress={() => handleUntagSelf(item.id)} disabled={untaggingId === item.id} hitSlop={8}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Untag yourself
                  </ThemedText>
                </Pressable>
              </ThemedView>
            </Pressable>
          )}
        />
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  contentWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerSection: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  visitCard: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerText: {
    flex: 1,
  },
});
