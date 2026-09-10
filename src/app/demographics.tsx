import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LocationSearchModal } from '@/components/location-search-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { DateCarousel } from '@/components/ui/date-carousel';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { markAgeGateApplied, recordAgeGateFailure, shouldBlockNewAccount } from '@/lib/age-gate';
import { useAuth } from '@/lib/auth-context';
import { flagSelfUnderage, MIN_AGE_YEARS } from '@/lib/bans';
import type { Database } from '@/lib/database.types';
import { addHomeLocation } from '@/lib/home-locations';
import { supabase } from '@/lib/supabase';

type PlaceRow = Database['public']['Tables']['places']['Row'];

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

  // Someone who already failed the age gate on this device and then made a
  // second account gets stopped here rather than at the point of answering.
  // Weak on its own — a reinstall clears it — but it costs one read and
  // closes the obvious retry.
  //
  // Mount-once via a ref, with refreshProfile deliberately absent from the
  // dependencies: it is redeclared on every AuthProvider render and calls
  // setProfile, so depending on it would make this effect re-run its own
  // consequence forever.
  const hasCheckedDevice = useRef(false);
  useEffect(() => {
    if (hasCheckedDevice.current || !session) return;
    hasCheckedDevice.current = true;
    shouldBlockNewAccount(session.user.id).then(async (shouldBlock) => {
      if (!shouldBlock) return;
      // Marked first, so this account is never blocked twice — that is what
      // makes a later admin unban permanent rather than something this
      // effect quietly reverses on the next visit.
      await markAgeGateApplied(session.user.id);
      flagSelfUnderage().then(refreshProfile).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

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

  // Shared by both buttons — the birthdate rules are identical whether or
  // not a home location was given, and having them in one place is what
  // stops the two paths drifting apart the way they did when skipping
  // submitted a null birthdate.
  //
  // Returns false when the caller should stop.
  async function passesAgeCheck(): Promise<boolean> {
    if (!birthdate) {
      setError('Please enter your date of birth to continue.');
      return false;
    }
    if (ageInYears(birthdate) >= MIN_AGE_YEARS) return true;

    // A single answer, acted on once. Rather than just refusing and letting
    // them type a different year, the declared age closes the account and is
    // remembered on this device — the retry is the entire failure mode of an
    // age gate that only says no.
    //
    // Order matters: the device flag is written first so it survives even if
    // the network call fails. Neither is reversible from in here; an admin
    // lifts an underage ban, which is the mistyped-year escape hatch.
    setIsSubmitting(true);
    if (session) await recordAgeGateFailure(session.user.id);
    try {
      await flagSelfUnderage();
      // Routes to the ban screen once the guard in _layout.tsx sees it.
      await refreshProfile();
    } catch {
      // Deliberately stated only AFTER a date is entered. Announcing the
      // threshold up front mostly teaches a child which year to type.
      setError(`You must be at least ${MIN_AGE_YEARS} to use Sightseer.`);
    }
    setIsSubmitting(false);
    return false;
  }

  async function handleContinue() {
    if (!(await passesAgeCheck())) return;
    submit({ home_place_id: homePlace?.id ?? null, birthdate });
  }

  // Skips the home location only — the birthdate is not skippable.
  async function handleSkipHomeLocation() {
    if (!(await passesAgeCheck())) return;
    submit({ home_place_id: null, birthdate });
  }

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          Tell us about yourself
        </ThemedText>
        <ThemedText type="default" style={styles.title} themeColor="textSecondary">
          Your date of birth is required. Where you are based is optional and helps us build better
          recommendations — you can add it later in Settings.
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
        <Pressable onPress={handleSkipHomeLocation} disabled={isSubmitting}>
          <ThemedText type="link" style={styles.title}>
            Skip home location
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
