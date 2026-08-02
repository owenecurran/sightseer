import { useState } from 'react';
import { Platform } from 'react-native';

import { Button } from '@/components/ui/button';
import { signInWithApple } from '@/lib/social-auth';

type AppleSignInButtonProps = {
  onError: (message: string) => void;
};

export function AppleSignInButton({ onError }: AppleSignInButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (Platform.OS !== 'ios') return null;

  async function handlePress() {
    setIsSubmitting(true);
    try {
      await signInWithApple();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not sign in with Apple.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button label="Continue with Apple" variant="secondary" onPress={handlePress} loading={isSubmitting} />
  );
}
