import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { recordInviteClick, setPendingInviteCode } from '@/lib/invites';

// The native half of an invite link.
//
// Reached when someone with the app already installed opens an invite —
// the universal/app link hands the path straight to the router rather than
// to a browser. There is nothing to market to them: they have the app, so
// the only job here is to remember which code brought them and get out of
// the way. The root layout's guard chain decides where they actually
// belong, which is why this replaces with '/' rather than picking a screen.
//
// The web sibling ([code].web.tsx) is the marketing page. This base file
// also exists because Expo Router requires it: "platform-specific
// extensions are supported in the src/app directory only if a
// non-platform version also exists."
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();

  useEffect(() => {
    if (!code) {
      router.replace('/');
      return;
    }
    // Parked, not redeemed. There may be no account yet, and redemption is
    // an authenticated call — consumePendingInvite picks this up on the
    // first signed-in moment after it.
    setPendingInviteCode(code);
    // Deliberately not awaited: a stats write must never sit between
    // someone tapping a link and the app opening.
    recordInviteClick(code);
    router.replace('/');
  }, [code]);

  return (
    <ThemedView type="screen" style={styles.container}>
      <ActivityIndicator />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
