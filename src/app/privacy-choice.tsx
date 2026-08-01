import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Choice = 'public' | 'private';

const OPTIONS: { key: Choice; label: string; description: string }[] = [
  {
    key: 'public',
    label: 'Public',
    description: 'Anyone can see your profile, visits, and the places you’ve been.',
  },
  {
    key: 'private',
    label: 'Private',
    description: 'Only people you approve as followers can see your profile and visited places.',
  },
];

// New step between onboarding (handle/name) and invite-gate, gated by
// users.has_set_privacy (src/app/_layout.tsx) — this app stores real
// location data (visited places, a per-user map), so this is asked for
// explicitly up front rather than silently defaulting to public.
export default function PrivacyChoiceScreen() {
  const { session, refreshProfile } = useAuth();
  const [choice, setChoice] = useState<Choice>('public');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleContinue() {
    if (!session) return;
    setError(null);
    setIsSubmitting(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ is_private: choice === 'private', has_set_privacy: true })
      .eq('id', session.user.id);
    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    // Root layout re-evaluates guards once profile.has_set_privacy is true.
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Choose your privacy
        </ThemedText>
        <ThemedText type="default" style={styles.title} themeColor="textSecondary">
          This app has real location data on it — where you’ve been, and when. You can change this
          later in Settings.
        </ThemedText>

        <ThemedView style={styles.options}>
          {OPTIONS.map((option) => {
            const active = choice === option.key;
            return (
              <Pressable key={option.key} onPress={() => setChoice(option.key)}>
                <ThemedView
                  type={active ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.optionCard}>
                  <ThemedText type="smallBold">{option.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {option.description}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </ThemedView>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <Button label="Continue" onPress={handleContinue} loading={isSubmitting} />
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
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  title: {
    textAlign: 'center',
  },
  options: {
    gap: Spacing.three,
  },
  optionCard: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
