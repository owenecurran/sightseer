import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackLink } from '@/components/ui/back-link';
import { ChoiceCard } from '@/components/ui/choice-card';
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
        <BackLink seed="review-source" />

        <ThemedText type="displaySerif">New review</ThemedText>

        <ChoiceCard
          seed="from-location"
          accentIndex={0}
          title="Based on location"
          description="Search for the place first, then add photos and a rating."
          onPress={() => router.push('/review-form')}
        />

        {/* 'select', not 'navigate': this one opens the branch below rather
            than going anywhere, so it takes the tick treatment. */}
        <ChoiceCard
          seed="from-photos"
          accentIndex={1}
          mode="select"
          selected={isPhotoBranchOpen}
          title="Based on photo(s)"
          description="We'll read each photo's location and date from its metadata and fill the review in for you."
          onPress={() => setIsPhotoBranchOpen((open) => !open)}
        />

        {isPhotoBranchOpen && (
          <View style={styles.branch}>
            <ChoiceCard
              seed="per-photo"
              accentIndex={2}
              compact
              title="One review per photo"
              description="Each photo becomes its own review, with its own place and date. Pick a single photo to just make one."
              onPress={() => router.push({ pathname: '/bulk-upload', params: { mode: 'per-photo' } })}
            />

            <ChoiceCard
              seed="single-review"
              accentIndex={3}
              compact
              title="One review for all photos"
              description="Every photo goes on one review, using the first photo that has a location."
              onPress={() => router.push({ pathname: '/bulk-upload', params: { mode: 'single' } })}
            />
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
  // Indented under the branch they belong to, so the two-level structure
  // reads as a tree rather than as four equal choices.
  branch: {
    gap: Spacing.two,
    paddingLeft: Spacing.four,
    marginTop: -Spacing.one,
  },
});
