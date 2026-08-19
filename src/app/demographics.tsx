import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import type { Database } from '@/lib/database.types';
import { addHomeLocation } from '@/lib/home-locations';
import { supabase } from '@/lib/supabase';

type PlaceRow = Database['public']['Tables']['places']['Row'];

const MIN_AGE_YEARS = 13;
const BIRTHDATE_YEARS_BACK = 100;

// A neutral starting point for the birthdate wheel — defaulting to "today"
// (like review-form.tsx's visited-on picker does) would render as today's
// date sitting in a field asking for a birthdate, which reads as a bug, not
// an unset field. This is only ever shown once the user actually opens the
// picker; `birthdate` itself stays null until they do.
function defaultBirthdateSeed(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 25);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function ageInYears(isoBirthdate: string): number {
  const birth = new Date(isoBirthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

// New step between privacy-choice and invite-gate, gated by
// users.has_set_demographics (src/app/_layout.tsx) — optional/skippable,
// unlike privacy-choice: these fields aren't needed for the app to function
// today, they're captured for future use (feed ranking, profile prompts).
export default function DemographicsScreen() {
  const { session, refreshProfile } = useAuth();
  const [homePlace, setHomePlace] = useState<PlaceRow | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [birthdate, setBirthdate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(fields: { home_place_id: string | null; birthdate: string | null }) {
    if (!session) return;
    setError(null);
    setIsSubmitting(true);
    const { error: updateError } = await supabase
      .from('users')
      .update({ ...fields, has_set_demographics: true })
      .eq('id', session.user.id);

    // The hometown also becomes the user's first *home location*, which is
    // what trip detection actually reads (users.home_place_id is only the
    // demographic — see 20260819090200_backfill_home_locations.sql). Doing
    // it here means trips work from day one instead of silently never
    // grouping until someone happens to find the Settings screen.
    //
    // Deliberately not fatal: onboarding must not be blockable by this.
    // Worst case the user adds it later in Settings, so a failure here is
    // swallowed rather than trapping them on this step.
    if (!updateError && fields.home_place_id) {
      try {
        await addHomeLocation(session.user.id, {
          id: fields.home_place_id,
          name: homePlace?.name ?? '',
        } as PlaceRow);
      } catch {
        // Already saved, or at the cap — neither is worth interrupting
        // signup over.
      }
    }

    setIsSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }
    await refreshProfile();
    // Root layout re-evaluates guards once profile.has_set_demographics is true.
  }

  function handleContinue() {
    if (birthdate && ageInYears(birthdate) < MIN_AGE_YEARS) {
      setError(`You must be at least ${MIN_AGE_YEARS} to use Sightseer.`);
      return;
    }
    submit({ home_place_id: homePlace?.id ?? null, birthdate });
  }

  function handleSkip() {
    submit({ home_place_id: null, birthdate: null });
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Tell us about yourself
        </ThemedText>
        <ThemedText type="default" style={styles.title} themeColor="textSecondary">
          Optional — helps us build better recommendations down the line. You can add this later in
          Settings.
        </ThemedText>

        <View style={styles.section}>
          <ThemedText type="smallBold">Where are you based?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Reviews you post around here count as everyday life — anything further afield gets grouped
            into a trip. You can add up to 5 places later in Settings.
          </ThemedText>
          <Pressable onPress={() => setIsPickerOpen(true)}>
            <ThemedView type="backgroundElement" style={styles.chip}>
              <ThemedText type="default" themeColor={homePlace ? 'text' : 'textSecondary'}>
                {homePlace ? homePlace.name : 'Add your home city'}
              </ThemedText>
            </ThemedView>
          </Pressable>
          {homePlace && (
            <Pressable onPress={() => setHomePlace(null)} hitSlop={8}>
              <ThemedText type="small" themeColor="textSecondary">
                Clear
              </ThemedText>
            </Pressable>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold">Birthdate</ThemedText>
          {birthdate ? (
            <>
              <DateCarousel
                value={birthdate}
                onChange={setBirthdate}
                yearsBack={BIRTHDATE_YEARS_BACK}
              />
              <Pressable onPress={() => setBirthdate(null)} hitSlop={8}>
                <ThemedText type="small" themeColor="textSecondary">
                  Clear
                </ThemedText>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setBirthdate(defaultBirthdateSeed())}>
              <ThemedView type="backgroundElement" style={styles.chip}>
                <ThemedText type="default" themeColor="textSecondary">
                  Add your birthdate
                </ThemedText>
              </ThemedView>
            </Pressable>
          )}
        </View>

        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}

        <Button label="Continue" onPress={handleContinue} loading={isSubmitting} />
        <Pressable onPress={handleSkip} disabled={isSubmitting}>
          <ThemedText type="link" style={styles.title}>
            Skip for now
          </ThemedText>
        </Pressable>

        <LocationSearchModal
          visible={isPickerOpen}
          onCancel={() => setIsPickerOpen(false)}
          onSelect={(place) => {
            setHomePlace(place);
            setIsPickerOpen(false);
          }}
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
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  chip: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
