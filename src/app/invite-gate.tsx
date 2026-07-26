import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { shareText } from '@/lib/share';
import { supabase } from '@/lib/supabase';

export default function InviteGateScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleShare() {
    setError(null);
    const message = `${profile?.name ?? 'A friend'} wants you to join them on the app.`;
    const result = await shareText(message);

    if (result === 'cancelled') return;
    if (result === 'unsupported') {
      setError('Sharing is not supported in this browser.');
      return;
    }
    if (result === 'error') {
      setError('Could not copy the invite message — please copy it manually and send it to a friend.');
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
