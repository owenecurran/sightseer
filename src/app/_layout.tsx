import { useFonts } from 'expo-font';
import { DarkTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState, useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type PagerView from 'react-native-pager-view';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/error-boundary';
import { FloatingNavBar } from '@/components/floating-nav-bar';
import { WebLanding } from '@/components/web-landing';
import { KeyboardProviderWrapper } from '@/components/keyboard-provider-wrapper';
import { PushPrimingModal } from '@/components/push-priming-modal';
import { SiteMeta } from '@/components/site-meta';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { NavBarVisibilityProvider } from '@/hooks/use-hide-on-scroll';
import { TabPagerProvider } from '@/hooks/use-tab-pager';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { initDeferredLinks } from '@/lib/deferred-links';
import { addPushTapListener, getPushPermissionState, registerForPush } from '@/lib/push';
import { TERMS_VERSION } from '@/lib/terms';
import { useTutorialSeen } from '@/lib/tutorial';

SplashScreen.preventAutoHideAsync();

// Paths that legitimately render with no session — excluded from the
// signed-out redirect below so it can't loop against itself.
const AUTH_PATHS = [
  '/welcome',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  // Reached with no session by definition — the account exists but is
  // not confirmed yet, so without this the redirect below bounces the
  // person straight back to /welcome and the code can never be entered.
  '/verify-email',
];

// Invite links are signed-out by definition and are NOT a fixed path, so
// they cannot live in the exact-match list above.
//
// Without this the redirect fired on every invite open and replaced
// /i/<code> with /welcome — the visitor still landed on the right page, so
// it looked fine, but it was the anonymous version of it: the band naming
// whoever invited them never rendered, because the route that knows the code
// had already been navigated away from. An invite that does not say who it
// is from is just a link.
const INVITE_PATH_PREFIX = '/i/';

// The postcard gallery in src/app/dev-postcards.tsx, which renders the feed
// card from fixtures so a layout can be looked at without a session. Every
// screen that shows a card is behind auth, which made checking the WEB build
// need a signed-in browser — this is the way around that.
//
// __DEV__ only. Note what this does and does not do: it exempts the path
// from the SIGNED-OUT redirect, nothing more. It does not keep the gallery
// out of a release build — a signed-in user reached it in production until
// the screen itself started redirecting. See dev-postcards.tsx.
const DEV_PREVIEW_PATH = '/dev-postcards';

function isDevPreviewPath(pathname: string): boolean {
  return __DEV__ && pathname === DEV_PREVIEW_PATH;
}

// The paths that say something meaningful with no session behind them, and
// therefore the only ones worth putting into the prerendered HTML. Kept
// deliberately short: every entry is a page that must be correct before the
// app knows who is looking.
function isLandingPath(pathname: string): boolean {
  return pathname === '/welcome' || pathname.startsWith(INVITE_PATH_PREFIX);
}

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
  // Null until storage answers — see the guard below for why that matters.
  const { seen: tutorialSeen } = useTutorialSeen();
  const hasSetPrivacy = profile?.has_set_privacy === true;
  const hasSeenFindFriends = profile?.has_seen_find_friends === true;
  const hasPassedInviteGate =
    profile?.has_shared_invite === true || profile?.invite_exempt === true;
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
    if (pathname.startsWith(INVITE_PATH_PREFIX)) return;
    if (isDevPreviewPath(pathname)) return;
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

  // Attribution for installs that came through a store, where nothing else
  // survives the round trip. Inert until react-native-branch is both
  // installed and present in the native build — see docs/deferred-links.md.
  // Deliberately not gated on having a session: the whole point is that this
  // fires on a first launch, before there is an account.
  useEffect(() => initDeferredLinks(), []);

  // Web static rendering runs this component in Node, where AuthProvider's
  // session effect never fires — so isLoading is true for the entire
  // prerender and this early return is why every page in this app shipped as
  // an empty #root. That is invisible in the app (the client hydrates and
  // renders normally a moment later) but not invisible to a crawler or to a
  // messaging app generating a link preview, which see the HTML and nothing
  // else. Invite links are pasted into exactly those places.
  //
  // Only the signed-out marketing paths get content here. Everything else
  // keeps returning null, because everything else genuinely needs to know
  // who is asking before it can render a single correct pixel.
  //
  // Hydration-safe by construction rather than by luck: isLoading is true on
  // the server AND on the client's very first render, so both produce this
  // same landing and React has nothing to reconcile. Rendering the component
  // directly rather than routing to it keeps that guarantee — the router's
  // own state is not settled this early.
  // SiteMeta rides along on BOTH arms rather than sitting inside the tree
  // below, because for every path that is not a landing path this branch is
  // the entire prerendered document — returning bare null here is what left
  // the bare domain, /visit/*, /user/* and /place/* with an empty <title>
  // and no card at all.
  if (isLoading) {
    if (Platform.OS === 'web' && isLandingPath(pathname)) {
      return (
        <>
          <SiteMeta />
          <WebLanding />
        </>
      );
    }
    return <SiteMeta />;
  }

  return (
    <NavBarVisibilityProvider>
      <SiteMeta />
      <TabPagerProvider
        value={{ pagerRef, activeIndex, setActiveIndexInternal: setActiveIndex, setActivePage }}
      >
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)/welcome" />
              {/* Both rise from the bottom rather than sliding in from the
                  right. The welcome screen's auth panel is already a sheet
                  moving upward, so a sideways push read as a different kind
                  of navigation interrupting it; coming up from below makes
                  the form feel like the next thing that sheet reveals. */}
              <Stack.Screen name="(auth)/sign-in" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="(auth)/sign-up" options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="(auth)/forgot-password" />
              <Stack.Screen
                name="(auth)/verify-email"
                options={{ animation: 'slide_from_bottom' }}
              />
            </Stack.Protected>

            {/* Two routes, deliberately. `terms` is the read-only re-read and
                is registered for ANY signed-in user, because Settings' "Terms
                of use" link has to have a route to push at all times — scoped
                to the gate's guard instead, it stopped existing the moment
                terms were accepted and the link silently did nothing.
                `accept-terms` is the gate, and it keeps the narrow guard so
                that accepting makes it cease to exist and the navigator falls
                through to whatever is next on its own. That disappearance IS
                the "move them on" step; accept-terms does no navigation.
                Collapsing these two into one route breaks one or the other —
                it previously broke the gate, which flipped to its read-only
                variant in place and stranded people on a screen whose only
                control was a back link to (tabs), a route that does not exist
                until the whole chain below is satisfied. */}
            <Stack.Protected guard={isAuthenticated && !isBanned && !hasAcceptedTerms}>
              <Stack.Screen name="accept-terms" />
            </Stack.Protected>

            {/* The only route a banned account has. Every guard below also
                requires !isBanned, so there is nowhere else for the
                navigator to put them. */}
            <Stack.Protected guard={isAuthenticated && isBanned}>
              <Stack.Screen name="banned" />
            </Stack.Protected>

            <Stack.Protected
              guard={isAuthenticated && !isBanned && hasAcceptedTerms && !hasCompletedOnboarding}
            >
              <Stack.Screen name="onboarding" />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                !hasSetDemographics
              }
            >
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
              }
            >
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
              }
            >
              <Stack.Screen name="invite-gate" />
            </Stack.Protected>

            {/* Both halves of contact matching, as one step. Placed after
                the invite gate because the two are the same conversation
                from opposite ends — that one is about the people you bring,
                this one about the people already here. */}
            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                hasSetPrivacy &&
                hasPassedInviteGate &&
                !hasSeenFindFriends
              }
            >
              <Stack.Screen name="find-friends" />
            </Stack.Protected>

            {/* How the app works, once per install — see lib/tutorial.ts.
                Registered BEFORE (tabs) so it sits in front of the app the
                way every other gate above it does.

                `=== false` and not `!tutorialSeen`, deliberately: the flag
                starts as null while storage is being read, and treating that
                as "not seen" would throw the tutorial up for a frame on every
                single launch before it resolved. Unknown means show the app;
                only a definite "never seen this" opens it. */}
            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                hasSetPrivacy &&
                hasPassedInviteGate &&
                tutorialSeen === false
              }
            >
              <Stack.Screen name="tutorial" options={{ gestureEnabled: false }} />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
                !isBanned &&
                hasAcceptedTerms &&
                hasCompletedOnboarding &&
                hasSetDemographics &&
                hasSetPrivacy &&
                hasPassedInviteGate &&
                // The app has to be UNAVAILABLE while the tutorial is
                // pending, not merely registered after it. A Protected route
                // is a gate on availability, and the navigator resolves the
                // current path against whatever is available — so with both
                // this and the tutorial open, '/' still resolves straight to
                // the tabs and the tutorial never appears. Closing this is
                // what makes the router fall through, exactly as it does for
                // every other gate above.
                tutorialSeen !== false
              }
            >
              <Stack.Screen name="(tabs)" />
            </Stack.Protected>

            {/* Registered LAST, and the position is load-bearing. When a
                screen's guard goes false the navigator falls through to the
                first registered route that is still available, so anything
                available to every signed-in user acts as a catch-all for
                every gate above it. Sitting where the gate used to sit, this
                route swallowed the fall-through: accepting made accept-terms
                vanish and landed people right back on the terms text, now
                read-only, with a back link to (tabs) that does not exist
                until the whole chain above is satisfied. Dead end, same as
                before the split. Down here every real destination outranks
                it, and it is only ever reached the way it is meant to be —
                pushed from Settings, with history behind it. */}
            <Stack.Protected guard={isAuthenticated && !isBanned}>
              <Stack.Screen name="terms" />
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
    // Copied from "PAG Auto W01 Regular.otf" to a name with no spaces. The
    // spaced original bundles and resolves fine, but useFonts never settles on
    // it — the whole app sits on a blank screen, because this gate returns
    // null until it does. The .otf of the pair rather than the .ttf beside it:
    // same face, and the OpenType build carries the full kerning table.
    PagAuto: require('@/assets/fonts/PagAutoRegular.otf'),
    // The broader-location faces. Copied to space-free names for exactly the
    // reason above — every one of these arrived as "ACID GREEN POSTER.TTF"
    // and friends, and a spaced filename is the one thing known to hang this
    // gate and leave the app on a blank screen.
    AcidGreenPoster: require('@/assets/fonts/AcidGreenPoster.ttf'),
    AntarcticanBold: require('@/assets/fonts/AntarcticanHeadlineBold.ttf'),
    AntarcticanLight: require('@/assets/fonts/AntarcticanHeadlineLight.ttf'),
    BohemianSoul: require('@/assets/fonts/BohemianSoul.otf'),
    BuenaparkJf: require('@/assets/fonts/BuenaparkJfRegular.ttf'),
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
