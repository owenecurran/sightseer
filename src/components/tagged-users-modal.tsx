import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { followUser, rankByConnection, unfollowOrCancelRequest, type RankedUser } from '@/lib/follows';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

type UserRow = Database['public']['Tables']['users']['Row'];
type FollowStatus = Database['public']['Tables']['follows']['Row']['status'];

function followLabel(status: FollowStatus | null): string {
  if (status === 'accepted') return 'Following';
  if (status === 'pending') return 'Requested';
  return 'Follow';
}

type TaggedUsersModalProps = {
  visible: boolean;
  onClose: () => void;
  userIds: string[];
};

// The "+N others" destination — every tagged person on one post, each row
// enough to act on directly (jump to their profile, follow them) without
// leaving the feed/visit page first. Same centered-dialog template as
// ReportModal (dimmed backdrop + centered sheet), and the same
// rankByConnection ranking (following first, then most-mutuals-first) the
// people-search surfaces already use, for the same "people you already
// know surface first" reasoning.
export function TaggedUsersModal({ visible, onClose, userIds }: TaggedUsersModalProps) {
  const { session } = useAuth();
  const [users, setUsers] = useState<RankedUser<UserRow>[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !session || userIds.length === 0) return;
    setIsLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: fetchError } = await supabase.from('users').select('*').in('id', userIds);
        if (fetchError) throw fetchError;
        const [ranked, avatars] = await Promise.all([
          rankByConnection(data, session.user.id),
          getAvatarViewUrls(userIds),
        ]);
        setUsers(ranked);
        setAvatarUrls(avatars);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load tagged people.');
      } finally {
        setIsLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, session, userIds.join(',')]);

  async function handleFollowToggle(user: RankedUser<UserRow>) {
    if (!session) return;
    setError(null);
    setUpdatingId(user.id);
    try {
      if (user.followStatus === null) {
        const status = await followUser({
          followerId: session.user.id,
          followeeId: user.id,
          followeeIsPrivate: user.is_private,
        });
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: status } : u)));
      } else {
        await unfollowOrCancelRequest(session.user.id, user.id);
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: null } : u)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update that follow.');
    } finally {
      setUpdatingId(null);
    }
  }

  function handleOpenProfile(userId: string) {
    onClose();
    router.push({ pathname: '/user/[id]', params: { id: userId } });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView type="background" style={styles.sheet}>
          <ThemedText type="headline">Tagged</ThemedText>

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          {isLoading && <ThemedText type="small">Loading…</ThemedText>}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {users.map((user) => (
              <Pressable key={user.id} onPress={() => handleOpenProfile(user.id)} style={styles.row}>
                <Avatar uri={avatarUrls[user.id]} name={user.name ?? user.handle} size={44} />
                <View style={styles.info}>
                  <ThemedText type="smallBold">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                  {user.handle && (
                    <ThemedText type="small" themeColor="textSecondary">
                      @{user.handle}
                    </ThemedText>
                  )}
                </View>
                {session?.user.id !== user.id && (
                  <Pressable
                    onPress={() => handleFollowToggle(user)}
                    disabled={updatingId === user.id}
                    hitSlop={8}>
                    <ThemedText type="smallBold" themeColor={user.followStatus === 'accepted' ? 'textSecondary' : 'sage'}>
                      {followLabel(user.followStatus)}
                    </ThemedText>
                  </Pressable>
                )}
              </Pressable>
            ))}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.closeButton}>
            <ThemedText type="small" themeColor="textSecondary">
              Close
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  info: {
    flex: 1,
    gap: Spacing.half,
  },
  closeButton: {
    alignSelf: 'center',
  },
});
