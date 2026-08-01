import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

// The add-circle nav tab used to land straight on the review form (now
// review-form.tsx) — this chooser sits in front of it so "New travel book"
// has a create-flow entry point too, without touching floating-nav-bar.tsx
// or tab-routes.ts (this file is already what setActivePage(2) resolves to
// on both native and web).
export default function CreateChooserScreen() {
  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif">Create</ThemedText>

        <Pressable onPress={() => router.push('/review-form')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">New review</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log a visit to a place you've been.
            </ThemedText>
          </ThemedView>
        </Pressable>

        <Pressable onPress={() => router.push('/travel-book/new')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">New travel book</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Start a chronological log of a trip, made up of your own reviews and reviews you're
              tagged in.
            </ThemedText>
          </ThemedView>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  optionCard: {
    gap: Spacing.one,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
