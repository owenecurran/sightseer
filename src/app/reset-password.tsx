import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Recovery tokens arrive in the URL fragment (#access_token=...&refresh_token=...),
// not query params — and the client is configured with detectSessionInUrl:
// false, so nothing auto-consumes this. Parsed and exchanged manually.
function extractRecoveryTokens(fragment: string): { accessToken: string; refreshToken: string } | null {
  const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export default function ResetPasswordScreen() {
  const nativeUrl = Platform.OS === 'web' ? null : Linking.useURL();
  const { session } = useAuth();
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      let fragment = '';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        fragment = window.location.hash;
      } else if (nativeUrl) {
        const hashIndex = nativeUrl.indexOf('#');
        fragment = hashIndex === -1 ? '' : nativeUrl.slice(hashIndex);
      }

      const tokens = extractRecoveryTokens(fragment);
      if (!tokens) {
        // Just the fact: the buttons under it say what to do next.
        setError('This reset link is invalid or has expired.');
        return;
      }

      const { error: sessionError } = await supabase.auth.setSession({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
      });
      if (sessionError) {
        setError(sessionError.message);
        return;
      }
      setSessionReady(true);
    })();
  }, [nativeUrl]);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <ThemedView type="screen" style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.content]}>
          <ThemedText type="displaySerif" style={styles.title}>
            Password updated
          </ThemedText>
          <ThemedText type="lead" style={styles.title}>
            You&apos;re signed in with your new password.
          </ThemedText>
          {/* Every state of this screen needs a way off it. It had none:
              arriving from an email there is nothing under it in the stack,
              and iOS has no back button, so "Password updated" was where
              the app ended. */}
          <Button label="Continue" onPress={() => router.replace('/')} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* bottomOffset keeps Update password in view, not just the field. */}
        <KeyboardAwareScroll
          style={styles.safeArea}
          contentContainerStyle={styles.content}
          bottomOffset={96}
          keyboardShouldPersistTaps="handled">
        {/* The display serif every other screen title is set in, as on
            onboarding. This was the plain 48pt system title, which wrapped
            to two lines and was the one heading in the flow that looked
            like a default. */}
        <ThemedText type="displaySerif" style={styles.title}>
          Set a new password
        </ThemedText>

        {error && (
          <ThemedText type="small" themeColor="danger" style={styles.title}>
            {error}
          </ThemedText>
        )}

        {/* A link that did not work. Signed out -- the usual case -- the
            useful thing is another link; already signed in, it is just the
            way back into the app. */}
        {error && !sessionReady && (
          <ThemedView style={styles.form}>
            {session ? (
              <Button label="Back to the app" onPress={() => router.replace('/')} />
            ) : (
              <>
                <Button label="Send a new link" onPress={() => router.replace('/forgot-password')} />
                <Button label="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />
              </>
            )}
          </ThemedView>
        )}

        {sessionReady && (
          <ThemedView style={styles.form}>
            <TextField
              placeholder="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="newPassword"
            />
            <Button
              label="Update password"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={!password.trim()}
            />
          </ThemedView>
        )}
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
