import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { PaperPanel } from '@/components/ui/paper-panel';
import { BrandColors, Spacing } from '@/constants/theme';
import { buildLogoDataUri, LOGO_ASPECT } from '@/lib/brand-logo';
import { copyText } from '@/lib/copy-text';
import { installTargetFor, type DevicePlatform } from '@/lib/stores';

// What an invite link opens on a phone.
//
// The desktop landing is a marketing page, which is right for a browser
// someone is going to keep reading in. On a phone the visitor has already
// been sold — a person they know sent them a link — and the only question
// left is how to get the app. So this is that question and nothing else:
// who invited you, one button, and the invite code in plain sight.
//
// ON THE CODE BEING VISIBLE
//
// It is not decoration, it is the attribution path. A web sign-up carries
// the code in the URL and an already-installed app gets handed it directly,
// but the store route loses it: iOS gives an app no referrer, so an install
// that went through TestFlight arrives knowing nothing about the link that
// caused it. Branch is the real fix and is wired but inert (see
// src/lib/deferred-links.ts — it needs a native build). Until then the
// bridge is manual and therefore has to be legible: the code is shown, it
// can be copied with one tap, and sign-up has a field to put it in.
//
// recordInviteClick has already run by the time this renders, so the
// inviter is credited with the click regardless of whether the install ever
// completes. That is the number worth having either way.

// Narrower than the desktop landing's 800. This is a one-decision screen on
// a handset, and letting it run the full width of a large phone in landscape
// spreads four short lines across a page of empty background.
const SHELL_MAX = 480;

type InviteMobileLandingProps = {
  code: string;
  device: Extract<DevicePlatform, 'ios' | 'android'>;
  // Null while the code is still resolving, and for a dead or revoked one.
  inviter?: { handle: string | null; name: string | null } | null;
};

export function InviteMobileLanding({ code, device, inviter = null }: InviteMobileLandingProps) {
  const [copied, setCopied] = useState(false);
  const logoUri = buildLogoDataUri();
  const target = installTargetFor(device);

  const inviterName = inviter?.name ?? (inviter?.handle ? `@${inviter.handle}` : null);

  async function handleCopy() {
    const ok = await copyText(code);
    if (!ok) return;
    setCopied(true);
    // Reverts on its own rather than latching. A button stuck reading
    // "Copied" is indistinguishable from one that stopped working.
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.shell}>
        <Image
          source={{ uri: logoUri }}
          style={{ width: 108, height: 108 / LOGO_ASPECT }}
          contentFit="contain"
        />

        <ThemedText type="displaySerif" style={styles.centered}>
          {inviterName ? `${inviterName} invited you.` : 'You have been invited.'}
        </ThemedText>

        <ThemedText type="body" themeColor="textSecondary" style={styles.centered}>
          Sightseer is a place to record where you have been, rate it, and share that with people
          you choose.
        </ThemedText>

        {/* ---------------- how to get it ---------------- */}
        {target.kind === 'store' && (
          <Button
            label={device === 'ios' ? 'Download on the App Store' : 'Get it on Google Play'}
            onPress={() => Linking.openURL(target.url)}
          />
        )}

        {target.kind === 'testflight' && (
          <View style={styles.block}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Sightseer is in open beta on TestFlight while the App Store listing is in review.
            </ThemedText>
            {target.url && (
              <Button label="Get the beta on TestFlight" onPress={() => Linking.openURL(target.url!)} />
            )}
            {target.code && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                {target.url
                  ? `If that does not open, install TestFlight and redeem ${target.code}.`
                  : `Install TestFlight from the App Store, then redeem ${target.code}.`}
              </ThemedText>
            )}
          </View>
        )}

        {/* Android, and iOS with nothing configured yet. Said plainly rather
            than hidden behind a disabled button: the browser genuinely is
            the whole app here, and someone who was sent a link deserves to
            know that rather than wonder where the download went. */}
        {target.kind === 'none' && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {device === 'android'
              ? 'The Android app is on its way. Everything works in your browser meanwhile.'
              : 'The mobile app is on its way. Everything works in your browser meanwhile.'}
          </ThemedText>
        )}

        <Button
          label={target.kind === 'none' ? 'Continue in browser' : 'Continue in browser instead'}
          variant={target.kind === 'none' ? 'primary' : 'secondary'}
          onPress={() => router.push('/sign-up')}
        />

        {/* ---------------- the code ---------------- */}
        {/* Only worth showing when the app is the destination. Someone
            continuing in this browser carries the code in the URL already,
            and asking them to remember a string they will never need is
            noise on the one screen that should have none. */}
        {target.kind !== 'none' && (
          <PaperPanel seed={`invite:${code}`} style={styles.codePanel}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              Your invite code
            </ThemedText>
            <Pressable onPress={handleCopy} hitSlop={8}>
              <ThemedText type="displaySerif" style={styles.code} selectable>
                {code}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {copied
                ? 'Copied.'
                : `Enter this when you sign up so ${inviterName ?? 'whoever invited you'} gets credit.`}
            </ThemedText>
            <Button label={copied ? 'Copied' : 'Copy code'} variant="secondary" onPress={handleCopy} />
          </PaperPanel>
        )}

        <Pressable onPress={() => router.push('/sign-in')} hitSlop={8}>
          <ThemedText type="link" style={styles.centered}>
            I already have an account
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.five,
  },
  shell: {
    width: '100%',
    maxWidth: SHELL_MAX,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.four,
  },
  block: {
    width: '100%',
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
  codePanel: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  code: {
    letterSpacing: 4,
    textAlign: 'center',
  },
});
