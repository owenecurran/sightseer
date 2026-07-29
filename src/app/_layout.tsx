import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { FloatingNavBar } from '@/components/floating-nav-bar';
import { NavBarVisibilityProvider } from '@/hooks/use-hide-on-scroll';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, profile, isLoading } = useAuth();

  const isAuthenticated = session !== null;
  const hasCompletedOnboarding = profile?.handle != null;
  const hasPassedInviteGate = profile?.has_shared_invite === true || profile?.invite_exempt === true;
  const showNavBar = isAuthenticated && hasCompletedOnboarding && hasPassedInviteGate;

  if (isLoading) return null;

  return (
    <NavBarVisibilityProvider>
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

          <Stack.Protected guard={isAuthenticated && hasCompletedOnboarding && !hasPassedInviteGate}>
            <Stack.Screen name="invite-gate" />
          </Stack.Protected>

          <Stack.Protected guard={showNavBar}>
            <Stack.Screen name="(tabs)" />
          </Stack.Protected>
        </Stack>
        {/* Rendered as a sibling above the Stack (not inside (tabs)) so it
            persists across every authenticated screen, including
            place/visit/user/board/reviews — Stack pushes outside (tabs)
            that previously had no nav bar at all. */}
        {showNavBar && <FloatingNavBar />}
      </View>
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
      <ThemeProvider value={DarkTheme}>
        <AuthProvider>
          <AnimatedSplashOverlay />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
