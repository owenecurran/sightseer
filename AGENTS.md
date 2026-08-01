# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Connected accounts (Settings → Google/Apple) setup

`src/lib/social-auth.ts` links a Google/Apple identity onto the signed-in Supabase user via
`supabase.auth.linkIdentity()`'s native ID-token overload. The client code is complete but needs
external setup before it can actually finish an OAuth round-trip:

- **Apple**: enable "Sign In with Apple" capability for the app's bundle ID in the Apple Developer
  portal. The `expo-apple-authentication` config plugin (already in `app.json`) sets the entitlement
  on prebuild — no extra app.json config needed beyond that.
- **Google**: create OAuth 2.0 client IDs in Google Cloud Console — one "iOS" type (bundle ID:
  `com.owenecurran.alienapp`), one "Android" type (package + release/debug SHA-1), and one "Web
  application" type. Set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`.env.local`, see `.env.example`) to
  the **Web** client ID — that's what `GoogleSignin.configure()` needs for the native SDKs to
  populate an `idToken` at all; the iOS/Android client IDs themselves aren't referenced in app code
  (they're matched by bundle ID/package+SHA-1 automatically).
- Supabase itself also needs Google/Apple enabled as providers in the dashboard (Authentication →
  Providers) with matching client IDs, or `linkIdentity()` will reject the token server-side even
  with valid client-side setup.
- Both add new native dependencies (`expo-apple-authentication`,
  `@react-native-google-signin/google-signin`) — needs an EAS dev-client rebuild before either
  button does anything on-device, same as any other native dependency change.
