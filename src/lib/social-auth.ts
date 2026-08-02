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

// Sign-up/sign-in (as opposed to the link* functions above, which require an
// existing session): creates a new Supabase user from the ID token, or signs
// into the existing one that already owns that identity, in one call.
// Native mobile only — web Google sign-in lives in the .web.tsx sibling of
// google-sign-in-button.tsx, which calls signInWithIdToken directly against
// Google Identity Services' own token instead of going through this module.

export async function signInWithApple(): Promise<void> {
  const AppleAuthentication = await import('expo-apple-authentication');
  const Crypto = await import('expo-crypto');
  // Raw/hashed nonce pair: Apple gets the hash, Supabase verifies against the
  // raw value it's handed back — standard replay protection for this flow.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (response.type !== 'success' || !response.data.idToken) {
    throw new Error('Google sign-in was cancelled or did not return an identity token.');
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.data.idToken,
  });
  if (error) throw error;
}
