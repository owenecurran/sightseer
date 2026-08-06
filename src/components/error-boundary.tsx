import { Component, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

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
    console.error('ErrorBoundary caught a render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ThemedView type="screen" style={styles.container}>
          <SafeAreaView style={styles.safeArea}>
            <ThemedText type="displaySerif">Something went wrong</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This screen ran into a problem loading. Try again, or come back later.
            </ThemedText>
            <Button label="Try again" onPress={() => this.setState({ error: null })} />
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
