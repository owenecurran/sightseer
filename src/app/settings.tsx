import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listBlockedUsers, unblockUser, type BlockedUser } from '@/lib/blocks';
import { setDiscoverableByContacts, setMyPhoneNumber } from '@/lib/contacts';
import { linkAppleAccount, linkGoogleAccount } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';

type NotificationKey =
  | 'notify_likes'
  | 'notify_comments'
  | 'notify_follows'
  | 'notify_tags'
  | 'notify_saves'
  | 'notify_friend_activity'
  | 'notify_nearby_reviews';

const NOTIFICATION_OPTIONS: { key: NotificationKey; label: string; defaultValue: boolean }[] = [
  { key: 'notify_likes', label: 'Likes on my visits', defaultValue: true },
  { key: 'notify_comments', label: 'Comments on my visits', defaultValue: true },
  { key: 'notify_follows', label: 'New followers and follow requests', defaultValue: true },
  { key: 'notify_tags', label: 'Someone tags me in a review', defaultValue: true },
  { key: 'notify_saves', label: 'Someone saves my board or travel book', defaultValue: true },
  { key: 'notify_friend_activity', label: 'People I follow post a new review', defaultValue: false },
  { key: 'notify_nearby_reviews', label: 'Weekly digest: new reviews at places I’ve been', defaultValue: false },
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

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [isSavingDiscoverable, setIsSavingDiscoverable] = useState(false);

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
    // Before signOut, not after: the delete is RLS-scoped to auth.uid(), so
    // once the session is gone the row can no longer be removed and the next
    // account on this device would inherit these notifications.
    await unregisterPush();
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
    // Just the toggled column. This used to resend every preference, spelled
    // out by hand — which meant adding a new one silently required editing
    // this list too, and failed to compile only because the type happened to
    // demand every key.
    const update = { [key]: !profile[key] } as Partial<Record<NotificationKey, boolean>>;
    const { error } = await supabase.from('users').update(update).eq('id', session.user.id);
    setSavingNotification(null);
    if (!error) await refreshProfile();
  }

  async function handleSavePhone() {
    if (!session || !phoneNumber.trim()) return;
    setIsSavingPhone(true);
    setPhoneSaved(false);
    try {
      await setMyPhoneNumber(session.user.id, phoneNumber.trim());
      setPhoneSaved(true);
      setPhoneNumber('');
      await refreshProfile();
    } catch {
      // Best-effort — no dedicated error state here, matches this screen's
      // existing light-touch error handling for similar single-field saves.
    } finally {
      setIsSavingPhone(false);
    }
  }

  async function handleToggleDiscoverable() {
    if (!session || !profile) return;
    setIsSavingDiscoverable(true);
    try {
      await setDiscoverableByContacts(session.user.id, !profile.discoverable_by_contacts);
      await refreshProfile();
    } catch {
      // Best-effort, same as handleSavePhone above.
    } finally {
      setIsSavingDiscoverable(false);
    }
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="settings" />

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
                checked={profile?.[option.key] ?? option.defaultValue}
                onPress={() => handleToggleNotification(option.key)}
                disabled={savingNotification === option.key}
              />
            ))}
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Home locations</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Set where you're based so reviews from further afield get grouped into trips.
            </ThemedText>
            <Button
              label="Manage home locations"
              variant="secondary"
              onPress={() => router.push('/home-locations')}
            />
          </View>

          <View style={styles.section}>
            <ThemedText type="sectionLabel">Contacts</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Add your phone number so friends who sync their contacts can find you. It's hashed before
              it ever leaves your device — never stored or shown as plain text.
            </ThemedText>
            <TextField
              placeholder="Phone number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
            />
            {phoneNumber.trim().length > 0 && (
              <Button label="Save number" onPress={handleSavePhone} loading={isSavingPhone} />
            )}
            {phoneSaved && (
              <ThemedText type="small" themeColor="sage">
                Number saved.
              </ThemedText>
            )}
            <CheckboxRow
              label="Let friends find me by my contact info"
              checked={profile?.discoverable_by_contacts ?? false}
              onPress={handleToggleDiscoverable}
              disabled={isSavingDiscoverable}
            />
            <Button
              label="Find friends from contacts"
              variant="secondary"
              onPress={() => router.push('/contacts-sync')}
            />
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
