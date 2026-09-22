import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { ContactAccessButton, addContactsChangeListener } from 'expo-contacts';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';

// Apple's own "share just this one contact" button, for iOS 18 and up.
//
// The permission model this app had was all-or-nothing: prompt for the whole
// address book, and get nothing at all if the answer is no. This is the
// third state. The person types a name, iOS searches the contacts it has NOT
// yet handed over, and tapping the button shares exactly that one — no
// prompt, no dialog, nothing else revealed.
//
// It is rendered by the system, not by us. We get to pick colours and pass a
// query; the matching, the layout and the sharing all happen inside iOS,
// which is the point — the contacts it searches are ones this app is not
// allowed to see, so it could not do that search itself.
//
// NOT A REPLACEMENT for the ordinary sync. Someone who is happy to share
// everything still should, because contact_hashes is only as complete as
// what we were allowed to read and the "someone joined" notification can
// only ever fire for people in it.

type InlineContactAccessProps = {
  // Typically from a search field. Empty renders nothing: the button has
  // nothing to match on, and an empty one sitting there inviting a tap that
  // does nothing is worse than no button.
  query: string;
  // Fired when the set of contacts this app can see changes — which is what
  // happens the instant somebody uses the button. The caller re-syncs.
  onAccessChanged: () => void;
};

// Whether the platform has this at all. Exported so a caller can decide
// whether to render the search field that feeds it, rather than showing a
// box that can never produce a button.
export function isInlineContactAccessAvailable(): boolean {
  // The isAvailable() check is the real one — it is false below iOS 18 — but
  // the Platform guard keeps the native view out of the web bundle's way
  // entirely.
  return Platform.OS === 'ios' && ContactAccessButton.isAvailable();
}

export function InlineContactAccess({ query, onAccessChanged }: InlineContactAccessProps) {
  const available = isInlineContactAccessAvailable();

  // The button reports nothing itself — it takes no callback, because from
  // iOS's point of view it did not do anything to this app, it changed what
  // the system is willing to show it. The contacts-changed event is how that
  // becomes visible here.
  useEffect(() => {
    if (!available) return;
    const subscription = addContactsChangeListener(onAccessChanged);
    return () => subscription.remove();
  }, [available, onAccessChanged]);

  if (!available || !query.trim()) return null;

  return (
    <View style={styles.wrap}>
      <ContactAccessButton
        query={query}
        // Shows the matched contact's number under their name, which is the
        // disambiguator that matters here: two people in a phonebook share a
        // name far more often than they share a number.
        caption="phone"
        // Opaque on purpose. Apple checks the contrast between these and
        // refuses to draw a button it considers illegible, so a transparent
        // background is not an option however well it would suit the page.
        backgroundColor={BrandColors.cream}
        textColor={BrandColors.background}
        tintColor={BrandColors.sage}
        style={styles.button}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Sharing one contact does not give Sightseer the rest of your address book.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  button: {
    // The system view has its own intrinsic height and will not report one
    // through flex, so it needs an explicit box to occupy.
    height: 56,
    width: '100%',
  },
});
