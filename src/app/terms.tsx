import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TermsContent, TermsVersionStamp } from '@/components/terms-content';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

// The terms as a thing you can go and read — Settings' "Terms of use" row.
// Nothing to agree to here; the gate that collects acceptance is the
// separate `accept-terms` route.
//
// Registered for any signed-in user, so the Settings link always has a route
// to push. That is the whole reason this is not the same route as the gate:
// a single route could not both stay registered for Settings and disappear
// on acceptance, and it was the disappearing that moved people on.
export default function TermsScreen() {
  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <BackLink seed="terms" />
          <ThemedText type="displaySerif">Terms of use</ThemedText>

          <TermsContent />

          <TermsVersionStamp />
        </ScrollView>
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
    width: '100%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
});
