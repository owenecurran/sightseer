import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindFriendsPanel } from '@/components/find-friends-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PaperPanel } from '@/components/ui/paper-panel';
import { BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
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

type Assurance = { icon: keyof typeof Ionicons.glyphMap; text: string };

const PHONE_ASSURANCES: Assurance[] = [
  { icon: 'chatbubble-ellipses-outline', text: 'We text you a 6-digit code.' },
  { icon: 'lock-closed-outline', text: 'Your number is scrambled on your device.' },
  { icon: 'eye-off-outline', text: 'It is never stored as a number.' },
];

const CONTACTS_ASSURANCES: Assurance[] = [
  { icon: 'people-outline', text: 'See which of your contacts are already here.' },
  { icon: 'paper-plane-outline', text: 'Invite the ones who are not.' },
  { icon: 'lock-closed-outline', text: 'Contacts never leave your device unhashed.' },
];

function AssuranceList({ items, seed }: { items: Assurance[]; seed: string }) {
  return (
    <PaperPanel seed={seed} accentIndex={1} style={styles.assurances}>
      {items.map((item) => (
        <View key={item.text} style={styles.assuranceRow}>
          {/* Fixed width, so the text starts on one column instead of
              stepping in and out with each icon's own width. */}
          <View style={styles.assuranceIcon}>
            <Ionicons name={item.icon} size={16} color={BrandColors.sage} />
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.assuranceText}>
            {item.text}
          </ThemedText>
        </View>
      ))}
    </PaperPanel>
  );
}

export default function FindFriendsScreen() {
  const { session, profile, refreshProfile } = useAuth();
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
  const step: 'phone' | 'contacts' =
    profile?.hashed_phone != null ? 'contacts' : 'phone';

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
        {step === 'phone' ? (
          <>
            <View style={styles.heading}>
              <ThemedText type="displaySerif" style={styles.centered}>
                Your number
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.centered}>
                So people who already have it can find you here.
              </ThemedText>
            </View>

            <AssuranceList items={PHONE_ASSURANCES} seed="find-friends-phone" />

            {/* Its own caption is dropped: the panel above now carries the
                same three facts, and carries them better. PhoneVerify owns
                the only action on this screen, so there is no second button
                beside it. */}
            <FindFriendsPanel compact section="phone" sendLabel="Continue" phoneCaption="" />
          </>
        ) : (
          <>
            <View style={styles.heading}>
              <ThemedText type="displaySerif" style={styles.centered}>
                Your contacts
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary" style={styles.centered}>
                Find the people you already know.
              </ThemedText>
            </View>

            <AssuranceList items={CONTACTS_ASSURANCES} seed="find-friends-contacts" />

            <FindFriendsPanel compact section="contacts" contactsCaption="" />
          </>
        )}

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
  // Title and subtitle are one unit, tighter to each other than to what comes
  // after — otherwise three evenly spaced blocks read as three topics.
  heading: {
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  assurances: {
    gap: Spacing.two,
  },
  assuranceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  assuranceIcon: {
    width: 20,
    alignItems: 'center',
  },
  assuranceText: {
    // Wraps inside the row rather than pushing the icon off the edge.
    flex: 1,
  },
  skip: {
    alignSelf: 'center',
    padding: Spacing.two,
  },
});
