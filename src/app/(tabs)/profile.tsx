import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PhotoGrid } from '@/components/photo-grid';
import { ProfilePromptsSection } from '@/components/profile-prompts-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { VisitMenu } from '@/components/visit-menu';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls, uploadAvatar } from '@/lib/avatar';
import type { Database } from '@/lib/database.types';
import {
  acceptFollowRequest,
  listIncomingFollowRequests,
  rejectFollowRequest,
  type IncomingFollowRequest,
} from '@/lib/follows';
import { pickImageFromLibrary } from '@/lib/image-picker';
import { getPhotoViewUrls } from '@/lib/photo-view';
import { supabase } from '@/lib/supabase';

type OwnVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

function photoIdsFor(visit: OwnVisit): string[] {
  return [...visit.photos].sort((a, b) => a.position - b.position).map((p) => p.id);
}

export default function ProfileScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [visits, setVisits] = useState<OwnVisit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!session || !profile?.avatar_r2_key) {
      setAvatarUrl(null);
      return;
    }
    getAvatarViewUrls([session.user.id])
      .then((urls) => setAvatarUrl(urls[session.user.id] ?? null))
      .catch(() => setAvatarUrl(null));
  }, [session, profile?.avatar_r2_key]);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      Promise.all([
        listIncomingFollowRequests(session.user.id),
        supabase
          .from('visits')
          .select('id, rating, note, visited_on, places!place_id(name), photos(id, position)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ])
        .then(async ([incoming, visitsResult]) => {
          if (visitsResult.error) throw visitsResult.error;
          const ownVisits = visitsResult.data as unknown as OwnVisit[];
          setRequests(incoming);
          setVisits(ownVisits);

          const photoIds = ownVisits.flatMap((v) => v.photos.map((p) => p.id));
          if (photoIds.length > 0) {
            setPhotoUrls(await getPhotoViewUrls(photoIds));
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your profile.'));
    }, [session])
  );

  async function handleAccept(followerId: string) {
    if (!session) return;
    setError(null);
    try {
      await acceptFollowRequest(followerId, session.user.id);
      setRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept that request.');
    }
  }

  async function handleReject(followerId: string) {
    if (!session) return;
    setError(null);
    try {
      await rejectFollowRequest(followerId, session.user.id);
      setRequests((prev) => prev.filter((r) => r.follower_id !== followerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject that request.');
    }
  }

  function handleVisitDeleted(visitId: string) {
    setVisits((prev) => prev.filter((v) => v.id !== visitId));
  }

  const featuredVisit = visits[0];
  const remainingVisits = visits.slice(1);

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  async function handlePickAvatar() {
    if (!session) return;
    setError(null);
    const result = await pickImageFromLibrary();
    if (result === 'denied') {
      setError('Photo library permission is required to set a profile picture.');
      return;
    }
    if (!result) return;

    setIsUploadingAvatar(true);
    try {
      await uploadAvatar({ userId: session.user.id, uri: result.uri, mimeType: result.mimeType });
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload that photo.');
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={remainingVisits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={[styles.contentWrap, styles.headerSection]}>
              <View style={styles.headerRow}>
                <Pressable onPress={handlePickAvatar} disabled={isUploadingAvatar} style={styles.avatarColumn}>
                  <Avatar uri={avatarUrl} name={profile?.name ?? profile?.handle} size={72} />
                  <ThemedText type="small" themeColor="textSecondary">
                    {isUploadingAvatar ? 'Uploading...' : avatarUrl ? 'Change photo' : 'Add photo'}
                  </ThemedText>
                </Pressable>

                <View style={styles.headerInfo}>
                  <ThemedText type="subtitle">{profile?.name ?? profile?.handle ?? 'Profile'}</ThemedText>
                  {profile?.handle && (
                    <ThemedText type="small" themeColor="textSecondary">
                      @{profile.handle}
                    </ThemedText>
                  )}
                  {profile?.bio && <ThemedText type="small">{profile.bio}</ThemedText>}
                  <Pressable onPress={() => router.push('/edit-profile')}>
                    <ThemedText type="link">Edit profile</ThemedText>
                  </Pressable>
                </View>
              </View>

              {featuredVisit && (
                <Pressable
                  onPress={() => router.push({ pathname: '/visit/[id]', params: { id: featuredVisit.id } })}>
                  <ThemedView type="backgroundElement" style={styles.featuredCard}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Most recent review
                    </ThemedText>
                    <ThemedText type="subtitle" style={styles.featuredPlace}>
                      {featuredVisit.places?.name ?? 'Unknown place'}
                    </ThemedText>
                    <ThemedText type="default" themeColor="textSecondary">
                      {featuredVisit.rating.toFixed(1)} ★{featuredVisit.note ? ` · ${featuredVisit.note}` : ''}
                    </ThemedText>
                    <PhotoGrid
                      urls={photoIdsFor(featuredVisit).map((id) => photoUrls[id]).filter((url) => url != null)}
                    />
                  </ThemedView>
                </Pressable>
              )}

              {session && <ProfilePromptsSection userId={session.user.id} />}

              {error && (
                <ThemedText type="small" themeColor="textSecondary">
                  {error}
                </ThemedText>
              )}

              {requests.length > 0 && (
                <View style={styles.section}>
                  <ThemedText type="smallBold">Follow requests</ThemedText>
                  {requests.map((request) => (
                    <ThemedView key={request.follower_id} type="backgroundElement" style={styles.requestRow}>
                      <ThemedText type="default">
                        {request.users?.name ?? request.users?.handle ?? 'Someone'}
                      </ThemedText>
                      <View style={styles.requestActions}>
                        <Pressable onPress={() => handleAccept(request.follower_id)}>
                          <ThemedText type="smallBold">Accept</ThemedText>
                        </Pressable>
                        <Pressable onPress={() => handleReject(request.follower_id)}>
                          <ThemedText type="small" themeColor="textSecondary">
                            Reject
                          </ThemedText>
                        </Pressable>
                      </View>
                    </ThemedView>
                  ))}
                </View>
              )}

              <ThemedText type="smallBold">Your visits</ThemedText>
            </View>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.contentWrap, styles.visitRow]}>
              <Pressable
                style={styles.visitInfo}
                onPress={() => router.push({ pathname: '/visit/[id]', params: { id: item.id } })}>
                <ThemedText type="default">{item.places?.name ?? 'Unknown place'}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.rating.toFixed(1)} ★
                  {item.note ? ` · ${item.note}` : ''}
                </ThemedText>
                <PhotoGrid urls={photoIdsFor(item).map((id) => photoUrls[id]).filter((url) => url != null)} />
              </Pressable>
              <VisitMenu visitId={item.id} isOwner onDeleted={() => handleVisitDeleted(item.id)} />
            </ThemedView>
          )}
          ListFooterComponent={
            <View style={[styles.contentWrap, styles.footerSection]}>
              {profile?.is_admin && (
                <Pressable onPress={() => router.push('/moderation')}>
                  <ThemedText type="link">Reports</ThemedText>
                </Pressable>
              )}

              <Button label="Sign out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
            </View>
          }
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
    paddingBottom: BottomTabInset,
  },
  // The scrollable element (the FlatList itself, via safeArea above) stays
  // full width so its native scrollbar sits at the true browser edge —
  // width/maxWidth centering happens per-piece-of-content instead, applied
  // to header/row/footer individually rather than to the scroll container.
  contentWrap: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerSection: {
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  footerSection: {
    gap: Spacing.three,
    marginTop: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  avatarColumn: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  headerInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  featuredCard: {
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
  featuredPlace: {
    fontSize: 28,
    lineHeight: 32,
  },
  section: {
    gap: Spacing.two,
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  requestActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.two,
  },
  visitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  visitInfo: {
    flex: 1,
    gap: Spacing.half,
  },
});
