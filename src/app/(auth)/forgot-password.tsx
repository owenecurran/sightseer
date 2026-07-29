import * as Linking from 'expo-linking';
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

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }
    // Deliberately generic regardless of whether the email exists — same
    // account-enumeration reasoning as the "forgot email" question this
    // was built alongside: don't confirm or deny an email is registered.
    setSent(true);
  }

  if (sent) {
    return (
      <ThemedView type="screen" style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="title" style={styles.title}>
            Check your email
          </ThemedText>
          <ThemedText type="default" style={styles.title} themeColor="textSecondary">
            If an account exists for {email}, we sent a link to reset the password.
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
          Reset password
        </ThemedText>

        <ThemedView style={styles.form}>
          <TextField
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}
          <Button
            label="Send reset link"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={!email.trim()}
          />
        </ThemedView>

        <Link href="/(auth)/sign-in" style={styles.link}>
          <ThemedText type="linkPrimary">Back to sign in</ThemedText>
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
