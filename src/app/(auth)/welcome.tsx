import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Image } from 'expo-image';

import { ForgotPasswordForm, SignInForm, SignUpForm } from '@/components/auth/auth-forms';
import { BackLink } from '@/components/ui/back-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { WelcomeRoad } from '@/components/welcome-road';
import { BrandColors, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { buildLogoDataUri, LOGO_ASPECT } from '@/lib/brand-logo';
import { getLandingImageUrls } from '@/lib/landing-images';

// How far the hero slides down when the panel opens, as a fraction of the
// screen. Enough to clear the panel and read as the page making room, short
// of pushing the wordmark off the bottom.
const HERO_SHIFT_RATIO = 0.2;

const OPEN_MS = 420;
const CLOSE_MS = 320;
const STEP_MS = 380;

type Step = 'choose' | 'signin' | 'signup' | 'forgot';

// The first screen a fresh install shows.
//
// Lives in the (auth) group and is the signed-out entry point — the root
// layout sends anyone without a session here rather than straight to the
// sign-in form, so the first thing a new person meets is the app rather
// than a password field.
//
// Signing in and signing up happen HERE, in the panel, rather than on the
// (auth) routes. Those routes still exist and still work; this screen just
// never navigates to them, so the whole entry flow is one uninterrupted
// movement of one sheet.
export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Built once: the string is a couple of KB and the colour never changes.
  const logoUri = useMemo(() => buildLogoDataUri(), []);

  // What the stage grows to when the panel is full screen: everything left
  // after the safe areas and the panel's own padding. The form centres
  // inside this, which is what makes the expanded panel sit identically to
  // the standalone (auth)/sign-up screen rather than merely being as tall
  // as its own content.
  const expandedStageHeight = Math.max(
    0,
    height - insets.bottom - insets.top - Spacing.four * 2
  );
  const [images, setImages] = useState<string[]>([]);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [step, setStep] = useState<Step>('choose');

  // Measured rather than assumed: the two blocks are different heights and
  // the form's own height depends on whether an error is showing, so a
  // fixed value would either clip it or leave a gap.
  const [chooseHeight, setChooseHeight] = useState(0);
  const [formHeight, setFormHeight] = useState(0);
  // The panel's natural height while it is still a sheet. Captured ONLY in
  // the choose step: once a form is showing the panel is full-screen, so
  // measuring then would feed the expanded height back in as the collapsed
  // one and the animation would have nowhere to travel.
  const [sheetHeight, setSheetHeight] = useState(0);

  // 0 closed, 1 open. Drives the hero's shift, the panel's rise and the
  // road's dimming together, so they cannot drift out of step.
  const reveal = useSharedValue(0);
  // 0 showing the choices, 1 showing the chosen form.
  const stepProgress = useSharedValue(0);

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
    setStep('choose');
    stepProgress.value = withTiming(0, { duration: STEP_MS, easing: Easing.out(Easing.cubic) });
  }

  function chooseStep(next: Step) {
    setStep(next);
    stepProgress.value = withTiming(next === 'choose' ? 0 : 1, {
      duration: STEP_MS,
      easing: Easing.out(Easing.cubic),
    });
  }

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reveal.value * height * HERO_SHIFT_RATIO }],
  }));

  // A wash over the road rather than opacity ON the road.
  //
  // Animating the road's own opacity multiplied with each card's, which
  // made overlapping photos ghost through each other the moment this ran.
  // A scrim leaves every card fully opaque and just darkens what is behind
  // the panel.
  const scrimStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + reveal.value * 0.3,
  }));

  // The panel is a sheet while it is offering the choice and a full screen
  // once a form is showing, matching every other screen in the app rather
  // than leaving a form crammed into a drawer. Height animates between the
  // two, so it is one continuous expansion rather than a swap.
  const panelStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * height * 0.35 }],
    ...(sheetHeight
      ? { height: interpolate(stepProgress.value, [0, 1], [sheetHeight, height]) }
      : {}),
  }));

  // Clears the status bar only once the panel owns the whole screen.
  //
  // A SafeAreaView top edge would have done this, but it applies its inset
  // in BOTH states — so the sheet carried a status-bar-sized band of dead
  // space it never needed, which pushed its content down and clipped the
  // last button off the bottom of the screen.
  const panelInnerStyle = useAnimatedStyle(() => ({
    paddingTop: Spacing.four + interpolate(stepProgress.value, [0, 1], [0, insets.top]),
  }));

  // Only present once the panel is a full screen. On the sheet there is
  // nothing to go back TO — the choices are already what you would return
  // to — and a back control there would just compete with tapping away.
  const backStyle = useAnimatedStyle(() => ({ opacity: stepProgress.value }));

  // Rounded as a sheet, square once it owns the whole screen — a corner
  // radius against the screen edge reads as an unfinished overlay.
  const panelSurfaceStyle = useAnimatedStyle(() => {
    const radius = interpolate(stepProgress.value, [0, 1], [Spacing.four, 0]);
    return { borderTopLeftRadius: radius, borderTopRightRadius: radius };
  });

  // The panel grows and shrinks to whichever block is showing, and the
  // column inside slides up by exactly the height of the choices — so the
  // options box travels upward and the form it uncovers arrives in its
  // place, as one movement.
  const stageStyle = useAnimatedStyle(() => {
    // No height at all until the choices have been measured.
    //
    // The measurement happens INSIDE this view, so driving its height from
    // that measurement on the very first pass pins it at zero and it can
    // never recover — the panel opened empty. Leaving the height auto until
    // there is a real number lets the first layout happen naturally, and
    // the animation takes over from the second.
    if (!chooseHeight) return {};
    return {
      height: interpolate(stepProgress.value, [0, 1], [chooseHeight, expandedStageHeight]),
    };
  });

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -stepProgress.value * (chooseHeight || 0) }],
  }));

  return (
    <ThemedView type="screen" style={styles.container}>
      <View style={styles.fill}>
        <WelcomeRoad images={images} />
      </View>

      {/* Between the road and the wordmark. Without it the title competes
          with whatever photo happens to be passing behind it, and the one
          thing this screen has to do is say what the app is. */}
      <Animated.View style={[styles.fill, styles.scrim, scrimStyle]} pointerEvents="none" />

      <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        <Animated.View style={[styles.hero, heroStyle]} pointerEvents="box-none">
          <ThemedText type="displaySerif" style={styles.centred}>
            Sightseer
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.centred}>
            A journal of everywhere you have been.
          </ThemedText>

          {/* Hidden once the panel is open rather than left underneath it:
              a Get started button still sitting behind an open sheet is
              reachable by a stray tap and means nothing at that point. */}
          {!isAuthOpen && <Button label="Get started" onPress={openAuth} style={styles.cta} />}
        </Animated.View>
      </SafeAreaView>

      {/* Tapping away closes it. Only mounted while open so it never eats
          taps meant for the Get started button. */}
      {isAuthOpen && (
        <Pressable style={styles.fill} onPress={closeAuth} accessibilityLabel="Dismiss" />
      )}

      <Animated.View
        style={[styles.panelWrap, panelStyle]}
        pointerEvents={isAuthOpen ? 'auto' : 'none'}>
        <Animated.View style={[styles.panel, panelSurfaceStyle]}>
          <Animated.View
            style={[styles.panelBack, { top: insets.top + Spacing.three }, backStyle]}
            pointerEvents={step === 'choose' ? 'none' : 'auto'}>
            <BackLink seed="welcome-auth" onPress={() => chooseStep('choose')} />
          </Animated.View>

          <SafeAreaView edges={['bottom']} style={styles.panelSafe}>
            <Animated.View
              style={[styles.panelInner, panelInnerStyle]}
              onLayout={(e: LayoutChangeEvent) => {
                if (step === 'choose') setSheetHeight(e.nativeEvent.layout.height);
              }}>
              {/* Clips the column to whichever block is showing. The
                  other is still mounted just above or below the window,
                  which is what lets the movement be a slide rather than a
                  swap. */}
              <Animated.View style={[styles.stage, stageStyle]}>
                <Animated.View style={columnStyle}>
                  <View
                    onLayout={(e: LayoutChangeEvent) => setChooseHeight(e.nativeEvent.layout.height)}>
                    <View style={styles.choices}>
                      <ThemedText type="sectionLabel">Get started</ThemedText>
                      <Button label="Create an account" onPress={() => chooseStep('signup')} />
                      <Button
                        label="I already have an account"
                        variant="secondary"
                        onPress={() => chooseStep('signin')}
                      />
                    </View>
                  </View>

                  {/* Laid out exactly as (auth)/sign-up.tsx: a centred
                      title, the form, and a link underneath, in a column
                      centred in the available height. The link swaps the
                      form in place rather than navigating, since the whole
                      point here is that it is one screen. */}
                  <View style={[styles.authPage, { height: expandedStageHeight }]}>
                    {/* The wordmark, tinted cream rather than shipped in
                        its source colour — see brand-logo.ts. */}
                    <Image source={{ uri: logoUri }} style={styles.logo} contentFit="contain" />

                    <ThemedText type="title" style={styles.centred}>
                      {step === 'signin'
                        ? 'Welcome back'
                        : step === 'forgot'
                          ? 'Reset password'
                          : 'Create account'}
                    </ThemedText>

                    {step === 'signup' && <SignUpForm />}
                    {step === 'signin' && <SignInForm onForgotPassword={() => chooseStep('forgot')} />}
                    {step === 'forgot' && <ForgotPasswordForm />}

                    {/* Swaps the form in place rather than navigating,
                        since the whole point here is that it is one
                        screen. From the reset step it returns to signing
                        in, which is where someone resetting was headed. */}
                    <Pressable
                      onPress={() =>
                        chooseStep(step === 'signup' || step === 'forgot' ? 'signin' : 'signup')
                      }
                      style={styles.link}
                      hitSlop={8}>
                      <ThemedText type="linkPrimary">
                        {step === 'signup'
                          ? 'Already have an account? Sign in'
                          : step === 'forgot'
                            ? 'Back to sign in'
                            : 'Don’t have an account? Sign up'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </SafeAreaView>
        </Animated.View>
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    backgroundColor: BrandColors.background,
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
  centred: {
    textAlign: 'center',
  },
  cta: {
    marginTop: Spacing.three,
    alignSelf: 'stretch',
  },
  panelWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    // Its own colour rather than ThemedView's, because this now animates
    // its corner radius and has to be an Animated.View.
    backgroundColor: Colors.backgroundElement,
    flex: 1,
    overflow: 'hidden',
  },
  panelSafe: {
    flex: 1,
  },
  // Absolute, and above the centred column: the form has to stay centred in
  // the whole panel, so the back control cannot be a row in that column
  // without pushing it off centre. Left-aligned, which also keeps it clear
  // of the floating settings button in the opposite corner.
  panelBack: {
    position: 'absolute',
    left: Spacing.four,
    zIndex: 2,
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
  // Matches (auth)/sign-up.tsx's own safeArea block, so the expanded panel
  // and the standalone screen are the same layout.
  authPage: {
    justifyContent: 'center',
    gap: Spacing.five,
  },
  // Sits above the title, inside the same centred column, so it moves with
  // the rest of the page rather than being pinned to the panel.
  logo: {
    // Wide, not square — the wordmark is roughly 1.75:1, so a square box
    // would letterbox it and shrink it to nothing.
    width: 180,
    height: 180 / LOGO_ASPECT,
    alignSelf: 'center',
    // The column's own gap is Spacing.five, which is too much between a
    // mark and the title it belongs to.
    marginBottom: -Spacing.three,
  },
  link: {
    alignSelf: 'center',
  },
  stage: {
    overflow: 'hidden',
  },
  choices: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
});
