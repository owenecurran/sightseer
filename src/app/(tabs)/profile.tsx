import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import {
  acceptFollowRequest,
  listIncomingFollowRequests,
  rejectFollowRequest,
  type IncomingFollowRequest,
} from '@/lib/follows';
import { supabase } from '@/lib/supabase';

type OwnVisit = {
  id: string;
  rating: number;
  note: string | null;
  visited_on: string;
  places: { name: string } | null;
};

export default function ProfileScreen() {
  const { session, profile } = useAuth();
  const [requests, setRequests] = useState<IncomingFollowRequest[]>([]);
  const [visits, setVisits] = useState<OwnVisit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      setError(null);
      Promise.all([
        listIncomingFollowRequests(session.user.id),
        supabase
          .from('visits')
          .select('id, rating, note, visited_on, places!place_id(name)')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }),
      ])
        .then(([incoming, visitsResult]) => {
          if (visitsResult.error) throw visitsResult.error;
          setRequests(incoming);
          setVisits(visitsResult.data as unknown as OwnVisit[]);
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

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="subtitle">{profile?.name ?? profile?.handle ?? 'Profile'}</ThemedText>
        {profile?.handle && (
          <ThemedText type="small" themeColor="textSecondary">
            @{profile.handle}
          </ThemedText>
        )}

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
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={styles.visitRow}>
              <ThemedText type="default">{item.places?.name ?? 'Unknown place'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.rating.toFixed(1)} ★
                {item.note ? ` · ${item.note}` : ''}
              </ThemedText>
            </ThemedView>
          )}
        />

        <Button label="Sign out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset,
    gap: Spacing.three,
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
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
});
