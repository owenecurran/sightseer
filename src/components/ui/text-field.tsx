import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// A multiline TextInput never auto-grows on its own — with no explicit
// height it falls back to a tiny fixed default (confirmed on web: a plain
// ~2-row <textarea>, `overflow-y: auto`), leaving the *box itself*
// scrollable to see the rest of what you typed rather than the box growing
// to show it. That inner scroll surface then has to arbitrate against the
// page's own outer ScrollView for the same touch — the same nested-scroll
// conflict this app already hit with RNGH gestures inside a Modal — and on
// native that arbitration silently loses, reading as "can't scroll the edit
// box at all." Growing the input to fit its content removes the competing
// scroll surface entirely: there's nothing left to scroll *inside*, so the
// outer page scroll (already known to work) is the only one that ever has
// to handle it.
const MIN_MULTILINE_HEIGHT = 96;

export function TextField({ style, multiline, onContentSizeChange, secureTextEntry, ...rest }: TextInputProps) {
  const theme = useTheme();
  const [contentHeight, setContentHeight] = useState(MIN_MULTILINE_HEIGHT);
  // Only meaningful when a caller actually requests secureTextEntry — this
  // flips the *effective* value passed to the real TextInput below, not the
  // prop itself, so every password field in the app (sign-in, sign-up,
  // reset-password, settings) gets a reveal toggle for free without each
  // call site managing its own show/hide state.
  const [isRevealed, setIsRevealed] = useState(false);

  function handleContentSizeChange(event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) {
    setContentHeight(Math.max(MIN_MULTILINE_HEIGHT, event.nativeEvent.contentSize.height));
    onContentSizeChange?.(event);
  }

  const input = (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement },
        multiline ? { height: contentHeight } : null,
        secureTextEntry ? styles.inputWithToggle : null,
        style,
      ]}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      onContentSizeChange={multiline ? handleContentSizeChange : onContentSizeChange}
      secureTextEntry={secureTextEntry && !isRevealed}
      {...rest}
    />
  );

  if (!secureTextEntry) return input;

  return (
    <View style={styles.wrap}>
      {input}
      <Pressable onPress={() => setIsRevealed((prev) => !prev)} hitSlop={8} style={styles.toggle}>
        <Ionicons name={isRevealed ? 'eye-off-outline' : 'eye-outline'} size={20} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
  wrap: {
    justifyContent: 'center',
  },
  // Room for the toggle so typed text never renders underneath it.
  inputWithToggle: {
    paddingRight: Spacing.three + 28,
  },
  toggle: {
    position: 'absolute',
    right: Spacing.three,
  },
});
