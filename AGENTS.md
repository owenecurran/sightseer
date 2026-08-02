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

All four sign-in/link functions and the web button need external setup before they can actually
finish an OAuth round-trip — as of now, **none of this has been done yet**:

1. **Apple Developer portal**: enable "Sign In with Apple" capability for the app's bundle ID
   (`com.owenecurran.alienapp`). The `expo-apple-authentication` config plugin (already in
   `app.json`) sets the entitlement on prebuild — no extra app.json config needed beyond that.
2. **Google Cloud Console**: create OAuth 2.0 client IDs — one "iOS" type (bundle ID:
   `com.owenecurran.alienapp`), one "Android" type (package + release/debug SHA-1), and one "Web
   application" type. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`.env.local`, see `.env.example`) to
   the **Web** client ID — every consumer (native SDK's `GoogleSignin.configure()`, and the web
   button's Google Identity Services `client_id`) needs specifically that one; the iOS/Android
   client IDs aren't referenced in app code (matched by bundle ID/package+SHA-1 automatically).
3. **Supabase Studio (hosted dashboard)** → Authentication → Providers: enable Google and Apple
   with matching client ID(s), or every one of the four functions above will reject the token
   server-side even with valid client-side setup. (`supabase/config.toml`'s
   `[auth.external.google]`/`[auth.external.apple]` blocks are local-dev-only placeholders — they
   only matter if `supabase start` is ever run against local Docker; this app always points at the
   hosted project.)
4. **EAS dev-client rebuild** — needed before either native button (Apple, or Google on
   iOS/Android) does anything on-device, since `expo-apple-authentication` and
   `@react-native-google-signin/google-signin` are native dependencies. The web Google button needs
   no rebuild — once step 2/3 are done, `npx expo start --web` picks it up directly.
