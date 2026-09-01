import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { TERMS_SECTIONS, TERMS_VERSION } from '@/lib/terms';

// The terms gate. Sits ahead of onboarding in the root layout's guard chain,
// so nobody is asked for a handle or a birthdate before they have agreed to
// anything.
//
// No decline button: declining is closing the app, and a button that signs
// you out would be a worse version of the same thing. Anyone who wants out
// can sign out from the account they already have.
export default function TermsScreen() {
  const { session, refreshProfile } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    if (!session) return;
    setIsAccepting(true);
    setError(null);
    // The version is recorded alongside the timestamp: "agreed once" cannot
    // answer whether they agreed to what is currently in force.
    const { error: updateError } = await supabase
      .from('users')
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      })
      .eq('id', session.user.id);

    if (updateError) {
      setError(updateError.message);
      setIsAccepting(false);
      return;
    }
    // Refreshing the profile is what flips the guard and moves them on; no
    // manual navigation, same as the other gates in the chain.
    await refreshProfile();
    setIsAccepting(false);
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <ThemedText type="displaySerif">Terms of use</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Please read and accept these to continue.
          </ThemedText>

          {TERMS_SECTIONS.map((section) => (
            <View key={section.heading} style={styles.section}>
              <ThemedText type="sectionLabel">{section.heading}</ThemedText>
              <ThemedText type="body" themeColor="textSecondary">
                {section.body}
              </ThemedText>
            </View>
          ))}

          {error && (
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          )}

          <Button
            label={isAccepting ? 'Saving…' : 'I agree'}
            onPress={handleAccept}
            disabled={isAccepting}
          />

          <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
            Version {TERMS_VERSION}
          </ThemedText>
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
  section: {
    gap: Spacing.one,
  },
  version: {
    textAlign: 'center',
  },
});
