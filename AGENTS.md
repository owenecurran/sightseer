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
