import { Image } from 'expo-image';
import { ReactNode, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeyboardAwareScroll } from '@/components/keyboard-aware-scroll';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { buildLogoDataUri, LOGO_ASPECT } from '@/lib/brand-logo';

// The chrome the standalone (auth) routes share.
//
// The welcome screen reveals the same forms inside its own sliding panel,
// so the framing has to be duplicated somewhere — the panel cannot use a
// screen and a screen cannot use the panel. Only the CHROME is duplicated:
// wordmark, title, column spacing. The forms themselves live in
// auth-forms.tsx and both entry points render those, which is what keeps
// behaviour from drifting between the two.
export function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  const logoUri = useMemo(() => buildLogoDataUri(), []);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* SCROLLABLE, and centred only while it fits.

            This column used to be a plain centred View, which silently clips
            whatever does not fit: with a mark, a title, two fields, the
            social buttons and a footer link, a shorter handset -- or any
            handset once the keyboard is up -- runs past the screen, and
            `justifyContent: center` sheds the overflow at BOTH ends. The
            logo is the top of the column, so the logo is what goes.

            flexGrow:1 with centring on the CONTENT container keeps the
            short-screen case identical to before: when it fits, it is
            centred; when it does not, it scrolls instead of being cut.
            Content that can scroll cannot be clipped.

            KeyboardAwareScroll rather than a plain one because this screen is
            a form -- the same drop-in the other form screens use, so a
            focused field lifts above the keyboard here too. */}
        <KeyboardAwareScroll
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {/* Tinted cream rather than shipped in its source colour — see
              brand-logo.ts. */}
          <Image source={{ uri: logoUri }} style={styles.logo} contentFit="contain" />
          <ThemedText type="title" style={styles.centred}>
            {title}
          </ThemedText>
          {children}
        </KeyboardAwareScroll>
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
  },
  // The centring and the column spacing move here, onto the scroll's content,
  // so they still apply when it fits and simply stop mattering when it does
  // not.
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    gap: Spacing.five,
  },
  centred: {
    textAlign: 'center',
  },
  // Matches welcome.tsx exactly so the two entry points are the same page.
  logo: {
    // Wide, not square — the wordmark is roughly 1.75:1, so a square box
    // would letterbox it and shrink it to nothing.
    width: 180,
    height: 180 / LOGO_ASPECT,
    alignSelf: 'center',
    // The column's own gap is Spacing.five, too much between a mark and
    // the title it belongs to.
    marginBottom: -Spacing.three,
  },
});
