import { useFonts } from 'expo-font';
import { DarkTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState, useEffect} from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type PagerView from 'react-native-pager-view';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/error-boundary';
import { FloatingNavBar } from '@/components/floating-nav-bar';
import { KeyboardProviderWrapper } from '@/components/keyboard-provider-wrapper';
import { PushPrimingModal } from '@/components/push-priming-modal';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { NavBarVisibilityProvider } from '@/hooks/use-hide-on-scroll';
import { TabPagerProvider } from '@/hooks/use-tab-pager';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { addPushTapListener, getPushPermissionState, registerForPush } from '@/lib/push';
import { TERMS_VERSION } from '@/lib/terms';

SplashScreen.preventAutoHideAsync();

// Paths that legitimately render with no session — excluded from the
// signed-out redirect below so it can't loop against itself.
const AUTH_PATHS = ['/welcome', '/sign-in', '/sign-up', '/forgot-password'];

function RootNavigator() {
  const { session, profile, isLoading } = useAuth();
  const pathname = usePathname();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isAuthenticated = session !== null;
  const hasAcceptedTerms =
    profile?.terms_accepted_at != null && profile?.terms_version === TERMS_VERSION;
  const hasCompletedOnboarding = profile?.handle != null;
  const hasSetDemographics = profile?.has_set_demographics === true;
  const hasSetPrivacy = profile?.has_set_privacy === true;
  const hasPassedInviteGate = profile?.has_shared_invite === true || profile?.invite_exempt === true;
  // Supersedes every other gate below, including terms and onboarding: an
  // account banned mid-signup should land on the ban screen rather than be
  // walked through the rest of the flow first.
  const isBanned = profile?.banned_at != null;
  const isOnMainTab = (TAB_ROUTES as readonly string[]).includes(pathname);
  // Nav bar now only shows on the 5 main tab screens — Stack-pushed detail
  // screens (user/[id], place/[id], visit/[id], follow-list, etc.) go back
  // to needing their own in-content back control, same as a normal Stack
  // push. Previously this was intentionally *not* scoped (nav present on
  // every authenticated screen); reversed per explicit follow-up feedback.
  const hasFinishedSignup =
    isAuthenticated &&
    !isBanned &&
    hasAcceptedTerms &&
    hasCompletedOnboarding &&
    hasSetDemographics &&
    hasSetPrivacy &&
    hasPassedInviteGate;
  const showNavBar = hasFinishedSignup && isOnMainTab;

  function setActivePage(index: number) {
    if (Platform.OS === 'web') {
      router.navigate(TAB_ROUTES[index]);
    } else {
      pagerRef.current?.setPage(index);
    }
  }

  // Signing out (or a token simply expiring) only invalidates screens that
  // actually sit inside a Stack.Protected block. Every other authenticated
  // screen — settings, drafts, home-locations, review-source, the detail
  // routes — is an ordinary Stack route, so it stays perfectly valid with no
  // session behind it and the user is stranded there with no way back (the
  // reported "sign out locks me in Settings"). Enumerating every one of
  // those screens in a guard would mean remembering to add each new one, so
  // this catches the condition itself instead: no session, not already on an
  // auth screen -> back to sign-in, wherever you happened to be.
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    if (AUTH_PATHS.includes(pathname)) return;
    // The welcome screen, not the sign-in form: someone arriving with no
    // session is usually meeting the app for the first time, and a password
    // field is a poor introduction. Anyone who already has an account is
    // one tap from it.
    router.replace('/welcome');
  }, [isAuthenticated, isLoading, pathname]);

  // Exactly the same problem as the block above, for the same reason. A ban
  // invalidates the Stack.Protected routes, but every ordinary Stack route
  // (settings, visit/[id], user/[id], ...) stays perfectly valid underneath
  // a banned profile, so a ban landing while someone is deep in the app
  // would leave them sitting there. Catching the condition rather than
  // enumerating the screens, again.
  //
  // This fires when the profile is next fetched, not the instant an admin
  // acts — the account's writes are already refused by RLS in the meantime,
  // so the gap costs nothing but a stale screen.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !isBanned) return;
    if (pathname === '/banned') return;
    router.replace('/banned');
  }, [isAuthenticated, isBanned, isLoading, pathname]);

  // Register this device for push once there is someone to register it to,
  // and re-register if the account changes — the token belongs to the
  // device, so it has to be repointed rather than assumed still correct.
  // Deliberately gated on finishing signup, not on having a session.
  //
  // Keyed on `session` alone this fired the instant auth completed — which
  // on iOS meant the system "Allow Notifications?" alert appeared over the
  // Terms screen, before the account even had a handle. iOS gives you that
  // prompt exactly once: decline it and requestPermissionsAsync returns
  // denied forever without showing anything, and the only way back is
  // Settings. Spending it mid-signup, before anyone has seen a review or
  // followed a soul, is spending it at the moment it is most likely to be
  // declined.
  //
  // Still not ideal — the strongest version asks after some first taste of
  // value, or primes with an explaining screen first, since the system alert
  // itself cannot be customised. This at least waits until there is an
  // account to notify.
  // Re-registers a device that has ALREADY granted permission, which is a
  // silent token refresh — tokens rotate, and the row has to follow the
  // account currently signed in. It deliberately does not ask: the first ask
  // belongs to PushPrimingModal, which explains what we would send before
  // the OS spends its one uncustomisable alert.
  useEffect(() => {
    if (!hasFinishedSignup || !session) return;
    let isActive = true;
    getPushPermissionState().then((state) => {
      if (isActive && state === 'granted') registerForPush(session.user.id);
    });
    return () => {
      isActive = false;
    };
  }, [hasFinishedSignup, session]);

  // A notification tapped from the lock screen or tray. Routed here rather
  // than per-screen because the app may not be running when it arrives, and
  // this is the one component guaranteed to be mounted.
  useEffect(() => addPushTapListener((route) => router.push(route as never)), []);

  if (isLoading) return null;

  return (
    <NavBarVisibilityProvider>
      <TabPagerProvider
        value={{ pagerRef, activeIndex, setActiveIndexInternal: setActiveIndex, setActivePage }}>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)/welcome" />
              <Stack.Screen name="(auth)/sign-in" />
              <Stack.Screen name="(auth)/sign-up" />
              <Stack.Screen name="(auth)/forgot-password" />
            </Stack.Protected>

            {/* Registered for ANY signed-in user, not only those who have yet
                to accept. Scoped to the gate's own guard, the route stopped
                existing the moment it was accepted — so Settings' "Terms of
                use" link pushed a route the navigator did not have and
                silently did nothing.
                The gate still works: every screen past this point is guarded
                on hasAcceptedTerms, so someone who has not accepted has
                nowhere else to be. */}
            <Stack.Protected guard={isAuthenticated && !isBanned}>
              <Stack.Screen name="terms" />
            </Stack.Protected>

            {/* The only route a banned account has. Every guard below also
                requires !isBanned, so there is nowhere else for the
                navigator to put them. */}
            <Stack.Protected guard={isAuthenticated && isBanned}>
              <Stack.Screen name="banned" />
            </Stack.Protected>

            <Stack.Protected
              guard={isAuthenticated && !isBanned && hasAcceptedTerms && !hasCompletedOnboarding}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>

            <Stack.Protected guard={isAuthenticated && !isBanned && hasAcceptedTerms && hasCompletedOnboarding && !hasSetDemographics}>
              <Stack.Screen name="demographics" />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                !hasSetPrivacy
              }>
              <Stack.Screen name="privacy-choice" />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                hasSetPrivacy &&
                !hasPassedInviteGate
              }>
              <Stack.Screen name="invite-gate" />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                hasSetPrivacy &&
                hasPassedInviteGate
              }>
              <Stack.Screen name="(tabs)" />
            </Stack.Protected>
          </Stack>
          {/* Rendered as a sibling above the Stack (not inside (tabs)) so it
              can float over every screen it's meant to — Stack.Protected's
              own guard used to also gate its render, before nav-bar
              visibility became route-scoped (isOnMainTab) rather than just
              auth-scoped. */}
          {showNavBar && <FloatingNavBar />}
      <PushPrimingModal userId={hasFinishedSignup ? (session?.user.id ?? null) : null} />
        </View>
      </TabPagerProvider>
    </NavBarVisibilityProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BethanyElingston: require('@/assets/fonts/BethanyElingston.otf'),
    MoonGetHeavy: require('@/assets/fonts/MOON_GET-HEAVY.otf'),
    HelveticaRoundedBold: require('@/assets/fonts/HELVETICA-ROUNDED-BOLD-5871D05EAD8DE.otf'),
    ObviouslyWideMedium: require('@/assets/fonts/ObviouslyWideMedium.otf'),
  });

  // Native splash stays up (SplashScreen.preventAutoHideAsync() above) until
  // this returns real content — AnimatedSplashOverlay's own onLayout is what
  // actually calls hideAsync(), so gating the whole tree on fontsLoaded means
  // it never mounts, and the splash never hides, until the brand fonts are
  // ready — avoiding a flash of fallback-font text underneath it.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProviderWrapper>
        <ThemeProvider value={DarkTheme}>
          {/* Last-resort net for render-phase errors (fetch errors are
              already caught per-screen via try/catch + setError) — see
              error-boundary.tsx's own comment for why this matters
              specifically for this app (no OTA/EAS Update channel
              configured, so a bad build can't be fast-followed). Inside
              ThemeProvider so the fallback UI's own ThemedView/ThemedText
              still resolve theme colors correctly; outside AuthProvider so
              a crash during auth initialization itself is also caught. */}
          <ErrorBoundary>
            <AuthProvider>
              <AnimatedSplashOverlay />
              <RootNavigator />
            </AuthProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </KeyboardProviderWrapper>
    </GestureHandlerRootView>
  );
}
