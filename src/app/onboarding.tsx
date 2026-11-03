import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
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
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* bottomOffset keeps Continue in view under the Name field, not
            just the field itself. */}
        <KeyboardAwareScroll
          style={styles.safeArea}
          contentContainerStyle={styles.content}
          bottomOffset={96}
          keyboardShouldPersistTaps="handled">
        <ThemedText type="displaySerif" style={styles.title}>
          Set up your profile
        </ThemedText>
        <ThemedText type="lead" style={styles.title}>
          Pick a username and display name.
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextField placeholder="Username" value={handle} onChangeText={setHandle} />
          <TextField placeholder="Name" value={name} onChangeText={setName} autoCapitalize="words" />

          {error && (
            <ThemedText type="small" themeColor="danger">
              {error}
            </ThemedText>
          )}
          <Button label="Continue" onPress={handleSubmit} loading={isSubmitting} />
        </ThemedView>
        </KeyboardAwareScroll>
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
  },
  // Centred while it fits, scrollable when the keyboard leaves it too little
  // room. This was a plain centred column with no scroll view at all, so on
  // a short phone the keyboard came up over the button and nothing could
  // move it. flexGrow, not flex: with flex the container is pinned to the
  // viewport and there is never anything to scroll.
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.five,
  },
  title: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
  },
});
