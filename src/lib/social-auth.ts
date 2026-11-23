import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// The two client IDs Google Sign-In needs, which do different jobs and are
// both required on iOS.
//
// webClientId is the AUDIENCE of the ID token — Supabase verifies the token
// was minted for this project, so it must be the Web client even in a
// native app.
//
// iosClientId is WHICH NATIVE CLIENT THIS APP IS. Android does not need it
// passed because the library reads it out of google-services.json, which is
// bundled there; iOS has no equivalent file here, so without this the SDK
// has nothing to identify itself with and throws
// "RNGoogleSignin: failed to determine clientID" before any UI appears.
//
// Passing iosClientId on Android is harmless (it is simply unused), but the
// value is only defined for the platform that needs it so a missing iOS
// client ID cannot silently look configured.
function googleSignInConfig() {
  return {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    ...(Platform.OS === 'ios'
      ? { iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID }
      : {}),
  };
}

// Fails with something a human can act on. The SDK's own error names the
// symptom, not the cause, and this is the one misconfiguration that reaches
// a real user as a dead button.
function assertGoogleConfigured() {
  if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    throw new Error('Google sign-in is not configured: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is unset.');
  }
  if (Platform.OS === 'ios' && !process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID) {
    throw new Error('Google sign-in is not configured: EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is unset.');
  }
}

// Closing the Google or Apple sheet is the person changing their mind, not a
// failure, so all four functions below return quietly for it, the same as
// pressing nothing. They used to throw, and the screen answered a deliberate
// "no thanks" with an error: "Google sign-in was cancelled or did not return
// an identity token." for Google, "Could not sign in with Apple." for Apple.
function isAppleCancel(error: unknown): boolean {
  // expo-apple-authentication's documented rejection for a cancelled sheet.
  return (error as { code?: unknown } | null)?.code === 'ERR_REQUEST_CANCELED';
}

// When a provider says yes but hands back nothing to sign in with. Rare, and
// not the person's doing; worded for them rather than about tokens.
const GOOGLE_NO_TOKEN = 'Google did not finish signing you in. Try again.';
const APPLE_NO_TOKEN = 'Apple did not finish signing you in. Try again.';

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
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err) {
    if (isAppleCancel(err)) return;
    throw err;
  }
  if (!credential.identityToken) {
    throw new Error(APPLE_NO_TOKEN);
  }
  const { error } = await supabase.auth.linkIdentity({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;
}

export async function linkGoogleAccount(): Promise<void> {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  assertGoogleConfigured();
  GoogleSignin.configure(googleSignInConfig());
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled') return;
  if (!response.data.idToken) {
    throw new Error(GOOGLE_NO_TOKEN);
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
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if (isAppleCancel(err)) return;
    throw err;
  }
  if (!credential.identityToken) {
    throw new Error(APPLE_NO_TOKEN);
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
  assertGoogleConfigured();
  GoogleSignin.configure(googleSignInConfig());
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (response.type === 'cancelled') return;
  if (!response.data.idToken) {
    throw new Error(GOOGLE_NO_TOKEN);
  }
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: response.data.idToken,
  });
  if (error) throw error;
}
