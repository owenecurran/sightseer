import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { ensureInviteCode, inviteUrl } from '@/lib/invites';
import { shareText } from '@/lib/share';
import { supabase } from '@/lib/supabase';

// The last gate before the app.
//
// This used to share a bare sentence with no link in it and then set
// has_shared_invite, which meant the gate could be satisfied without anyone
// ever being able to arrive: nothing that went out could be traced back, and
// "invite a friend" was really "open a share sheet". It now shares the
// person's own durable link, so an invite is a thing that can actually be
// followed and counted — see 20260909120000_invite_links.sql.
export default function InviteGateScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Minted on arrival rather than on the button press, so the link is on
  // screen to be read, screenshotted or copied by hand before anyone
  // commits to a share sheet — and so a failure to mint shows up here
  // rather than as a broken Share button.
  useEffect(() => {
    let cancelled = false;
    ensureInviteCode().then((minted) => {
      if (cancelled) return;
      if (!minted) {
        setError('Could not create your invite link just now.');
        return;
      }
      setCode(minted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const url = code ? inviteUrl(code) : null;

  async function handleShare() {
    if (!url) return;
    setError(null);

    const who = profile?.name ?? profile?.handle;
    const message = who
      ? `${who} wants you on Sightseer. ${url}`
      : `Someone wants you on Sightseer. ${url}`;

    const result = await shareText(message);

    if (result === 'cancelled') return;
    if (result === 'unsupported') {
      setError('Sharing is not supported in this browser — copy the link above instead.');
      return;
    }
    if (result === 'error') {
      setError('Could not copy the invite — please copy the link above and send it to a friend.');
      return;
    }

    if (!session) return;
    setIsSubmitting(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ has_shared_invite: true })
      .eq('id', session.user.id);
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    await refreshProfile();
    // Root layout re-evaluates guards once profile.has_shared_invite is true.
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.centered}>
          Invite a friend
        </ThemedText>
        <ThemedText type="default" style={styles.centered} themeColor="textSecondary">
          Sightseer grows by people bringing people. Share your link with someone before
          continuing.
        </ThemedText>

        {/* Shown rather than merely sent. The link is the thing being asked
            for, and a share sheet that swallows it whole gives no way to
            check what actually went out. */}
        <View style={styles.linkBox}>
          <ThemedText type="small" themeColor="textSecondary">
            Your invite link
          </ThemedText>
          <ThemedText type="body" selectable>
            {url ?? 'Creating your link…'}
          </ThemedText>
        </View>

        {error && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {error}
          </ThemedText>
        )}

        <Button
          label="Share"
          onPress={handleShare}
          loading={isSubmitting}
          disabled={!url}
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
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  linkBox: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
});
