import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
};

export function Button({ label, variant = 'primary', loading, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';

  return (
    <Pressable disabled={disabled || loading} {...rest} style={style}>
      {({ pressed }) => (
        <ThemedView
          type={isPrimary ? 'text' : 'backgroundElement'}
          style={[
            styles.button,
            !isPrimary && styles.secondary,
            pressed && styles.pressed,
            (disabled || loading) && styles.disabled,
          ]}>
          {loading ? (
            <ActivityIndicator color={isPrimary ? theme.background : theme.text} />
          ) : (
            <ThemedText type="roundedStat" style={styles.label} themeColor={isPrimary ? 'background' : 'text'}>
              {label}
            </ThemedText>
          )}
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A secondary button fills with backgroundElement, which is also the
  // colour of the cards it now sits inside on Settings — so on a card it
  // was invisible and "Sign out" read as a heading rather than a control.
  // Only the secondary variant needs this; the primary one is a solid cream
  // fill that reads as a button anywhere.
  secondary: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.18)',
  },
  // roundedStat (HelveticaRoundedBold) reads noticeably larger than
  // smallBold's plain-sans 14px at the same nominal size — bumped up a
  // couple px so it doesn't look undersized next to the button's own
  // (now wider, see `button.paddingHorizontal`) padding.
  label: {
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.5,
  },
});
