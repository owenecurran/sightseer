import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { VerifyEmailForm } from '@/components/auth/auth-forms';
import { AuthScreen } from '@/components/auth/auth-screen';
import { ThemedText } from '@/components/themed-text';

// Reached from two directions: straight after signing up, and after a
// sign-in that bounced because the address was never confirmed. Both pass
// the address as a param rather than this screen re-deriving it — there is
// no session yet to read it from.
export default function VerifyEmailScreen() {
  const { email } = useLocalSearchParams<{ email?: string }>();

  return (
    <AuthScreen title="Check your email">
      {email ? (
        <VerifyEmailForm email={email} />
      ) : (
        // Only reachable by opening the route directly with no param. There
        // is nothing to verify against, so it says so rather than showing a
        // code field that could never succeed.
        <ThemedText type="default" themeColor="textSecondary">
          We do not know which address to verify. Sign in again to start over.
        </ThemedText>
      )}
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
