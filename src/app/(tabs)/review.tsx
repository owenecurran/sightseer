import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useTabFocusEffect } from '@/hooks/use-tab-pager';
import { useAuth } from '@/lib/auth-context';
import { countMyDrafts } from '@/lib/drafts';

// The add-circle nav tab used to land straight on the review form (now
// review-form.tsx) — this chooser sits in front of it so "New travel book"
// has a create-flow entry point too, without touching floating-nav-bar.tsx
// or tab-routes.ts (this file is already what setActivePage(2) resolves to
// on both native and web).
export default function CreateChooserScreen() {
  const { session } = useAuth();
  const [draftCount, setDraftCount] = useState(0);

  useTabFocusEffect(
    2,
    useCallback(() => {
      if (!session) return;
      countMyDrafts(session.user.id).then(setDraftCount);
    }, [session])
  );

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="displaySerif">Create</ThemedText>

        {draftCount > 0 && (
          <Pressable onPress={() => router.push('/drafts')}>
            <ThemedText type="link">
              You have {draftCount} draft{draftCount === 1 ? '' : 's'} →
            </ThemedText>
          </Pressable>
        )}

        {/* One entry point instead of the old "New review" + "Bulk upload"
            pair — how the review gets built (from a location, or from
            photos' own metadata) is now a question asked inside that flow
            rather than two sibling choices here. See review-source.tsx. */}
        <Pressable onPress={() => router.push('/review-source')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">New review</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log a visit to a place you've been — from a location, or straight from your photos.
            </ThemedText>
          </ThemedView>
        </Pressable>

        <Pressable onPress={() => router.push('/trip/new')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">New trip</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Group the reviews from a set of dates into one trip. Most trips are detected for you —
              this is for the ones that aren't.
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

        <Pressable onPress={() => router.push('/board/new')}>
          <ThemedView type="backgroundElement" style={styles.optionCard}>
            <ThemedText type="headline">New board</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Start a collection to save your own or anyone else's reviews to.
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
