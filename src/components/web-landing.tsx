import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Image } from 'expo-image';
import Head from 'expo-router/head';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { BrandColors, Colors, Spacing } from '@/constants/theme';
import { buildLogoDataUri, LOGO_ASPECT } from '@/lib/brand-logo';
import { getLandingImageUrls } from '@/lib/landing-images';
import { SITE_ORIGIN } from '@/lib/site';
import { hasSupportEmail, SUPPORT_EMAIL, hasPrivacyPolicy, PRIVACY_POLICY_URL } from '@/lib/legal';
import { detectDevicePlatform, storeUrlFor, type DevicePlatform } from '@/lib/stores';

// The signed-out web page.
//
// Native's welcome screen is one animated sheet that IS the sign-up form —
// right for a device someone has already chosen to install on, wrong for a
// URL someone was sent. A link needs a page that explains what this is
// before it asks for anything, so this is a scrolling marketing page with
// the auth routes a click away rather than a form with a picture behind it.
//
// Shared by two routes: `/` for a signed-out visitor, and `/i/[code]` for
// someone arriving on an invite. The only difference is the band at the
// top, which is why `inviter` is the single prop.

const WIDE_BREAKPOINT = 900;
const CONTENT_MAX = 1100;

type WebLandingProps = {
  // Whose invite brought them, when that is known. Null on the plain
  // signed-out landing.
  inviter?: { handle: string | null; name: string | null } | null;
};

export function WebLanding({ inviter = null }: WebLandingProps) {
  const { width } = useWindowDimensions();
  const isWide = width >= WIDE_BREAKPOINT;
  const logoUri = useMemo(() => buildLogoDataUri(), []);

  const [images, setImages] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    getLandingImageUrls().then((urls) => {
      if (!cancelled) setImages(urls.slice(0, 6));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // With server output this component renders once in Node, where there is
  // no navigator: reading the device during render on both sides would make
  // the markup disagree with what hydrates into it. useSyncExternalStore is
  // exactly the escape hatch for that — the third argument is the value the
  // server renders, so the page ships as the desktop arrangement and
  // corrects itself on the client rather than mismatching.
  //
  // The subscribe function returns an empty unsubscribe because this never
  // changes after mount: a device does not stop being a phone.
  const device = useSyncExternalStore<DevicePlatform>(
    () => () => {},
    detectDevicePlatform,
    () => 'desktop'
  );

  const storeUrl = storeUrlFor(device);
  const isPhone = device === 'ios' || device === 'android';

  const inviterName = inviter?.name ?? (inviter?.handle ? `@${inviter.handle}` : null);

  // What a link preview shows when this page is pasted into a message —
  // which, for an invite, is the normal way it is first seen. The inviter's
  // name is deliberately not in the title: the code is only resolvable
  // client-side after a round trip, so a title promising a name would be
  // wrong in exactly the place it matters, the crawler's copy.
  const title = 'Sightseer — keep the places you have been';
  const description =
    'Record where you have been, rate it, and share that with people you choose.';

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {/* Absolute, and pointed at the site's own origin rather than a
            signed URL: the landing photos are signed and expire, so a
            crawler that fetched one later would get a 403 and show a broken
            card. This file is served from public/ at the site root, which is
            as stable as the domain itself. */}
        <meta property="og:image" content={`${SITE_ORIGIN}/sightseer-logo.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={`${SITE_ORIGIN}/sightseer-logo.png`} />
      </Head>
      <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>
      <View style={[styles.shell, isWide && styles.shellWide]}>
        {/* ---------------- header ---------------- */}
        <View style={styles.header}>
          <Image
            source={{ uri: logoUri }}
            style={{ width: 132, height: 132 / LOGO_ASPECT }}
            contentFit="contain"
          />
          {isWide && (
            <View style={styles.headerActions}>
              <Pressable onPress={() => router.push('/sign-in')} hitSlop={8}>
                <ThemedText type="link">Sign in</ThemedText>
              </Pressable>
              <Button label="Create account" onPress={() => router.push('/sign-up')} />
            </View>
          )}
        </View>

        {/* ---------------- invite band ---------------- */}
        {inviterName && (
          <View style={styles.inviteBand}>
            <ThemedText type="body" style={styles.centered}>
              <ThemedText type="smallBold">{inviterName}</ThemedText> invited you to Sightseer.
            </ThemedText>
          </View>
        )}

        {/* ---------------- hero ---------------- */}
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
            <ThemedText type="displaySerif" style={!isWide && styles.centered}>
              Keep the places you have been.
            </ThemedText>
            <ThemedText
              type="body"
              themeColor="textSecondary"
              style={[styles.heroSub, !isWide && styles.centered]}>
              Sightseer is a place to record where you have been, rate it, and share that with
              people you choose. Your reviews, photos, boards and travel books stay yours.
            </ThemedText>

            <View style={[styles.ctaRow, !isWide && styles.ctaColumn]}>
              {isPhone && storeUrl && (
                <Button
                  label={device === 'ios' ? 'Download on the App Store' : 'Get it on Google Play'}
                  onPress={() => Linking.openURL(storeUrl)}
                />
              )}
              <Button
                label={isPhone && storeUrl ? 'Continue in browser' : 'Create an account'}
                variant={isPhone && storeUrl ? 'secondary' : 'primary'}
                onPress={() => router.push('/sign-up')}
              />
              {!isWide && (
                <Pressable onPress={() => router.push('/sign-in')} hitSlop={8}>
                  <ThemedText type="link" style={styles.centered}>
                    I already have an account
                  </ThemedText>
                </Pressable>
              )}
            </View>

            {/* Said plainly rather than hidden, because on a phone with no
                listing yet the browser IS the app, and someone who was sent
                a link deserves to know that rather than wonder where the
                download button is. */}
            {isPhone && !storeUrl && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                The mobile apps are on their way — everything works in your browser meanwhile.
              </ThemedText>
            )}
          </View>

          {images.length > 0 && (
            <View style={[styles.collage, isWide && styles.collageWide]}>
              {images.map((uri, index) => (
                <Image
                  key={uri}
                  source={{ uri }}
                  style={[
                    styles.collageImage,
                    // A slight stagger so the row reads as a handful of
                    // photographs rather than a grid of thumbnails.
                    { marginTop: index % 2 === 0 ? 0 : Spacing.four },
                  ]}
                  contentFit="cover"
                  transition={240}
                />
              ))}
            </View>
          )}
        </View>

        {/* ---------------- what it is ---------------- */}
        <View style={[styles.features, isWide && styles.featuresWide]}>
          <Feature
            heading="Write it down"
            body="Every place you go, rated and remembered, with the photos you took there."
          />
          <Feature
            heading="Keep it yours"
            body="Private by default. You decide who sees a review, down to the individual place."
          />
          <Feature
            heading="Follow people, not feeds"
            body="See where the people you actually know have been, instead of where an algorithm wants you to go."
          />
        </View>

        {/* ---------------- footer ---------------- */}
        <View style={styles.footer}>
          <Pressable onPress={() => router.push('/terms')} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">
              Terms of use
            </ThemedText>
          </Pressable>
          {hasPrivacyPolicy && (
            <Pressable onPress={() => Linking.openURL(PRIVACY_POLICY_URL)} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Privacy
              </ThemedText>
            </Pressable>
          )}
          {hasSupportEmail && (
            <Pressable onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                {SUPPORT_EMAIL}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </View>
      </ScrollView>
    </>
  );
}

function Feature({ heading, body }: { heading: string; body: string }) {
  return (
    <View style={styles.feature}>
      <ThemedText type="sectionLabel">{heading}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary">
        {body}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: BrandColors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  shell: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.six,
  },
  shellWide: {
    paddingHorizontal: Spacing.six,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.four,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  inviteBand: {
    backgroundColor: Colors.backgroundElement,
    borderRadius: 16,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  hero: {
    gap: Spacing.five,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.six,
  },
  heroCopy: {
    gap: Spacing.three,
  },
  heroCopyWide: {
    flex: 1,
  },
  heroSub: {
    maxWidth: 520,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  ctaColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  collage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  collageWide: {
    flex: 1,
  },
  collageImage: {
    width: 128,
    height: 168,
    borderRadius: 12,
    backgroundColor: Colors.backgroundElement,
  },
  features: {
    gap: Spacing.four,
  },
  featuresWide: {
    flexDirection: 'row',
    gap: Spacing.six,
  },
  feature: {
    flex: 1,
    gap: Spacing.one,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    paddingTop: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: Colors.backgroundElement,
  },
  centered: {
    textAlign: 'center',
  },
});
