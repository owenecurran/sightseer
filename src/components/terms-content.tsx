import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { TERMS_SECTIONS, TERMS_VERSION } from '@/lib/terms';

// The terms body itself, with no opinion about why it is on screen.
//
// Two routes render this: `accept-terms` (the gate, with an "I agree"
// button under it) and `terms` (the re-read from Settings, with a way back
// out). Keeping the text in one place is the point — the version stamp at
// the bottom is what someone would quote back at us, so the gate and the
// reader must never be able to drift into showing different words under the
// same version number.
export function TermsContent() {
  return (
    <>
      {TERMS_SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <ThemedText type="sectionLabel">{section.heading}</ThemedText>
          <ThemedText type="body" themeColor="textSecondary">
            {section.body}
          </ThemedText>
        </View>
      ))}
    </>
  );
}

// Split out from the sections so the gate can put its button between the
// text and the stamp, rather than after it.
export function TermsVersionStamp() {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.version}>
      Version {TERMS_VERSION}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.one,
  },
  version: {
    textAlign: 'center',
  },
});
