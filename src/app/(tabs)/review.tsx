import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ChoiceCard } from '@/components/ui/choice-card';
import { StickerLink } from '@/components/ui/sticker-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
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
  const bottomInset = useBottomTabInset();
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
      {/* The floating nav bar is drawn OVER this screen, and nothing here
          reserved room for it, so the fourth card sat underneath it and
          looked like it was missing. Every other tab screen already pays
          this inset; this one never did. */}
      <SafeAreaView style={[styles.safeArea, { paddingBottom: bottomInset }]}>
        <ThemedText type="displaySerif">Create</ThemedText>

        {draftCount > 0 && (
          <StickerLink
            label={`You have ${draftCount} draft${draftCount === 1 ? '' : 's'}`}
            seed="drafts"
            onPress={() => router.push('/drafts')}
          />
        )}

        {/* One entry point instead of the old "New review" + "Bulk upload"
            pair — how the review gets built (from a location, or from
            photos' own metadata) is now a question asked inside that flow
            rather than two sibling choices here. See review-source.tsx. */}
        <ChoiceCard
          seed="review"
          accentIndex={0}
          icon="create-outline"
          title="New review"
          description="Log a place you have been."
          onPress={() => router.push('/review-source')}
        />

        <ChoiceCard
          seed="trip"
          accentIndex={1}
          icon="airplane-outline"
          title="New trip"
          description="Group reviews from a set of dates. Most are detected for you."
          onPress={() => router.push('/trip/new')}
        />

        <ChoiceCard
          seed="travel-book"
          accentIndex={2}
          icon="book-outline"
          title="New travel book"
          description="A trip told in order, from your reviews."
          onPress={() => router.push('/travel-book/new')}
        />

        <ChoiceCard
          seed="board"
          accentIndex={3}
          icon="bookmark-outline"
          title="New board"
          description="A collection to save reviews to."
          onPress={() => router.push('/board/new')}
        />
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
});
