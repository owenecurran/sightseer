import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

import { router, useLocalSearchParams } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { PaperPanel } from '@/components/ui/paper-panel';
import { InviteMobileLanding } from '@/components/invite-mobile-landing';
import { WebLanding } from '@/components/web-landing';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import {
  recordInviteClick,
  redeemInvite,
  resolveInvite,
  setPendingInviteCode,
  type Inviter,
} from '@/lib/invites';
import { detectDevicePlatform, type DevicePlatform } from '@/lib/stores';

// The web half of an invite link.
//
// Three audiences, and they want completely different things:
//
//   desktop, signed out  — the landing page, with a band naming the sender.
//   phone, signed out    — how to get the app, and nothing else.
//   signed in            — an answer about what just happened to this link.
//
// The third case used to render an empty ThemedView and fire a redirect from
// an effect. When the redeem call was slow or failed the redirect never ran
// and the page simply stayed blank — a dead screen, reported as such. It now
// renders a real answer in every outcome and navigates only when the person
// presses something.

// What became of the code, for somebody who already has an account.
type Outcome =
  | 'working'
  // Attributed to this link, just now.
  | 'redeemed'
  // They already had an inviter before this link was opened. Write-once by
  // design — see redeem_invite in 20260909120000_invite_links.sql.
  | 'already'
  // Unknown, revoked, or their own link.
  | 'rejected';

export default function InviteLandingRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, profile, isLoading, refreshProfile } = useAuth();
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [outcome, setOutcome] = useState<Outcome>('working');

  // Server-rendered as 'desktop' and corrected on the client, the same way
  // WebLanding does it and for the same reason: reading the user agent
  // during render would make the prerendered markup disagree with what
  // hydrates over it.
  const device = useSyncExternalStore<DevicePlatform>(
    () => () => {},
    detectDevicePlatform,
    () => 'desktop'
  );

  // ---------------- signed in ----------------
  //
  // Attempted exactly once per code, which the ref enforces and which two
  // separate things here depend on.
  //
  // The first is that a success must stay a success. refreshProfile() below
  // sets invite_attributed_at, which this effect reads — so on the re-run
  // the same link would look like one that had arrived too late, and a
  // "You are all set" would rewrite itself to "already used" a moment after
  // the person read it.
  //
  // The second is that `profile` has to have loaded before any of this can
  // be judged at all: a null profile makes hadInviter false, which would
  // report a genuinely already-attributed account as a broken link.
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !session || !code || !profile) return;
    if (attempted.current === code) return;
    attempted.current = code;

    let cancelled = false;
    (async () => {
      // Read BEFORE redeeming. redeem_invite returns false for "already
      // attributed", "unknown code" and "your own link" alike, so the only
      // way to tell the first from the other two is to know whether an
      // attribution existed on the way in.
      const hadInviter = profile.invite_attributed_at != null;
      const redeemed = await redeemInvite(code);
      if (cancelled) return;
      if (redeemed) {
        setOutcome('redeemed');
        // invited_by is now set; pull it so anything reading the profile
        // downstream does not show stale attribution.
        void refreshProfile();
        return;
      }
      setOutcome(hadInviter ? 'already' : 'rejected');
    })();
    return () => {
      cancelled = true;
    };
  }, [code, isLoading, session, profile, refreshProfile]);

  // ---------------- signed out ----------------
  useEffect(() => {
    if (!code || session) return;
    // Parked now so it survives the trip through sign-up, which is several
    // screens away and may involve a round trip through an email link.
    setPendingInviteCode(code);
    recordInviteClick(code);

    let cancelled = false;
    resolveInvite(code).then((found) => {
      if (!cancelled) setInviter(found);
    });
    return () => {
      cancelled = true;
    };
  }, [code, session]);

  if (session) {
    return (
      <ThemedView type="screen" style={styles.screen}>
        <PaperPanel seed={`invite-state:${code}`} style={styles.panel}>
          <ThemedText type="displaySerif" style={styles.centered}>
            {outcome === 'working' && 'Checking that link…'}
            {outcome === 'redeemed' && 'You are all set.'}
            {outcome === 'already' && 'You have already used an invite link.'}
            {outcome === 'rejected' && 'That link cannot be used.'}
          </ThemedText>

          <ThemedText type="body" themeColor="textSecondary" style={styles.centered}>
            {outcome === 'working' &&
              'One moment while we check whether this invite can be applied to your account.'}
            {outcome === 'redeemed' &&
              'Whoever sent you this link has been credited with your sign-up.'}
            {/* Said plainly rather than apologised for. Only the first link
                counts, on purpose, so that attribution describes how someone
                actually arrived rather than the last link they happened to
                click. Nothing has gone wrong and nothing is lost. */}
            {outcome === 'already' &&
              'Only the first invite link you open counts, so this one has not changed anything. Your account is unaffected.'}
            {outcome === 'rejected' &&
              'It may have expired, been revoked, or be your own invite link. Your account is unaffected.'}
          </ThemedText>

          {outcome !== 'working' && (
            <Button label="Continue to Sightseer" onPress={() => router.replace('/')} />
          )}
        </PaperPanel>
      </ThemedView>
    );
  }

  // A phone that was sent a link wants the app, not a marketing page.
  if (device === 'ios' || device === 'android') {
    return <InviteMobileLanding code={code} device={device} inviter={inviter} />;
  }

  // An unknown or revoked code still gets the landing page, just without the
  // band — a dead link should read as "here is the app" rather than as an
  // error about someone else's invite.
  return <WebLanding inviter={inviter} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.five,
  },
  panel: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.five,
  },
  centered: {
    textAlign: 'center',
  },
});
