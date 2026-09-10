import { useEffect, useState } from 'react';

import { router, useLocalSearchParams } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { WebLanding } from '@/components/web-landing';
import { useAuth } from '@/lib/auth-context';
import {
  consumePendingInvite,
  recordInviteClick,
  resolveInvite,
  setPendingInviteCode,
  type Inviter,
} from '@/lib/invites';

// The web half of an invite link: the landing page, with a band naming
// whoever sent it.
//
// The same page a stranger gets at '/', plus the one fact that makes an
// invite an invite. Everything about installing, signing up, and which
// store this device can use lives in WebLanding, so the two entry points
// cannot drift.
export default function InviteLandingRoute() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, isLoading } = useAuth();
  const [inviter, setInviter] = useState<Inviter | null>(null);

  // Someone who already has a session does not need the pitch. Redeem
  // whatever they arrived with and put them back in the app.
  useEffect(() => {
    if (isLoading || !session || !code) return;
    let cancelled = false;
    (async () => {
      await setPendingInviteCode(code);
      await consumePendingInvite();
      if (!cancelled) router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
  }, [code, isLoading, session]);

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

  // An unknown or revoked code still gets the landing page, just without the
  // band — a dead link should read as "here is the app" rather than as an
  // error about someone else's invite.
  if (session) return <ThemedView type="screen" style={{ flex: 1 }} />;

  return <WebLanding inviter={inviter} />;
}
