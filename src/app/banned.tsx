import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { MIN_AGE_YEARS, UNDERAGE_REASON } from '@/lib/bans';
import { hasSupportEmail, SUPPORT_EMAIL } from '@/lib/legal';
import { supabase } from '@/lib/supabase';

// The terminal screen for a banned account. Reached only through the guard
// in _layout.tsx, which routes here instead of anywhere else the moment
// profile.banned_at is set.
//
// It is a screen rather than a forced sign-out for one reason: someone who
// is simply ejected to the sign-in page learns nothing, tries again, and
// ends up in support. Telling them what happened and how to contest it is
// both kinder and cheaper.
export default function BannedScreen() {
  const { profile } = useAuth();
  const isUnderage = profile?.ban_reason === UNDERAGE_REASON;

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif" style={styles.centered}>
          {isUnderage ? 'Not old enough yet' : 'Account suspended'}
        </ThemedText>

        <ThemedText type="default" themeColor="textSecondary" style={styles.centered}>
          {isUnderage
            ? `Sightseer is for people aged ${MIN_AGE_YEARS} and over. This account has been closed to posting.`
            : 'This account has been suspended for breaking the terms of use.'}
        </ThemedText>

        {/* Shown for both cases, and worded to cover the likeliest cause of
            an underage ban: a mistyped birth year, which an admin can lift.
            Renders nothing until SUPPORT_EMAIL is real — the same treatment
            the Settings links get. */}
        {hasSupportEmail && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {isUnderage
              ? 'If you entered your date of birth incorrectly, get in touch and we can put it right.'
              : 'If you think this was a mistake, get in touch.'}
          </ThemedText>
        )}

        {hasSupportEmail && (
          <Button
            label="Contact support"
            variant="secondary"
            onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          />
        )}

        <Button label="Sign out" onPress={() => supabase.auth.signOut()} />
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
    gap: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
});
