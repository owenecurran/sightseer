import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { WelcomeRoad } from '@/components/welcome-road';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getLandingImageUrls } from '@/lib/landing-images';

// How far the hero slides down when the auth panel opens, as a fraction of
// the screen. Enough to clear the panel and read as the page making room,
// short of pushing the wordmark off the bottom.
const HERO_SHIFT_RATIO = 0.18;

const OPEN_MS = 420;
const CLOSE_MS = 320;

// The first screen a fresh install shows.
//
// Lives in the (auth) group and is the signed-out entry point — the root
// layout sends anyone without a session here rather than straight to the
// sign-in form, so the first thing a new person meets is the app rather
// than a password field.
export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const [images, setImages] = useState<string[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // 0 closed, 1 open. One value drives the hero's shift, the panel's rise
  // and both fades, so they cannot drift out of step.
  const reveal = useSharedValue(0);

  useEffect(() => {
    let isActive = true;
    getLandingImageUrls().then((urls) => {
      if (isActive) setImages(urls);
    });
    return () => {
      isActive = false;
    };
  }, []);

  function openAuth() {
    setIsAuthOpen(true);
    reveal.value = withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) });
  }

  function closeAuth() {
    setIsAuthOpen(false);
    reveal.value = withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) });
  }

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reveal.value * height * HERO_SHIFT_RATIO }],
  }));

  // The road dims rather than stopping — the motion continuing behind the
  // panel is what keeps the screen feeling alive while someone reads it.
  const roadStyle = useAnimatedStyle(() => ({
    opacity: 1 - reveal.value * 0.55,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * height * 0.35 }],
  }));

  return (
    <ThemedView type="screen" style={styles.container}>
      <Animated.View style={[StyleSheet.absoluteFill, roadStyle]}>
        <WelcomeRoad images={images} />
      </Animated.View>

      {/* Sits between the road and the wordmark. Without it the title
          competes with whatever photo happens to be passing behind it, and
          the one thing this screen has to do is say what the app is. */}
      <View style={styles.scrim} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea}>
        <Animated.View style={[styles.hero, heroStyle]}>
          <ThemedText type="displaySerif" style={styles.wordmark}>
            Sightseer
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.tagline}>
            A journal of everywhere you have been.
          </ThemedText>

          {/* Hidden once the panel is open rather than left underneath it:
              a Get started button still sitting behind an open sheet is
              reachable by a stray tap and means nothing at that point. */}
          {!isAuthOpen && (
            <Button label="Get started" onPress={openAuth} style={styles.cta} />
          )}
        </Animated.View>
      </SafeAreaView>

      {/* Tapping away closes it. Only mounted while open so it never eats
          taps meant for the Get started button. */}
      {isAuthOpen && (
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.dismissLayer]}
          onTouchEnd={closeAuth}
        />
      )}

      <Animated.View style={[styles.panelWrap, panelStyle]} pointerEvents={isAuthOpen ? 'auto' : 'none'}>
        <ThemedView type="backgroundElement" style={styles.panel}>
          <SafeAreaView edges={['bottom']}>
            <View style={styles.panelInner}>
              <ThemedText type="sectionLabel">Get started</ThemedText>
              <Button
                label="Create an account"
                onPress={() => router.push('/(auth)/sign-up')}
              />
              <Button
                label="I already have an account"
                variant="secondary"
                onPress={() => router.push('/(auth)/sign-in')}
              />
            </View>
          </SafeAreaView>
        </ThemedView>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Darkest at the vertical middle, where the wordmark sits, and clearing
  // toward the edges so the road is still visible arriving and leaving.
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3,16,9,0.55)',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
  },
  hero: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  wordmark: {
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
  },
  cta: {
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  dismissLayer: {
    backgroundColor: 'transparent',
  },
  panelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  panelInner: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
});
