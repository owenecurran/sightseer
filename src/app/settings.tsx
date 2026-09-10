import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { SettingsRow } from '@/components/ui/settings-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { DeleteAccountModal } from '@/components/delete-account-modal';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { listBlockedUsers } from '@/lib/blocks';
import { setDiscoverableByContacts, setMyPhoneNumber } from '@/lib/contacts';
import { linkAppleAccount, linkGoogleAccount } from '@/lib/social-auth';
import { supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';
import { hasPrivacyPolicy, hasSupportEmail, PRIVACY_POLICY_URL, SUPPORT_EMAIL } from '@/lib/legal';

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
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSavingPhone, setIsSavingPhone] = useState(false);
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [isSavingDiscoverable, setIsSavingDiscoverable] = useState(false);

  const [isLinkingApple, setIsLinkingApple] = useState(false);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkedProviders = new Set(session?.user.identities?.map((identity) => identity.provider) ?? []);

  // Just how many, for the row's subtitle. The list, and unblocking, live
  // on /blocked-accounts. Null until the first load resolves, so the row
  // does not flash "You have not blocked anyone" at someone who has.
  const [blockedCount, setBlockedCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!session) return;
      // Refetched on focus so the count is right after unblocking someone
      // on the screen this row leads to.
      listBlockedUsers(session.user.id)
        .then((users) => setBlockedCount(users.length))
        .catch(() => setBlockedCount(null));
    }, [session])
  );

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

          {/* Everything that leads somewhere else, first and together.
              These were scattered between the inline settings as secondary
              Buttons, which buried them and made the page read as one long
              form rather than as a menu that also has some settings on it. */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <SettingsRow
              label="Notifications"
              description="Choose what reaches your phone"
              onPress={() => router.push('/notification-settings')}
            />
            <SettingsRow
              label="Home locations"
              description="Where you are based, so trips group correctly"
              onPress={() => router.push('/home-locations')}
            />
            <SettingsRow
              label="Find friends from contacts"
              description="Match your contacts against people already here"
              onPress={() => router.push('/contacts-sync')}
            />
          </ThemedView>

          {/* Who can see you, and who cannot. Blocking lives here rather
              than in its own section because it answers the same question
              the private-account toggle does. */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="sectionLabel">Privacy</ThemedText>
            <CheckboxRow
              label="Private account"
              description="Only approved followers can see my profile and visits"
              checked={profile?.is_private ?? false}
              onPress={handleTogglePrivacy}
              disabled={isSavingPrivacy}
            />

            <View style={styles.divider} />

            {/* The count only, with the list itself on its own screen --
                it has no ceiling, and thirty blocked accounts inline would
                push everything below this off the page. */}
            <SettingsRow
              label="Blocked accounts"
              description={
                blockedCount === null
                  ? 'Manage who cannot see you'
                  : blockedCount === 0
                    ? 'You have not blocked anyone'
                    : `${blockedCount} ${blockedCount === 1 ? 'account' : 'accounts'} blocked`
              }
              onPress={() => router.push('/blocked-accounts')}
            />
          </ThemedView>

          {/* The phone number and the discoverability toggle are one
              decision -- the number is only useful if the toggle is on -- so
              they belong together rather than sitting either side of the
              contact-sync action they were previously mixed with. */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="sectionLabel">Finding you</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Add your phone number so friends who sync their contacts can find you. It is hashed
              before it ever leaves your device, and never stored or shown as plain text.
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
          </ThemedView>

          {/* Sign-in credentials in one card: the providers you can sign in
              with, the password you sign in with, and the way out. These
              were three separate sections, with the sign-out button
              stranded at the top of the page under "Account" next to a
              privacy toggle it has nothing to do with. */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="sectionLabel">Account</ThemedText>

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

            <View style={styles.divider} />

            <ThemedText type="small" themeColor="textSecondary">
              Change password
            </ThemedText>
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

            <View style={styles.divider} />

            <Button label="Sign out" variant="secondary" onPress={handleSignOut} loading={isSigningOut} />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="sectionLabel">About</ThemedText>
            <SettingsRow label="Terms of use" onPress={() => router.push('/terms')} />
            {/* Both render only once a real destination is configured -- see
                legal.ts. A link that 404s reads worse to a reviewer than no
                link at all. */}
            {hasPrivacyPolicy && (
              <SettingsRow
                label="Privacy policy"
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
              />
            )}
            {hasSupportEmail && (
              <SettingsRow
                label="Contact support"
                onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              />
            )}
          </ThemedView>

          {/* Last, alone, and in the danger colour. It previously sat in a
              section styled exactly like About, with its action text the
              same sage as "Terms of use". */}
          <ThemedView type="backgroundElement" style={styles.card}>
            <SettingsRow
              label="Delete my account"
              description="Permanently deletes your account and everything in it. This cannot be undone."
              tone="danger"
              onPress={() => setIsDeleteOpen(true)}
            />
          </ThemedView>
        </Animated.ScrollView>
        <DeleteAccountModal
          visible={isDeleteOpen}
          handle={profile?.handle ?? null}
          onCancel={() => setIsDeleteOpen(false)}
          onDeleted={() => setIsDeleteOpen(false)}
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
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  // Every group is a card now. The page used to be flat sectionLabels on
  // the screen background, which gave a reader no way to see where one
  // group ended and the next began -- the same treatment the rest of the
  // app already uses for grouped content (moderation.tsx, the filter sheet).
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  // Separates two related-but-distinct things inside one card, where a
  // second sectionLabel would imply they are unrelated.
  divider: {
    height: 1,
    backgroundColor: 'rgba(234,231,207,0.12)',
    marginVertical: Spacing.one,
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
});
