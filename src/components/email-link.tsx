import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { authErrorMessage } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

// Attach an email address to an account that has none.
//
// WHY AN ACCOUNT MIGHT HAVE NONE
//
// Signing up with a phone number produces exactly that: a verified number
// and no address. Everything that reaches a person through their inbox then
// has nowhere to go — password recovery most of all, but also every future
// "someone did something" mail. Worse, the recovery route for a phone-only
// account is the phone itself, so losing the number loses the account.
//
// So this is not a nicety, it is the second key. It mirrors PhoneVerify's
// shape deliberately: address, then the code that proves it.
//
// `email_change` rather than `email`, because from GoTrue's point of view
// that is what this is — an account changing from no address to one. Asking
// it to confirm with type 'email' rejects the token, which on screen reads
// as a mistyped code.

const CODE_LENGTH = 6;

type EmailLinkProps = {
  onLinked: () => void;
  caption?: string;
};

export function EmailLink({ onLinked, caption }: EmailLinkProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'address' | 'code'>('address');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!email.trim() || isBusy) return;
    setIsBusy(true);
    setError(null);
    // Authenticated, so no captcha — the same reasoning as startPhoneLink.
    const { error: sendError } = await supabase.auth.updateUser({ email: email.trim() });
    setIsBusy(false);
    if (sendError) {
      setError(authErrorMessage(sendError, 'Could not send that code.'));
      return;
    }
    setStage('code');
  }

  async function confirm() {
    if (code.trim().length < CODE_LENGTH || isBusy) return;
    setIsBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email_change',
    });
    setIsBusy(false);
    if (verifyError) {
      setError(authErrorMessage(verifyError, 'That code did not work.'));
      setCode('');
      return;
    }
    onLinked();
  }

  if (stage === 'address') {
    return (
      <View style={styles.wrap}>
        {caption && (
          <ThemedText type="small" themeColor="textSecondary">
            {caption}
          </ThemedText>
        )}
        <TextField
          placeholder="Email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {error && (
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
        )}
        <Button label="Send code" onPress={() => void send()} loading={isBusy} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ThemedText type="small" themeColor="textSecondary">
        Enter the {CODE_LENGTH}-digit code sent to {email}.
      </ThemedText>
      <CodeInput value={code} onChangeText={setCode} length={CODE_LENGTH} autoFocus />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      <Button
        label="Confirm"
        onPress={() => void confirm()}
        loading={isBusy}
        disabled={code.trim().length < CODE_LENGTH}
      />
      <Pressable
        onPress={() => {
          setStage('address');
          setCode('');
          setError(null);
        }}
        hitSlop={8}
      >
        <ThemedText type="small" themeColor="textSecondary">
          Use a different address
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.three,
  },
});
