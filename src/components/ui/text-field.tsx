import { useState } from 'react';
import { StyleSheet, TextInput, type NativeSyntheticEvent, type TextInputContentSizeChangeEventData, type TextInputProps } from 'react-native';

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

export function TextField({ style, multiline, onContentSizeChange, ...rest }: TextInputProps) {
  const theme = useTheme();
  const [contentHeight, setContentHeight] = useState(MIN_MULTILINE_HEIGHT);

  function handleContentSizeChange(event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) {
    setContentHeight(Math.max(MIN_MULTILINE_HEIGHT, event.nativeEvent.contentSize.height));
    onContentSizeChange?.(event);
  }

  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement },
        multiline ? { height: contentHeight } : null,
        style,
      ]}
      autoCapitalize="none"
      autoCorrect={false}
      multiline={multiline}
      onContentSizeChange={multiline ? handleContentSizeChange : onContentSizeChange}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
});
