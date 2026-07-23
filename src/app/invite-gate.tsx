import { useState } from 'react';
import { Platform, Share, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export default function InviteGateScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleShare() {
    setError(null);
    const message = `${profile?.name ?? 'A friend'} wants you to join them on the app.`;

    if (Platform.OS === 'web') {
      // Most desktop browsers don't implement navigator.share at all (it
      // silently throws), so falling back to a clipboard copy is the only
      // way this ever completes there — without it the button just does
      // nothing, with no explanation, which is the bug this fixes.
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (nav?.share) {
        try {
          await nav.share({ text: message });
        } catch {
          return;
        }
      } else if (nav?.clipboard?.writeText) {
        try {
          await nav.clipboard.writeText(message);
        } catch {
          setError('Could not copy the invite message — please copy it manually and send it to a friend.');
          return;
        }
      } else {
        setError('Sharing is not supported in this browser.');
        return;
      }
    } else {
      try {
        const result = await Share.share({ message });
        // dismissedAction (iOS cancel) means the share sheet never completed.
        if (result.action === Share.dismissedAction) return;
      } catch {
        // Share sheet failing to open shouldn't block the user from retrying.
        return;
      }
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
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Invite a friend
        </ThemedText>
        <ThemedText type="default" style={styles.title} themeColor="textSecondary">
          Share the app with someone before continuing.
        </ThemedText>
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}
        <Button label="Share" onPress={handleShare} loading={isSubmitting} />
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
  title: {
    textAlign: 'center',
  },
});
