import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { FindFriendsPanel } from '@/components/find-friends-panel';
import { ThemedText } from '@/components/themed-text';
import { PaperPanel } from '@/components/ui/paper-panel';
import { BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

// One step of finding people, as it looks on screen.
//
// Extracted so the sign-up gate and the Settings entry render the SAME thing
// rather than two that drift — the identical reason FindFriendsPanel was
// pulled out of those screens in the first place. The sign-up step got a
// sequence and a set of assurances; Settings kept the old one-page stack, and
// within a day they were two different screens for one feature.
//
// What the two screens still own separately is only what genuinely differs:
// sign-up has Skip and writes has_seen_find_friends when it is done with;
// Settings has a back link and finishes whenever somebody leaves.

export type FindFriendsStepName = 'phone' | 'contacts';

// Which step this account is on.
//
// DERIVED, not counted. Verifying flips hashed_phone, the profile refresh
// brings it back, and the screen is already on the next step — one source of
// truth, with no way for a step counter and the profile to disagree. It also
// means somebody who already has a verified number never sees the phone step,
// which is the normal case in Settings.
//
// The order is a constraint rather than a preference: sync_contact_hashes
// refuses an unverified caller with P0002, so the contacts half can do nothing
// at all until the number is proved.
export function useFindFriendsStep(): FindFriendsStepName {
  const { profile } = useAuth();
  return profile?.hashed_phone != null ? 'contacts' : 'phone';
}

type Assurance = { icon: keyof typeof Ionicons.glyphMap; text: string };

// WHY THE CONTACTS STEP HAS A LIST AND THE PHONE STEP DOES NOT.
//
// Handing over an address book is a decision about OTHER people, and the
// three lines are what somebody needs to make it. A phone number is a
// decision about yourself, the subtitle already says what it is for, and the
// mechanics — a code arrives, the number is hashed — are things the next
// screen demonstrates a second later. Saying them first was reassurance
// nobody had asked for yet, between the question and the field.
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

export function FindFriendsStep({ step }: { step: FindFriendsStepName }) {
  if (step === 'phone') {
    return (
      <>
        <View style={styles.heading}>
          <ThemedText type="displaySerif" style={styles.centered}>
            Your number
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.centered}>
            So people who already have it can find you here.
          </ThemedText>
        </View>

        {/* PhoneVerify's own caption is dropped: the panel above carries the
            same three facts and carries them better. It owns the only action
            here, so there is no second button beside it, and the first of its
            two stages reads "Continue" rather than "Send code" because with a
            screen to itself it is a step forward rather than a mechanism. */}
        <FindFriendsPanel compact section="phone" sendLabel="Continue" phoneCaption="" />
      </>
    );
  }

  return (
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
  );
}

const styles = StyleSheet.create({
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
});
