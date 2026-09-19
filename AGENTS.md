# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Google/Apple sign-in setup

`src/lib/social-auth.ts` has two pairs of functions:

- `linkAppleAccount()`/`linkGoogleAccount()` — links a Google/Apple identity onto the **already
  signed-in** Supabase user, via `supabase.auth.linkIdentity()`'s native ID-token overload. Used
  from Settings → "Connect account".
- `signInWithApple()`/`signInWithGoogle()` — creates a new account or signs into the existing one
  that already owns that identity, via `supabase.auth.signInWithIdToken()`. Used from the social
  buttons on `(auth)/sign-in.tsx` and `(auth)/sign-up.tsx` (`src/components/ui/social-auth-buttons.tsx`).

Google also has a **web** path: `@react-native-google-signin/google-signin` is native-only, so
`src/components/ui/google-sign-in-button.web.tsx` (the `.web.tsx` sibling of
`google-sign-in-button.tsx`, resolved automatically by the bundler on web builds) uses Google
Identity Services' own JS SDK + official rendered button instead, then calls
`supabase.auth.signInWithIdToken()` directly with the credential it returns. Apple has no web
equivalent — `expo-apple-authentication` is native-only, so the Apple button only renders on iOS.

The external setup these need — Apple's "Sign In with Apple" capability, the Google Cloud OAuth
client IDs (iOS, Android, and the **Web** one that `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must be set
to), the Google/Apple providers enabled in the hosted Supabase dashboard, and an EAS dev-client
build carrying the two native modules — **has been done**. Both sign-in paths work.

Note that `supabase/config.toml`'s `[auth.external.google]`/`[auth.external.apple]` blocks are
local-dev-only placeholders: they matter only if `supabase start` is ever run against local Docker,
and this app always points at the hosted project.

# react-native-worklets is held at 0.11.3 by an override

`package.json` pins `react-native-worklets` to **0.11.3** and carries an `overrides` block that
forces `expo-modules-core` to accept it. Both are deliberate. Do not "fix" either by running
`npx expo install --fix`, which will quietly drop the app back to 0.10.1.

The conflict: every published `expo-modules-core` — through the latest SDK 57 **and all of SDK 58**
— declares its worklets peer as `^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`, which excludes 0.11.x.
There is therefore no package you can upgrade to make 0.11.3 resolve cleanly; the cap is Expo's and
it has not moved. `npm install` tolerates the conflict silently, which is why this went unnoticed —
`npm ci` does not, and an EAS production build runs `npm ci --include=dev`. That is the failure to
recognise if it ever comes back:

    npm error Missing: react-native-worklets@0.10.4 from lock file

Read that carefully before acting on it. It is NOT a stale lock file. npm is reporting that it
wants to install a **second, nested** copy of worklets at 0.10.4 to satisfy expo-modules-core,
because the hoisted one is out of that peer's range. Regenerating the lock "fixes" the error by
shipping two copies of a native module into the build, which is worse than the error.

Why 0.11.3 rather than Expo's 0.10.1: it works, and the dev client has been running on it. The peer
range is Expo being conservative rather than a demonstrated incompatibility, and the peer is marked
`optional: true` — the integration is gated behind `enableWorkletsIntegration`, not required.

The risk this accepts, and why it was judged acceptable: `expo-modules-core` really does compile
against worklets' C++ (`#include <worklets/SharedItems/Serializable.h>`, plus native-lib linking in
its `android/build.gradle`). If a future `expo-modules-core` changes that usage in a way 0.11.3
does not satisfy, **the Android build fails at the CMake step** — loudly, in CI, before anything
ships. It is not a silent runtime corruption. The fix at that point is to take Expo's expected
version and rebuild the dev client.

Two things to know if you touch this:

- The override is written as `"react-native-worklets": "$react-native-worklets"`, which is npm's
  syntax for "whatever the dependency is pinned to". Change the version in `dependencies` only; the
  override follows it.
- It is a **scoped** override, not `legacy-peer-deps=true` in an `.npmrc`. That distinction is the
  point: this silences exactly one peer check and leaves every other one working. A blanket
  `legacy-peer-deps` would also hide the next genuine conflict — a React major, a mismatched
  react-native — with no signal at all.

Worklets ships native code, so the JS version and the version compiled into the dev client have to
match. Changing it means a new EAS dev-client build; otherwise the app dies on launch with
`[Worklets] Mismatch between C++ code version and JavaScript code version` followed by a wall of
`undefined is not a function`. Observed, not theorised.
