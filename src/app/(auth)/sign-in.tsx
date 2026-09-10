import { Link, useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { SignInForm } from '@/components/auth/auth-forms';
import { AuthScreen } from '@/components/auth/auth-screen';
import { ThemedText } from '@/components/themed-text';

export default function SignInScreen() {
  const router = useRouter();

  return (
    <AuthScreen title="Welcome back">
      {/* The form renders its own "Forgot password?" link when given a
          handler; standalone that navigates, where the welcome panel swaps
          the form in place. */}
      <SignInForm onForgotPassword={() => router.push('/(auth)/forgot-password')} />
      <Link href="/(auth)/sign-up" style={styles.link}>
        <ThemedText type="linkPrimary">Don’t have an account? Sign up</ThemedText>
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
  },
});
