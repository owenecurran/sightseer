import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { SignUpForm } from '@/components/auth/auth-forms';
import { AuthScreen } from '@/components/auth/auth-screen';
import { ThemedText } from '@/components/themed-text';

// Renders the same SignUpForm the welcome panel does, so the confirm-
// password field, the Turnstile check and the resend-confirmation screen
// are here too. This screen previously carried its own copy of the signup
// call, which is why none of those reached it.
export default function SignUpScreen() {
  return (
    <AuthScreen title="Create account">
      <SignUpForm />
      <Link href="/(auth)/sign-in" style={styles.link}>
        <ThemedText type="linkPrimary">Already have an account? Sign in</ThemedText>
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
  },
});
