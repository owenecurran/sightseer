import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { SocialAuthButtons } from '@/components/ui/social-auth-buttons';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { signInWithUsername } from '@/lib/username-signin';

export default function SignInScreen() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setIsSubmitting(true);
    try {
      // Email sign-in is unchanged; a bare handle (no "@") routes through
      // resolve-username-signin instead — see src/lib/username-signin.ts.
      if (identifier.includes('@')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
        });
        if (signInError) throw signInError;
      } else {
        await signInWithUsername(identifier, password);
      }
      // On success, AuthProvider picks up the new session and the root layout redirects.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Welcome back
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextField
            placeholder="Email or username"
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            textContentType="username"
          />
          <TextField
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          <Button label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
          <SocialAuthButtons onError={setError} />
        </ThemedView>

        <Link href="/(auth)/forgot-password" style={styles.link}>
          <ThemedText type="linkPrimary">Forgot password?</ThemedText>
        </Link>

        <Link href="/(auth)/sign-up" style={styles.link}>
          <ThemedText type="linkPrimary">Don&apos;t have an account? Sign up</ThemedText>
        </Link>
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
  link: {
    alignSelf: 'center',
  },
});
