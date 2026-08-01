import { supabase } from '@/lib/supabase';

// Links a Google/Apple identity onto the CURRENTLY signed-in Supabase user
// (Settings' "Connect account" action) via linkIdentity's native ID-token
// overload — not a sign-in flow (that would create/attach to whichever
// account the token's email happens to match, not necessarily this one).
// Neither of these will actually complete until real OAuth client IDs are
// configured (Apple Developer "Sign in with Apple" capability; Google Cloud
// OAuth client IDs) — see AGENTS.md/README for setup once available.

export async function linkAppleAccount(): Promise<void> {
  // Dynamic import: native-only module, would fail to even load on web.
  const AppleAuthentication = await import('expo-apple-authentication');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

export async function linkGoogleAccount(): Promise<void> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  // The "Web" client ID from Google Cloud Console (not the iOS/Android one)
  // — Supabase's own ID-token verification requires it, same as the iOS/
  // Android SDKs themselves do for the `idToken` field to be populated.
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success' || !response.data.idToken) {
    throw new Error('Google sign-in was cancelled or did not return an identity token.');
  }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'google',
    token: response.data.idToken,
  });
  if (error) throw error;
}
