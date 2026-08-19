import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

// Step one of "New review": what the review should be built from. The photo
// branch has its own follow-up question (how to split the batch), revealed
// inline rather than pushed as a third screen — it's a single binary choice,
// and making it a route would mean two taps and two back presses to change
// one answer.
export default function ReviewSourceScreen() {
  const [isPhotoBranchOpen, setIsPhotoBranchOpen] = useState(false);

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="link">← Back</ThemedText>
        </Pressable>

        <ThemedText type="displaySerif">New review</ThemedText>

        <Pressable onPress={() => router.push('/review-form')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">Based on location</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Search for the place first, then add photos and a rating.
            </ThemedText>
          </ThemedView>
        </Pressable>

        <Pressable onPress={() => setIsPhotoBranchOpen((open) => !open)}>
          <ThemedView
            type={isPhotoBranchOpen ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.optionCard}>
            <ThemedText type="headline">Based on photo(s)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              We'll read each photo's location and date from its metadata and fill the review in for
              you.
            </ThemedText>
          </ThemedView>
        </Pressable>

        {isPhotoBranchOpen && (
          <View style={styles.branch}>
            <Pressable onPress={() => router.push({ pathname: '/bulk-upload', params: { mode: 'per-photo' } })}>
              <ThemedView type="backgroundElement" style={styles.subOptionCard}>
                <ThemedText type="smallBold">One review per photo</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Each photo becomes its own review, with its own place and date. Pick a single photo
                  to just make one.
                </ThemedText>
              </ThemedView>
            </Pressable>

            <Pressable onPress={() => router.push({ pathname: '/bulk-upload', params: { mode: 'single' } })}>
              <ThemedView type="backgroundElement" style={styles.subOptionCard}>
                <ThemedText type="smallBold">One review for all photos</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Every photo goes on one review, using the first photo that has a location.
                </ThemedText>
              </ThemedView>
            </Pressable>
          </View>
        )}
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
  // Indented under the branch they belong to, so the two-level structure
  // reads as a tree rather than as four equal choices.
  branch: {
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    marginTop: -Spacing.one,
  },
  subOptionCard: {
    gap: Spacing.one,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
