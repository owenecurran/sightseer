import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindFriendsStep, useFindFriendsStep } from '@/components/find-friends-step';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

// Find friends, reached from Settings.
//
// Chrome around FindFriendsStep, which is exactly what the sign-up gate
// renders — same sequence, same assurances, same wording. It used to render
// FindFriendsPanel directly in its one-page form, so the two drifted the
// moment the sign-up step became a sequence: somebody arriving here from
// Settings got the old stacked screen with everything on it at once.
//
// What this screen still owns is only what genuinely differs from sign-up: a
// back link instead of Skip, and no has_seen_find_friends write, because
// nothing is being gated here. Leaving is the whole exit.
//
// No title of its own. The step supplies "Your number" or "Your contacts",
// and a "Find friends" heading above that would be a second heading saying
// less than the one under it.
export default function ContactsSyncScreen() {
  const step = useFindFriendsStep();

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <BackLink seed="contacts-sync" />
        {/* The step centres in the room left over rather than sitting under
            the back link. A short form pinned to the top of a tall screen
            reads as the top of something longer that failed to load. */}
        <View style={styles.center}>
          <FindFriendsStep step={step} />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.four,
    // Lifted off dead centre: the keyboard takes the lower half the moment
    // the field is touched, and true centring puts the field under it.
    paddingBottom: Spacing.six,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.four,
  },
});
