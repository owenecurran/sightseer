import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { Turnstile, isTurnstileConfigured } from '@/components/auth/turnstile';
import { SocialAuthButtons } from '@/components/ui/social-auth-buttons';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { authErrorMessage, isEmailNotConfirmed } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';
import { signInWithUsername } from '@/lib/username-signin';

// The auth forms as components rather than whole screens.
//
// Extracted so the welcome screen can reveal one INSIDE its own panel
// instead of navigating away — the panel expands and the chosen form is
// underneath it, which is one continuous movement rather than a page
// change. The standalone (auth) routes render the same components, so there
// is exactly one implementation of each and the two entry points cannot
// drift apart.

// Captcha is NOT signup-only.
//
// Once captcha protection is enabled on the project, Supabase enforces it
// on every auth grant — password sign-in, password recovery and resend
// included, not just /signup. A form that omits the token is not merely
// unprotected, it is BROKEN: the endpoint rejects it outright. That is how
// enabling Turnstile locked every existing account out of signing in.
const MIN_PASSWORD_LENGTH = 6;

// Mount/unmount is animated with Reanimated's layout animations rather
// than an animated height.
//
// The height approach needed the field's own measurement, and a wrapper
// collapsed to zero before that measurement arrives never gets one — the
// child stops reporting a layout and the field never appears. That is the
// same trap the welcome panel's stage hit, and it caught this too.
// entering/exiting need no measurement at all.
const REVEAL_MS = 260;

// Where an unconfirmed address is sent, from either direction: straight
// after signing up, or after a sign-in that bounced because the address was
// never confirmed. A route rather than an inline panel state so it can be
// linked to, backed out of, and reasoned about as its own step.
const VERIFY_ROUTE = '/(auth)/verify-email';

// Asking for another confirmation code.
//
// Shared by the verify screen and anywhere else that needs another code.
// It has to send a captcha token because Supabase gates /resend exactly
// like every other auth endpoint.
function resendConfirmationEmail(email: string, captchaToken: string | null) {
  return supabase.auth.resend({
    type: 'signup',
    email,
    options: captchaToken ? { captchaToken } : undefined,
  });
}

export function SignInForm({ onForgotPassword }: { onForgotPassword?: () => void }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  // Set when a sign-in bounced because the address is unconfirmed. The code
  // is sent from here before navigating, so the verify screen opens with
  // one already on its way.
  //
  // This DOES cost a second challenge. Every gated Supabase endpoint wants
  // its own single-use token, so signing in and resending can never share
  // one — /auth/v1/resend is captcha-gated in GoTrue with no exemption,
  // service role included. The alternative was sending the mail ourselves
  // through Resend, which is a whole second delivery path; a second prompt
  // on the one path where an account is unconfirmed is the cheaper trade.
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);

    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    try {
      // Email sign-in is unchanged; a bare handle (no "@") routes through
      // resolve-username-signin instead — see src/lib/username-signin.ts.
      if (identifier.includes('@')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: identifier,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (signInError) throw signInError;
      } else {
        await signInWithUsername(identifier, password, captchaToken);
      }
      // On success, AuthProvider picks up the new session and the root
      // layout redirects.
    } catch (err) {
      setError(authErrorMessage(err, 'Could not sign in. Please try again.'));
      // An unconfirmed address is not a dead end, it is a different step —
      // so it moves to the verify screen rather than reporting a failure
      // and leaving the person on a form that cannot succeed.
      //
      // Only the email path can do this. resolve-username-signin answers
      // every failure with one generic message on purpose, so that a handle
      // never reveals whether an account exists — which means it cannot
      // tell us which address needs verifying either.
      // Not a navigation yet: the code goes out first, which needs a fresh
      // token from the widget below. handleCaptchaToken picks this up when
      // the reset issues one, sends, and only then moves on.
      //
      // Only the email path can do this. resolve-username-signin answers
      // every failure with one generic message on purpose, so that a handle
      // never reveals whether an account exists — which means it cannot
      // tell us which address needs verifying either.
      if (isEmailNotConfirmed(err) && identifier.includes('@')) {
        setPendingVerifyEmail(identifier.trim());
      }
      // Single-use, and already spent against the failed attempt.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  // A fresh token arriving is the go signal for a pending verification
  // send. The failed sign-in spent the previous one and bumped
  // captchaReset, so this is genuinely new rather than the spent one being
  // replayed — Turnstile tokens are single use.
  async function handleCaptchaToken(token: string | null) {
    setCaptchaToken(token);
    if (!token || !pendingVerifyEmail) return;

    const target = pendingVerifyEmail;
    setPendingVerifyEmail(null);
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);

    const { error: sendError } = await resendConfirmationEmail(target, token);
    if (sendError) {
      // Go to the verify screen regardless: a code from signup may still be
      // sitting in the inbox, and that screen can ask for another. Naming
      // the failure here beats swallowing it.
      setError(
        authErrorMessage(sendError, 'Could not send a new code. Try again from the next screen.'),
      );
    }
    router.push({ pathname: VERIFY_ROUTE, params: { email: target } });
  }

  return (
    <View style={styles.form}>
      <TextField
        placeholder="Email or username"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        textContentType="username"
      />
      <TextField
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {pendingVerifyEmail && (
        <ThemedText type="small" themeColor="sage">
          That address is not confirmed yet — one more check and a code is on its way.
        </ThemedText>
      )}
      <Turnstile onToken={handleCaptchaToken} action="signin" resetSignal={captchaReset} />
      <Button label="Sign in" onPress={handleSignIn} loading={isSubmitting} />
      {onForgotPassword && (
        <ThemedText type="link" style={styles.inlineLink} onPress={onForgotPassword}>
          Forgot password?
        </ThemedText>
      )}
      <SocialAuthButtons onError={setError} />
    </View>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // Bumped after a failed signup so the widget issues a fresh token — see
  // Turnstile's resetSignal.
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSignUp() {
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    // Checked here rather than only on the server: the whole point of a
    // confirmation field is catching a typo before it becomes an account
    // nobody can sign into.
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Only enforced when a site key is actually configured. Without one the
    // widget never renders, and demanding a token nobody can produce would
    // lock signup entirely.
    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      // Verified by Supabase against the Turnstile secret in the dashboard.
      // Undefined rather than null when unconfigured — the client rejects a
      // null here.
      options: captchaToken ? { captchaToken } : undefined,
    });
    setIsSubmitting(false);

    if (signUpError) {
      setError(authErrorMessage(signUpError, 'Could not create the account. Please try again.'));
      // A token is single-use: once Supabase has verified it, a retry with
      // the same one fails. Clearing the token is not enough on its own —
      // the widget has to be told to issue another, or the form can never
      // be resubmitted.
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      return;
    }
    // No session yet means email confirmation is required before sign-in
    // works. Otherwise AuthProvider picks up the new session and the root
    // layout redirects to onboarding.
    if (!data.session) {
      // No autoSend: signUp() has already sent a code, and sending a
      // second one here would invalidate the one already in flight.
      router.push({ pathname: VERIFY_ROUTE, params: { email: email.trim() } });
    }
  }

  return (
    // LinearTransition so the fields below slide down as the confirm field
    // appears, rather than teleporting by its height the frame it mounts.
    <Animated.View style={styles.form} layout={LinearTransition.duration(REVEAL_MS)}>
      <TextField
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="newPassword"
      />
      {/* Only once there is a password to confirm. Showing it up front
          makes the form look twice as long as it is before anyone has typed
          anything, and there is nothing to compare against yet. */}
      {password.length > 0 && (
        <Animated.View
          entering={FadeInDown.duration(REVEAL_MS)}
          exiting={FadeOutUp.duration(REVEAL_MS)}
        >
          <TextField
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            textContentType="newPassword"
          />
        </Animated.View>
      )}
      <Turnstile onToken={setCaptchaToken} action="signup" resetSignal={captchaReset} />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button label="Sign up" onPress={handleSignUp} loading={isSubmitting} />
      <SocialAuthButtons onError={setError} />
    </Animated.View>
  );
}

// How many digits Supabase's emailed token is. Stated so the field can cap
// itself and the button can stay disabled until there is a whole code to
// submit, rather than firing a doomed request on a partial one.
const CODE_LENGTH = 6;

// How long before another code can be asked for.
//
// A real limit rather than decoration: Supabase rate-limits outbound mail
// per hour, and every extra send both burns that budget and invalidates the
// code already in someone's inbox. Sixty seconds is long enough to stop
// impatient double-taps and short enough not to strand anyone.
const RESEND_COOLDOWN_SECONDS = 60;

// Confirming an address with the code from the email.
//
// A code rather than a tapped link because the link has to survive being
// opened in whatever browser the mail app hands it to, on a device that may
// not be the one that started the signup — and it lands the person in the
// web app rather than back where they were. A code they carry back by hand
// works from any inbox, on any device, and finishes in the app they are
// already standing in.
// Nothing on this screen sends anything on arrival, by design.
//
// Both routes in have already sent a code: signUp() sends one itself, and
// the sign-in path sends before it navigates here. That is what lets this
// screen carry NO captcha while it is being used for what it is for —
// typing six digits. The only action that needs a challenge is asking for
// another code, and that reveals one on demand rather than up front.
export function VerifyEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  // Whether a send has been asked for. Gates the captcha widget, which
  // stays absent until someone actually asks for another code.
  const [wantsResend, setWantsResend] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Ticks the cooldown down. The write happens in a timer callback rather
  // than during the effect body, so it is a scheduled update and not a
  // render-phase set.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  async function handleVerify() {
    setError(null);
    setIsSubmitting(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code,
      // 'signup' rather than the generic 'email': this is specifically the
      // token minted by a signup confirmation, and the types Supabase will
      // accept for it are narrower than the alias suggests.
      type: 'signup',
    });
    setIsSubmitting(false);

    if (verifyError) {
      setError(authErrorMessage(verifyError, 'That code did not work. Check it and try again.'));
      return;
    }
    // A verified signup comes back with a session, so AuthProvider picks it
    // up and the root layout moves on by itself — nothing to do here.
  }

  async function sendNewCode(token: string | null) {
    setError(null);
    setResent(false);
    setIsResending(true);
    const { error: resendError } = await resendConfirmationEmail(email, token);
    setIsResending(false);
    setWantsResend(false);
    // Spent either way.
    setCaptchaToken(null);
    setCaptchaReset((n) => n + 1);

    if (resendError) {
      setError(authErrorMessage(resendError, 'Could not send another code just now.'));
      return;
    }
    setResent(true);
    setSecondsLeft(RESEND_COOLDOWN_SECONDS);
    // The previous code stops working the moment a new one is issued, so
    // leaving it in the field would only invite a confusing failure.
    setCode('');
  }

  function handleResendPress() {
    if (secondsLeft > 0) return;
    // Nothing to solve when no widget can render — send straight away
    // rather than waiting on a token that will never arrive.
    if (!isTurnstileConfigured) {
      void sendNewCode(null);
      return;
    }
    setError(null);
    setResent(false);
    setWantsResend(true);
  }

  // A token arriving IS the go signal, so the send hangs off the widget's
  // own callback rather than an effect watching the token. Same result, but
  // it is an event handler reacting to an event instead of a render pass
  // reacting to a value that changed for a reason it has to infer.
  function handleCaptchaToken(token: string | null) {
    setCaptchaToken(token);
    if (token && wantsResend && !isResending) {
      void sendNewCode(token);
    }
  }

  return (
    <View style={styles.form}>
      <ThemedText type="default" themeColor="textSecondary">
        We sent a {CODE_LENGTH}-digit code to {email}. Enter it below to finish setting up your
        account.
      </ThemedText>
      {/* autoFocus so the keypad is already up on arrival — this screen
          exists for exactly one action and there is nothing else to do on
          it. */}
      <CodeInput value={code} onChangeText={setCode} length={CODE_LENGTH} autoFocus />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {resent && (
        <ThemedText type="small" themeColor="sage">
          Sent again. It can take a minute to arrive.
        </ThemedText>
      )}
      <Button
        label="Verify"
        onPress={handleVerify}
        loading={isSubmitting}
        disabled={code.length < CODE_LENGTH}
      />
      {/* The captcha is NOT part of entering the code — verifyOtp takes no
          token, and putting a challenge in front of someone typing six
          digits they were just sent is friction for nothing.
          /auth/v1/resend IS gated though (verified: it answers
          "captcha_failed ... no captcha_token found"), so the widget
          appears only once a new code is actually asked for. */}
      {wantsResend && (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            One quick check, then a new code is on its way.
          </ThemedText>
          <Turnstile onToken={handleCaptchaToken} action="resend" resetSignal={captchaReset} />
        </>
      )}
      <Button
        label={secondsLeft > 0 ? `Send a new code (${secondsLeft}s)` : 'Send a new code'}
        variant="secondary"
        onPress={handleResendPress}
        loading={isResending}
        disabled={secondsLeft > 0 || (wantsResend && !captchaToken)}
      />
    </View>
  );
}

// Asking for a reset link. The screen at (auth)/forgot-password.tsx does the
// same thing standalone; this is the version the welcome panel reveals.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);

  async function handleSubmit() {
    setError(null);

    if (isTurnstileConfigured && !captchaToken) {
      setError('Please complete the security check.');
      return;
    }

    setIsSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('/reset-password'),
      captchaToken: captchaToken ?? undefined,
    });
    setIsSubmitting(false);

    if (resetError) {
      setError(authErrorMessage(resetError, 'Could not send the reset link. Please try again.'));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <View style={styles.form}>
        {/* Deliberately generic regardless of whether the email exists —
            confirming it would tell anyone who asks which addresses have
            accounts. */}
        <ThemedText type="default" themeColor="textSecondary">
          If an account exists for {email}, we sent a link to reset the password.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <ThemedText type="default" themeColor="textSecondary">
        Enter your email and we will send a link to set a new password.
      </ThemedText>
      <TextField
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Turnstile onToken={setCaptchaToken} action="reset" resetSignal={captchaReset} />
      <Button
        label="Send reset link"
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={!email.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.three,
  },
  inlineLink: {
    alignSelf: 'center',
  },
});
