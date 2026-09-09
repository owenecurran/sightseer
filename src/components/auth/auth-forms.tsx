import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { SocialAuthButtons } from '@/components/ui/social-auth-buttons';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { signInWithUsername } from '@/lib/username-signin';

// The sign-in and sign-up forms as components rather than whole screens.
//
// Extracted so the welcome screen can reveal one INSIDE its own panel
// instead of navigating away — the panel slides up and the chosen form is
// underneath it, which is one continuous movement rather than a page
// change. The standalone (auth) routes render the same components, so there
// is exactly one implementation of each form and the two entry points
// cannot drift apart.

export function SignInForm({ onError }: { onError?: (message: string | null) => void }) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function report(message: string | null) {
    setError(message);
    onError?.(message);
  }

  async function handleSignIn() {
    report(null);
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
      // On success, AuthProvider picks up the new session and the root
      // layout redirects.
    } catch (err) {
      report(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.form}>
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
      <SocialAuthButtons onError={report} />
    </View>
  );
}

export function SignUpForm({ onError }: { onError?: (message: string | null) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  function report(message: string | null) {
    setError(message);
    onError?.(message);
  }

  async function handleSignUp() {
    report(null);
    setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);

    if (signUpError) {
      report(signUpError.message);
      return;
    }
    // No session yet means email confirmation is required before sign-in
    // works. Otherwise AuthProvider picks up the new session and the root
    // layout redirects to onboarding.
    if (!data.session) {
      setNeedsEmailConfirmation(true);
    }
  }

  if (needsEmailConfirmation) {
    return (
      <View style={styles.form}>
        <ThemedText type="smallBold">Check your email</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          We sent a confirmation link to {email}. Confirm your address, then sign in.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.form}>
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
      <SocialAuthButtons onError={report} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
});
