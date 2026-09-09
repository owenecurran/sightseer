import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ForgotPasswordForm } from '@/components/auth/auth-forms';
import { AuthScreen } from '@/components/auth/auth-screen';
import { ThemedText } from '@/components/themed-text';

export default function ForgotPasswordScreen() {
  return (
    <AuthScreen title="Reset password">
      <ForgotPasswordForm />
      <Link href="/(auth)/sign-in" style={styles.link}>
        <ThemedText type="linkPrimary">Back to sign in</ThemedText>
      </Link>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
  },
});
