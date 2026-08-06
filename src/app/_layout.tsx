import { useFonts } from 'expo-font';
import { DarkTheme, router, Stack, ThemeProvider, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import type PagerView from 'react-native-pager-view';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ErrorBoundary } from '@/components/error-boundary';
import { FloatingNavBar } from '@/components/floating-nav-bar';
import { KeyboardProviderWrapper } from '@/components/keyboard-provider-wrapper';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { NavBarVisibilityProvider } from '@/hooks/use-hide-on-scroll';
import { TabPagerProvider } from '@/hooks/use-tab-pager';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, profile, isLoading } = useAuth();
  const pathname = usePathname();
  const pagerRef = useRef<PagerView>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const isAuthenticated = session !== null;
  const hasCompletedOnboarding = profile?.handle != null;
  const hasSetDemographics = profile?.has_set_demographics === true;
  const hasSetPrivacy = profile?.has_set_privacy === true;
  const hasPassedInviteGate = profile?.has_shared_invite === true || profile?.invite_exempt === true;
  const isOnMainTab = (TAB_ROUTES as readonly string[]).includes(pathname);
  // Nav bar now only shows on the 5 main tab screens — Stack-pushed detail
  // screens (user/[id], place/[id], visit/[id], follow-list, etc.) go back
  // to needing their own in-content back control, same as a normal Stack
  // push. Previously this was intentionally *not* scoped (nav present on
  // every authenticated screen); reversed per explicit follow-up feedback.
  const showNavBar =
    isAuthenticated &&
    hasCompletedOnboarding &&
    hasSetDemographics &&
    hasSetPrivacy &&
    hasPassedInviteGate &&
    isOnMainTab;

  function setActivePage(index: number) {
    if (Platform.OS === 'web') {
      router.navigate(TAB_ROUTES[index]);
    } else {
      pagerRef.current?.setPage(index);
    }
  }

  if (isLoading) return null;

  return (
    <NavBarVisibilityProvider>
      <TabPagerProvider
        value={{ pagerRef, activeIndex, setActiveIndexInternal: setActiveIndex, setActivePage }}>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!isAuthenticated}>
              <Stack.Screen name="(auth)/sign-in" />
              <Stack.Screen name="(auth)/sign-up" />
              <Stack.Screen name="(auth)/forgot-password" />
            </Stack.Protected>

            <Stack.Protected guard={isAuthenticated && !hasCompletedOnboarding}>
              <Stack.Screen name="onboarding" />
            </Stack.Protected>

            <Stack.Protected guard={isAuthenticated && hasCompletedOnboarding && !hasSetDemographics}>
              <Stack.Screen name="demographics" />
            </Stack.Protected>

            <Stack.Protected
              guard={isAuthenticated && hasCompletedOnboarding && hasSetDemographics && !hasSetPrivacy}>
              <Stack.Screen name="privacy-choice" />
            </Stack.Protected>

            <Stack.Protected
              guard={
                isAuthenticated &&
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
