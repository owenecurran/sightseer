import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PaperNote } from '@/components/ui/journal';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { hasSupportEmail, SUPPORT_EMAIL } from '@/lib/legal';

// Shown in place of the app when someone is signed in but their account
// could not be fetched. Nearly always that is no connection at launch.
//
// The root layout decides every screen from the profile: terms accepted,
// handle chosen, and so on down the signup steps. Without a profile all of
// those read as not done, so a phone opened offline sent an account that
// signed up months ago to the Terms screen, and nothing fetched the profile
// again once the connection was back. Pressing Accept there failed too,
// being offline. This says what is actually wrong and tries again.
export function AccountUnreachable() {
  const { refreshProfile } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);

  async function retry() {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setIsRetrying(false);
    }
  }

  // Tries again by itself on coming back to the app: the usual fix is
  // turning wifi or data back on, which means leaving the app to do it.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshProfile();
    });
    return () => subscription.remove();
  }, [refreshProfile]);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* The note the app leaves for the person (see PaperNote), as on
              the crash page, rather than a title over a paragraph and a
              button. Its red-pen line says when it is already trying. */}
          <PaperNote
            seed="account-unreachable"
            title="Could not reach Sightseer"
            body="Your account is fine, it just could not load. Check that you are connected."
            actionLabel={isRetrying ? 'trying' : 'try again'}
            onPress={() => void retry()}
          />
          {hasSupportEmail && (
            <ThemedText
              type="action"
              style={styles.after}
              onPress={() =>
                void Linking.openURL(
                  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Sightseer will not load my account')}`,
                ).catch(() => {})
              }>
              Still stuck? Email us
            </ThemedText>
          )}
        </View>
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
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  after: {
    alignSelf: 'center',
  },
});
