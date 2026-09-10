import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BackLink } from '@/components/ui/back-link';
import { CheckboxRow } from '@/components/ui/checkbox-row';
import { MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useHideOnScrollHandler } from '@/hooks/use-hide-on-scroll';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

export type NotificationKey =
  | 'notify_likes'
  | 'notify_comments'
  | 'notify_follows'
  | 'notify_tags'
  | 'notify_saves'
  | 'notify_friend_activity'
  | 'notify_nearby_reviews'
  | 'notify_friend_digest';

// Grouped by what actually prompts the notification, because the deciding
// question differs: "someone did something to my post" is a different
// appetite from "here is a weekly round-up". Flat, all eight preferences
// read as one undifferentiated wall — which is what they were on the
// settings screen.
const NOTIFICATION_GROUPS: {
  title: string;
  caption: string;
  options: { key: NotificationKey; label: string; defaultValue: boolean }[];
}[] = [
  {
    title: 'About you',
    caption: 'When someone interacts with you or something you posted.',
    options: [
      { key: 'notify_likes', label: 'Likes on my visits', defaultValue: true },
      { key: 'notify_comments', label: 'Comments on my visits', defaultValue: true },
      { key: 'notify_follows', label: 'New followers and follow requests', defaultValue: true },
      { key: 'notify_tags', label: 'Someone tags me in a review', defaultValue: true },
      { key: 'notify_saves', label: 'Someone saves my board or travel book', defaultValue: true },
    ],
  },
  {
    title: 'From people you follow',
    caption: 'Activity from the people in your feed.',
    options: [
      {
        key: 'notify_friend_activity',
        label: 'People I follow post a new review',
        defaultValue: false,
      },
    ],
  },
  {
    title: 'Weekly round-ups',
    caption: 'At most one of each per week.',
    options: [
      {
        key: 'notify_nearby_reviews',
        label: 'New reviews at places I’ve been',
        defaultValue: false,
      },
      {
        key: 'notify_friend_digest',
        label: 'Reviews I missed from people I follow',
        defaultValue: true,
      },
    ],
  },
];

// Its own screen rather than a block on Settings. Eight checkboxes made
// Settings roughly twice as long as everything else on it put together, and
// pushed the things people actually open Settings for below the fold.
export default function NotificationSettingsScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const scrollHandler = useHideOnScrollHandler();
  const bottomInset = useBottomTabInset();
  const [saving, setSaving] = useState<NotificationKey | null>(null);

  async function handleToggle(key: NotificationKey) {
    if (!session || !profile) return;
    setSaving(key);
    // Just the toggled column. This used to resend every preference, spelled
    // out by hand — which meant adding a new one silently required editing
    // this list too, and failed to compile only because the type happened to
    // demand every key.
    const update = { [key]: !profile[key] } as Partial<Record<NotificationKey, boolean>>;
    const { error } = await supabase.from('users').update(update).eq('id', session.user.id);
    setSaving(null);
    if (!error) await refreshProfile();
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomInset }]}
          showsVerticalScrollIndicator={false}
          onScroll={scrollHandler}
          scrollEventThrottle={16}>
          <BackLink seed="notification-settings" />

          <ThemedText type="displaySerif">Notifications</ThemedText>

          {NOTIFICATION_GROUPS.map((group) => (
            <ThemedView key={group.title} type="backgroundElement" style={styles.card}>
              <ThemedText type="sectionLabel">{group.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {group.caption}
              </ThemedText>
              <View style={styles.options}>
                {group.options.map((option) => (
                  <CheckboxRow
                    key={option.key}
                    label={option.label}
                    checked={profile?.[option.key] ?? option.defaultValue}
                    onPress={() => handleToggle(option.key)}
                    disabled={saving === option.key}
                  />
                ))}
              </View>
            </ThemedView>
          ))}
        </Animated.ScrollView>
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
    width: '100%',
  },
  scrollContent: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four + TopTabInset,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  // Tighter than the card's own gap so the checkboxes read as one list
  // rather than as separate settings that happen to be adjacent.
  options: {
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
});
