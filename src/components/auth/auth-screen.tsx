import { Image } from 'expo-image';
import { ReactNode, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
        {/* Tinted cream rather than shipped in its source colour — see
            brand-logo.ts. */}
        <Image source={{ uri: logoUri }} style={styles.logo} contentFit="contain" />
        <ThemedText type="title" style={styles.centred}>
          {title}
        </ThemedText>
        {children}
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
