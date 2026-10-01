import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindFriendsStep, useFindFriendsStep } from '@/components/find-friends-step';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

// Finding people, as one step of signing up — a SEQUENCE rather than a page,
// and a set of statements rather than a paragraph.
//
// It still holds both halves, because neither works alone: sharing your
// contacts finds the people who saved their own number, and saving your number
// is what lets them find you. They used to live in two different places — a
// field on the profile step, a screen inside Settings — and the result was 41
// accounts with neither, and a matching feature that had never once matched
// anybody. That is why they are one step.
//
// One step is not one screen, though, and this was one screen: a contacts
// explainer and its button, a phone caption and its field, an iOS "find one
// person" search box, and afterwards two lists of results, all stacked at
// once. Four things asking for something before you had done any of them.
//
// So: one at a time, in the only order that works. The phone comes FIRST, and
// that is a constraint rather than a preference — sync_contact_hashes refuses
// an unverified caller with P0002, so the contacts half can do nothing at all
// until the number is proved. The other way round offers a button whose only
// possible outcome is an error.
//
// The phone half is itself two screens inside PhoneVerify — a number, then the
// code — and here the first one's button reads "Continue" rather than "Send
// code", because with a screen to itself it is a step forward rather than a
// mechanism.
//
// WHY THE ASSURANCES ARE A LIST. Both steps ask for something people are right
// to hesitate over: a phone number, and an address book. The answer to that
// hesitation was a four-line paragraph, and a paragraph is the one shape
// nobody reads while they are deciding whether to hand something over. The
// same facts as three short lines, each with its own mark, can be taken in
// without being read — which is the whole job.
//
// A device cannot supply the missing half on its own, which is worth knowing
// before anyone tries to simplify this further: an address book holds other
// people's numbers, never your own. iOS has no API for the "me" card and
// Android's profile is a separate permission that is usually empty. That is
// why every phone-matching app asks you to type it.
//
// Skippable throughout, and skipping counts as done. Nothing here is required
// to use the app, and a gate somebody cannot get past is a wall.

export default function FindFriendsScreen() {
  const { session, refreshProfile } = useAuth();
  const [isFinishing, setIsFinishing] = useState(false);

  // The step is DERIVED rather than advanced by hand, and holds no state of
  // its own. Verifying flips hashed_phone, the profile refresh brings it back,
  // and the screen is already on the next step — one source of truth, with no
  // way for a step counter and the profile to disagree.
  //
  // It also means someone who already has a verified number (they signed up
  // with one) never sees the phone screen at all rather than being asked for
  // something they have already given. The transition only ever runs one way:
  // nothing clears hashed_phone from under this screen.
  // Shared with the Settings entry so the two cannot disagree about which
  // step somebody is on — see find-friends-step.tsx.
  const step = useFindFriendsStep();

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
        <FindFriendsStep step={step} />

        {/* Always reachable, from the first frame and on both steps — the
            same rule the tutorial follows. */}
        <Pressable
          onPress={() => void finish()}
          hitSlop={12}
          disabled={isFinishing}
          style={styles.skip}
        >
          <ThemedText type="small" themeColor="textSecondary">
            {step === 'phone' ? 'Skip for now' : 'Done'}
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
    gap: Spacing.four,
  },
  skip: {
    alignSelf: 'center',
    padding: Spacing.two,
  },
});
