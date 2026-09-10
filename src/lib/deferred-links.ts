import { Platform } from 'react-native';

import { setPendingInviteCode } from '@/lib/invites';

// Deferred deep linking: attributing an install that went through a store.
//
// WHY THIS EXISTS AT ALL
//
// The other two attribution paths need nothing: a web sign-up carries the
// code in the URL, and an invite opened on a device that already has the app
// is handed straight to src/app/i/[code].tsx. The gap is the one that
// matters most for growth — tap link, get sent to the App Store, install,
// open — because nothing survives that trip. The store hands the app no
// referrer on iOS at all, and the app's first launch has no idea a link was
// ever involved. A third party is genuinely the only way to close it: they
// fingerprint the click and match it to the install.
//
// WHY IT IS BEHIND AN OPTIONAL REQUIRE
//
// react-native-branch is a native module. Adding it to package.json without
// a matching native build would mean every launch of the current dev client
// tries to import a module that is not in the binary and crashes. Requiring
// it lazily and tolerating its absence means this file is inert until the
// package is installed AND a new build carries it — so the app keeps working
// in between, and turning it on is a build, not a code change.
//
// ⚠️ THE SDK SURFACE BELOW IS UNVERIFIED. It is written against Branch's
// documented `branch.subscribe` API, but I could not reach their docs to
// confirm it against a specific version. Check it against whatever version
// you install before trusting it. Everything it depends on — the pending
// code store, redemption, the write-once server function — is verified and
// does not change if this call signature turns out to differ.

// The key the invite code travels under on a Branch link. Set this as
// custom data when generating links (see docs/deferred-links.md).
const INVITE_CODE_KEY = 'invite_code';

type BranchParams = Record<string, unknown>;

type BranchSubscribePayload = {
  error?: unknown;
  params?: BranchParams;
};

type BranchModule = {
  subscribe: (cb: (payload: BranchSubscribePayload) => void) => () => void;
};

function loadBranch(): BranchModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-branch');
    const candidate = (mod?.default ?? mod) as BranchModule | undefined;
    if (candidate && typeof candidate.subscribe === 'function') return candidate;
    return null;
  } catch {
    // Not installed, or installed but absent from this native build. Both
    // are the ordinary state of things until the setup in
    // docs/deferred-links.md is done.
    return null;
  }
}

// Starts listening for attributed opens. Returns a teardown function, or a
// no-op when Branch is not available.
//
// Web is excluded outright: there is nothing to defer there, since the code
// is already in the URL the visitor is standing on.
export function initDeferredLinks(): () => void {
  if (Platform.OS === 'web') return () => {};

  const branch = loadBranch();
  if (!branch) return () => {};

  return branch.subscribe(({ error, params }) => {
    if (error || !params) return;

    // Only a genuine link open. Branch fires this callback for ordinary
    // launches too, where these keys are absent — acting on those would
    // re-park a stale code on every cold start.
    if (!params['+clicked_branch_link']) return;

    const code = params[INVITE_CODE_KEY];
    if (typeof code !== 'string' || code.length === 0) return;

    // Parked, not redeemed — there is usually no account yet at this point.
    // consumePendingInvite in auth-context picks it up at the first
    // authenticated moment, and redeem_invite is write-once, so a code that
    // arrives twice cannot produce a second attribution.
    setPendingInviteCode(code);
  });
}
