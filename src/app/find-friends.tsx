import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindFriendsPanel } from '@/components/find-friends-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Finding people, as one step of signing up.
//
// ONE step, holding both halves, because neither half works alone: sharing
// your contacts finds the people who saved their own number, and saving your
// number is what lets them find you. They were previously in two different
// places — a field on the profile step, a screen inside Settings — and the
// result was 41 accounts with neither, and a matching feature that had never
// once matched anybody.
//
// A device cannot supply the missing half on its own, which is worth knowing
// before anyone tries to simplify this further: an address book holds other
// people's numbers, never your own. iOS has no API for the "me" card and
// Android's profile is a separate permission that is usually empty. That is
// why every phone-matching app asks you to type it.
//
// Skippable, and skipping counts as done. Nothing here is required to use
// the app, and a gate somebody cannot get past is a wall.
export default function FindFriendsScreen() {
  const { session, refreshProfile } = useAuth();
  const [isFinishing, setIsFinishing] = useState(false);

  async function finish() {
    if (!session) return;
    setIsFinishing(true);
    // Best-effort. A flag that fails to save means seeing this screen once
    // more, which is a far smaller problem than being stuck on it — so
    // nothing here surfaces an error or blocks the way out.
    await supabase
      .from('users')
      .update({ has_seen_find_friends: true })
      .eq('id', session.user.id);
    await refreshProfile();
    setIsFinishing(false);
    // The root layout re-evaluates its guards once the flag lands and moves
    // on to whatever comes next.
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif">Find your friends</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Add your number so people who have it can find you, and check your contacts for anyone
          already here. Numbers are scrambled on your device and never stored as numbers.
        </ThemedText>

        <FindFriendsPanel compact />

        <Button label="Continue" onPress={() => void finish()} loading={isFinishing} />
        {/* Always reachable, from the first frame — the same rule the
            tutorial follows. */}
        <Pressable onPress={() => void finish()} hitSlop={12} style={styles.skip}>
          <ThemedText type="small" themeColor="textSecondary">
            Skip for now
          </ThemedText>
        </Pressable>
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  skip: {
    alignSelf: 'center',
    padding: Spacing.two,
  },
});
