import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  async function handleSignUp() {
    setError(null);
    setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    // No session yet means email confirmation is required before sign-in works.
    if (!data.session) {
      setNeedsEmailConfirmation(true);
    }
    // Otherwise AuthProvider picks up the new session and the root layout redirects to onboarding.
  }

  if (needsEmailConfirmation) {
    return (
      <ThemedView type="screen" style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Check your email
          </ThemedText>
          <ThemedText type="default" style={styles.title} themeColor="textSecondary">
            We sent a confirmation link to {email}. Confirm your address, then sign in.
          </ThemedText>
          <Link href="/(auth)/sign-in" style={styles.link}>
            <ThemedText type="linkPrimary">Back to sign in</ThemedText>
          </Link>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Create account
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          <Button label="Sign up" onPress={handleSignUp} loading={isSubmitting} />
        </ThemedView>

        <Link href="/(auth)/sign-in" style={styles.link}>
          <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
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
