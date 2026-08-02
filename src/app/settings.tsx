import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks';
import { linkAppleAccount, linkGoogleAccount } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';

type NotificationKey = 'notify_likes' | 'notify_comments' | 'notify_follows';

const NOTIFICATION_OPTIONS: { key: NotificationKey; label: string }[] = [
  { key: 'notify_likes', label: 'Likes on my visits' },
  { key: 'notify_comments', label: 'Comments on my visits' },
  { key: 'notify_follows', label: 'New followers and follow requests' },
];

function CheckboxRow({
  label,
  checked,
  onPress,
  disabled,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={styles.checkboxRow}>
      <ThemedView type={checked ? 'backgroundSelected' : 'backgroundElement'} style={styles.checkbox}>
        {checked && <ThemedText type="smallBold">✓</ThemedText>}
      </ThemedView>
      <ThemedText type="small">{label}</ThemedText>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const scrollHandler = useHideOnScrollHandler();
  const bottomInset = useBottomTabInset();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [isSavingPrivacy, setIsSavingPrivacy] = useState(false);
  const [savingNotification, setSavingNotification] = useState<NotificationKey | null>(null);

  const [isLinkingApple, setIsLinkingApple] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkedProviders = new Set(session?.user.identities?.map((identity) => identity.provider) ?? []);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [blockedError, setBlockedError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      listBlockedUsers(session.user.id)
        .then(setBlockedUsers)
        .catch((err) => setBlockedError(err instanceof Error ? err.message : 'Could not load blocked users.'));
    }, [session])
  );

  async function handleUnblock(blockedId: string) {
    if (!session) return;
    setBlockedError(null);
    setUnblockingId(blockedId);
    try {
      await unblockUser(session.user.id, blockedId);
      setBlockedUsers((prev) => prev.filter((u) => u.id !== blockedId));
    } catch (err) {
      setBlockedError(err instanceof Error ? err.message : 'Could not unblock that user.');
    } finally {
      setUnblockingId(null);
    }
  }

  async function handleLinkApple() {
    setLinkError(null);
    setIsLinkingApple(true);
    try {
      await linkAppleAccount();
      await refreshProfile();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not connect your Apple account.');
    } finally {
      setIsLinkingApple(false);
    }
  }

  async function handleLinkGoogle() {
    setLinkError(null);
    setIsLinkingGoogle(true);
    try {
      await linkGoogleAccount();
      await refreshProfile();
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Could not connect your Google account.');
    } finally {
      setIsLinkingGoogle(false);
    }
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsSigningOut(false);
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }
    setIsSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setIsSavingPassword(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setPasswordSuccess(true);
    setNewPassword('');
    setConfirmPassword('');
  }

  async function handleTogglePrivacy() {
    if (!session || !profile) return;
    setIsSavingPrivacy(true);
    const { error } = await supabase
      .from('users')
      .update({ is_private: !profile.is_private })
      .eq('id', session.user.id);
    setIsSavingPrivacy(false);
    if (!error) await refreshProfile();
  }

  async function handleToggleNotification(key: NotificationKey) {
    if (!session || !profile) return;
    setSavingNotification(key);
    const update: Record<NotificationKey, boolean> = {
      notify_likes: profile.notify_likes,
      notify_comments: profile.notify_comments,
      notify_follows: profile.notify_follows,
    };
    update[key] = !profile[key];
    const { error } = await supabase.from('users').update(update).eq('id', session.user.id);
    setSavingNotification(null);
    if (!error) await refreshProfile();
  }

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

          <ThemedText type="displaySerif">Settings</ThemedText>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Account</ThemedText>

            <Pressable onPress={handleTogglePrivacy} disabled={isSavingPrivacy} style={styles.checkboxRow}>
              <ThemedView
                type={profile?.is_private ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.checkbox}>
                {profile?.is_private && <ThemedText type="smallBold">✓</ThemedText>}
              </ThemedView>
              <ThemedText type="small">
                Private account — only approved followers can see my profile and visits
              </ThemedText>
            </Pressable>

            <Button label="Sign out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Change password</ThemedText>
            <TextField
              placeholder="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              textContentType="newPassword"
            />
            <TextField
              placeholder="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              textContentType="newPassword"
            />
            {passwordError && (
              <ThemedText type="small" themeColor="textSecondary">
                {passwordError}
              </ThemedText>
            )}
            {passwordSuccess && (
              <ThemedText type="small" themeColor="sage">
                Password updated.
              </ThemedText>
            )}
            <Button label="Update password" onPress={handleChangePassword} loading={isSavingPassword} />
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Notifications</ThemedText>
            {NOTIFICATION_OPTIONS.map((option) => (
              <CheckboxRow
                key={option.key}
                label={option.label}
                checked={profile?.[option.key] ?? true}
                onPress={() => handleToggleNotification(option.key)}
                disabled={savingNotification === option.key}
              />
            ))}
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Blocked users</ThemedText>
            {blockedError && (
              <ThemedText type="small" themeColor="textSecondary">
                {blockedError}
              </ThemedText>
            )}
            {blockedUsers.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                You haven’t blocked anyone.
              </ThemedText>
            ) : (
              blockedUsers.map((user) => (
                <View key={user.id} style={styles.blockedRow}>
                  <ThemedText type="small">{user.name ?? user.handle ?? 'Someone'}</ThemedText>
                  <Pressable onPress={() => handleUnblock(user.id)} disabled={unblockingId === user.id}>
                    <ThemedText type="small" themeColor="sage">
                      Unblock
                    </ThemedText>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Connected accounts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Requires Apple/Google developer setup to actually complete — see AGENTS.md.
            </ThemedText>
            {Platform.OS === 'ios' && (
              <Button
                label={linkedProviders.has('apple') ? 'Apple account connected' : 'Connect Apple account'}
                variant="secondary"
                onPress={handleLinkApple}
                loading={isLinkingApple}
                disabled={linkedProviders.has('apple')}
              />
            )}
            {Platform.OS !== 'web' && (
              <Button
                label={linkedProviders.has('google') ? 'Google account connected' : 'Connect Google account'}
                variant="secondary"
                onPress={handleLinkGoogle}
                loading={isLinkingGoogle}
                disabled={linkedProviders.has('google')}
              />
            )}
            {linkError && (
              <ThemedText type="small" themeColor="textSecondary">
                {linkError}
              </ThemedText>
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
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  section: {
    gap: Spacing.two,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
