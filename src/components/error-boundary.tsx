import { Component, type ReactNode } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { reportError } from '@/lib/error-report';
import { hasSupportEmail, SUPPORT_EMAIL } from '@/lib/legal';

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { error: Error | null };

// Render-phase errors (as opposed to fetch errors, which every screen
// already catches via its own try/catch + setError) have no safety net
// today — one throws and the whole app goes down with it, with no OTA/EAS
// Update channel configured (confirmed: no `updates` block in app.json, no
// expo-updates dependency) to push a fast fix once that ships to real
// devices. This is a last-resort net: a live migration or bad merge that a
// currently-installed build can't handle now shows a recoverable screen
// instead of a hard crash. "Try again" just resets local component state
// (the classic error-boundary reset trick) — it won't help if the thrown
// error is deterministic (e.g. a genuinely missing DB column), but it does
// help for anything transient, and it's always safe to offer.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Recorded, not just logged. This is the one place in the app that knows
    // a render crashed, and with no OTA channel configured a crash on a
    // tester's device otherwise leaves no trace anywhere anybody looks —
    // console.error goes to a console nobody is attached to. reportError
    // keeps the console line and adds a row; it never throws, which matters
    // here more than anywhere, since this runs while something is already
    // broken.
    reportError('error-boundary', error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      const { error } = this.state;
      return (
        <ThemedView type="screen" style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <ThemedText type="displaySerif">Something went wrong</ThemedText>
            {/* Only reached when something outside any one screen breaks:
                each screen has its own catcher (see screen-frame.tsx), which
                keeps the rest of the app usable. Here nothing else is, so
                the way to tell us is an email rather than the report screen,
                which needs the app around it. */}
            <ThemedText type="caption">
              The app ran into a problem it could not get past. It has been reported. Try again,
              and if it keeps happening, let us know.
            </ThemedText>
            <Button label="Try again" onPress={() => this.setState({ error: null })} />
            {hasSupportEmail && (
              <ThemedText
                type="link"
                onPress={() =>
                  void Linking.openURL(
                    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Sightseer stopped working')}` +
                      `&body=${encodeURIComponent(`What I was doing:\n\n\n(For us: ${error.message.slice(0, 200)})`)}`,
                  ).catch(() => {})
                }>
                Email {SUPPORT_EMAIL}
              </ThemedText>
            )}
          </SafeAreaView>
        </ThemedView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
});
