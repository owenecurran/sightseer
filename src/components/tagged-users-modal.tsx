import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Fold, Unfold } from '@/components/ui/unfold';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getAvatarViewUrls } from '@/lib/avatar';
import { followUser, rankByConnection, unfollowOrCancelRequest, type RankedUser } from '@/lib/follows';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import { PUBLIC_USER_COLUMNS, type PublicProfile } from '@/lib/public-profile';
import { userErrorMessage } from '@/lib/user-error';

// Narrowed to what the public column grant actually returns — see
// PUBLIC_USER_COLUMNS.
type UserRow = PublicProfile;
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
        const { data, error: fetchError } = await supabase.from('users').select(PUBLIC_USER_COLUMNS).in('id', userIds);
        if (fetchError) throw fetchError;
        const [ranked, avatars] = await Promise.all([
          rankByConnection(data, session.user.id),
          getAvatarViewUrls(userIds),
        ]);
        setUsers(ranked);
        setAvatarUrls(avatars);
      } catch (err) {
        setError(userErrorMessage(err, 'Could not load tagged people.'));
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
        });
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: status } : u)));
      } else {
        await unfollowOrCancelRequest(session.user.id, user.id);
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, followStatus: null } : u)));
      }
    } catch (err) {
      setError(userErrorMessage(err, 'Could not update that follow.'));
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
        <Unfold style={styles.sheet}>
          <Fold>
            <ThemedText type="displaySerif">Tagged</ThemedText>
          </Fold>

          {error && (
            <Fold>
              <ThemedText type="small" themeColor="danger">
                {error}
              </ThemedText>
            </Fold>
          )}
          {isLoading && (
            <Fold>
              <ThemedText type="small">Loading…</ThemedText>
            </Fold>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {users.map((user) => (
              <Fold key={user.id}>
                <Pressable onPress={() => handleOpenProfile(user.id)} style={styles.row}>
                  <Avatar uri={avatarUrls[user.id]} name={user.name ?? user.handle} size={44} />
                  <View style={styles.info}>
                    <ThemedText type="smallBold">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                    {user.handle && (
                      <ThemedText type="small" themeColor="textMeta">
                        @{user.handle}
                      </ThemedText>
                    )}
                  </View>
                  {session?.user.id !== user.id && (
                    <Pressable
                      onPress={() => handleFollowToggle(user)}
                      disabled={updatingId === user.id}
                      hitSlop={8}>
                      <ThemedText type="action" themeColor={user.followStatus === 'accepted' ? 'textSecondary' : 'sage'}>
                        {followLabel(user.followStatus)}
                      </ThemedText>
                    </Pressable>
                  )}
                </Pressable>
              </Fold>
            ))}
          </ScrollView>

          <Fold>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <ThemedText type="action">
                Close
              </ThemedText>
            </Pressable>
          </Fold>
        </Unfold>
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
  // A percentage cap works here because the overlay this sits in has a
  // definite height to take it of; the scroll view inside shrinks to it.
  sheet: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    padding: Spacing.four,
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
