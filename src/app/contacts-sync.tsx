import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getDeviceContactsHashed, matchContactsToUsers, type DeviceContact, type MatchedUser } from '@/lib/contacts';
import { followUser } from '@/lib/follows';
import { shareText } from '@/lib/share';

type MatchedRow = { contactName: string; user: MatchedUser };
type UnmatchedRow = { contactName: string };

export default function ContactsSyncScreen() {
  const { session } = useAuth();
  const [status, setStatus] = useState<'idle' | 'loading' | 'denied' | 'loaded' | 'error'>('idle');
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedRow[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setStatus('loading');
    setError(null);
    try {
      const contacts = await getDeviceContactsHashed();
      if (contacts === 'denied') {
        setStatus('denied');
        return;
      }
      const users = await matchContactsToUsers(contacts.map((c) => c.hash));
      const byHash = new Map(users.map((u) => [u.hashed_phone, u]));

      const matchedRows: MatchedRow[] = [];
      const unmatchedRows: UnmatchedRow[] = [];
      const seenUserIds = new Set<string>();
      for (const contact of contacts) {
        const user = byHash.get(contact.hash);
        if (user && !seenUserIds.has(user.id)) {
          seenUserIds.add(user.id);
          matchedRows.push({ contactName: contact.name, user });
        } else if (!user) {
          unmatchedRows.push({ contactName: contact.name });
        }
      }
      setMatched(matchedRows);
      setUnmatched(unmatchedRows);
      setStatus('loaded');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync contacts.');
      setStatus('error');
    }
  }

  async function handleFollow(row: MatchedRow) {
    if (!session) return;
    try {
      await followUser({ followerId: session.user.id, followeeId: row.user.id, followeeIsPrivate: row.user.is_private });
      setFollowingIds((prev) => new Set(prev).add(row.user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not follow that person.');
    }
  }

  function handleInvite(contactName: string) {
    shareText(`Hey ${contactName}, come check out Sightseer with me!`).catch(() => {});
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackLink seed="contacts-sync" />
        <ThemedText type="displaySerif">Find friends</ThemedText>

        {status === 'idle' && (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Sightseer can check your contacts against people already using the app, and let you invite
              the ones who aren't. Your contacts never leave your device unhashed.
            </ThemedText>
            <Button label="Sync contacts" onPress={handleSync} />
          </>
        )}

        {status === 'loading' && <PageLoader />}

        {status === 'denied' && (
          <ThemedText type="small" themeColor="textSecondary">
            Contacts permission was denied. You can allow it from your device's system settings for
            Sightseer, then come back and try again.
          </ThemedText>
        )}

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        {status === 'loaded' && (
          <>
            <View style={styles.section}>
              <ThemedText type="sectionLabel">Already on Sightseer</ThemedText>
              {matched.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  None of your contacts are on Sightseer yet.
                </ThemedText>
              )}
              {matched.map((row) => (
                <Pressable
                  key={row.user.id}
                  onPress={() => router.push({ pathname: '/user/[id]', params: { id: row.user.id } })}>
                  <ThemedView type="backgroundSelected" style={styles.row}>
                    <ThemedText type="default">{row.user.name ?? row.user.handle ?? row.contactName}</ThemedText>
                    <Pressable onPress={() => handleFollow(row)} disabled={followingIds.has(row.user.id)} hitSlop={8}>
                      <ThemedText type="small" themeColor={followingIds.has(row.user.id) ? 'textSecondary' : 'sage'}>
                        {followingIds.has(row.user.id) ? 'Following ✓' : 'Follow'}
                      </ThemedText>
                    </Pressable>
                  </ThemedView>
                </Pressable>
              ))}
            </View>

            <View style={styles.section}>
              <ThemedText type="sectionLabel">Not on Sightseer yet</ThemedText>
              {unmatched.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  Everyone with a number matches an existing account.
                </ThemedText>
              )}
              {unmatched.map((row, index) => (
                <View key={`${row.contactName}-${index}`} style={styles.row}>
                  <ThemedText type="default">{row.contactName}</ThemedText>
                  <Pressable onPress={() => handleInvite(row.contactName)} hitSlop={8}>
                    <ThemedText type="small" themeColor="sage">
                      Invite
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
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
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
});
