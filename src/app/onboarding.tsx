import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export default function OnboardingScreen() {
  const { session, refreshProfile } = useAuth();
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    setError(null);

    const normalizedHandle = handle.trim().toLowerCase();
    if (!HANDLE_PATTERN.test(normalizedHandle)) {
      setError('Username must be 3-20 characters: lowercase letters, numbers, underscores.');
      return;
    }
    if (!name.trim()) {
      setError('Enter your name.');
      return;
    }
    if (!session) return;

    setIsSubmitting(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ handle: normalizedHandle, name: name.trim() })
      .eq('id', session.user.id);
    setIsSubmitting(false);

    if (updateError) {
      setError(
        updateError.code === '23505' ? 'That username is taken.' : updateError.message
      );
      return;
    }

    await refreshProfile();
    // Root layout re-evaluates guards once profile.handle is set and redirects.
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Set up your profile
        </ThemedText>
        <ThemedText type="default" style={styles.title} themeColor="textSecondary">
          Pick a username and display name.
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextField placeholder="Username" value={handle} onChangeText={setHandle} />
          <TextField placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          <Button label="Continue" onPress={handleSubmit} loading={isSubmitting} />
        </ThemedView>
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
  form: {
    gap: Spacing.three,
  },
});
