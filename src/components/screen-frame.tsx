import { router } from 'expo-router';
import { Component, createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PaperNote } from '@/components/ui/journal';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { reportError } from '@/lib/error-report';
import { hasSupportEmail, SUPPORT_EMAIL } from '@/lib/legal';

// Every screen in the app, framed so that a problem in one of them is never a
// dead end.
//
// Two things live here:
//
// - A crash catcher per screen. The only one used to be round the whole app
//   (see error-boundary.tsx): one broken screen took everything down with it,
//   tab bar and back button included, and its one way out, "Try again", drew
//   the same broken screen again. Now only that screen is replaced, the rest
//   of the app keeps working, and there is always a way back.
//
// - A way to load a screen again from scratch. A screen whose data failed to
//   load used to say so and stop there; anything inside it can now offer
//   "Try again" without wiring up its own reload (see useScreenReload and
//   ErrorNotice). It remounts the screen, which runs its loading again.
//
// Mounted for every screen by the root navigator's screenLayout.

const ReloadContext = createContext<(() => void) | null>(null);

// Loads the screen this is inside again, from scratch. Null outside a screen
// (inside the root layout's own furniture, say).
export function useScreenReload(): (() => void) | null {
  return useContext(ReloadContext);
}

type FrameProps = {
  children: ReactNode;
  // The route's name, for the report and for "tell us about it".
  routeName: string;
  canGoBack: () => boolean;
  goBack: () => void;
};

export function ScreenFrame({ children, routeName, canGoBack, goBack }: FrameProps) {
  // Bumped to load the screen again: a new key mounts everything inside anew.
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const { session } = useAuth();
  return (
    <ReloadContext.Provider value={reload}>
      <ScreenCrashCatcher
        key={attempt}
        routeName={routeName}
        signedIn={session != null}
        reload={reload}
        canGoBack={canGoBack}
        goBack={goBack}>
        {children}
      </ScreenCrashCatcher>
    </ReloadContext.Provider>
  );
}

type CatcherProps = {
  children: ReactNode;
  routeName: string;
  // The report screen needs an account; signed out, the app sends anyone
  // who opens it straight back to the welcome screen. So signed out, the
  // way to tell us is an email instead.
  signedIn: boolean;
  reload: () => void;
  canGoBack: () => boolean;
  goBack: () => void;
};

type CatcherState = { error: Error | null };

class ScreenCrashCatcher extends Component<CatcherProps, CatcherState> {
  state: CatcherState = { error: null };

  static getDerivedStateFromError(error: Error): CatcherState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Recorded with the screen it happened on. Nobody has to press anything
    // for this one to be known about.
    reportError(`screen:${this.props.routeName}`, error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error == null) return this.props.children;
    const { routeName, signedIn, reload, canGoBack, goBack } = this.props;
    const back = canGoBack();
    return (
      <ThemedView type="screen" style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            {/* The note the app leaves for the person, as Profile's "Make it
                yours" is: the same piece of card, scrawl and red pen, rather
                than a title, a paragraph and a stack of buttons. Its red-pen
                line is the first thing to try. */}
            <PaperNote
              seed={`snag-${routeName}`}
              title="This page hit a snag"
              body="Something on it broke while it was loading. That has been reported, so it can be fixed."
              actionLabel="try it again"
              onPress={reload}
            />
            <View style={styles.after}>
              {back ? (
                <Button label="Go back" variant="secondary" onPress={goBack} />
              ) : (
                // The first screen in the app has nowhere to go back to; the
                // feed is the one place that always exists.
                <Button label="Go to the feed" variant="secondary" onPress={() => router.replace('/')} />
              )}
              {signedIn ? (
                <ThemedText
                  type="action"
                  onPress={() => router.push({ pathname: '/report-bug', params: { from: routeName } })}>
                  Tell us what you were doing
                </ThemedText>
              ) : (
                hasSupportEmail && (
                  <ThemedText
                    type="action"
                    onPress={() =>
                      void Linking.openURL(
                        `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Sightseer: ${routeName} stopped working`)}`,
                      ).catch(() => {})
                    }>
                    Email us about it
                  </ThemedText>
                )
              )}
            </View>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  // A way back, and a way to tell us: the pen-drawn button and the typed
  // action that sit under a form's main button everywhere else.
  after: {
    alignItems: 'center',
    gap: Spacing.three,
  },
});
