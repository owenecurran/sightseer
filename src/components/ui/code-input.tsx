import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// A one-time code as separate cells.
//
// ONE input, not one per digit. Six real TextInputs is the obvious build and
// the wrong one: it needs a ref array, focus juggling on every keystroke,
// and special cases for backspace-on-empty and for paste — and it breaks
// the OS one-time-code autofill, which fills a single field with the whole
// code and has nowhere to put six characters. A single invisible input laid
// over the cells keeps typing, deleting, pasting and autofill behaving
// exactly as the platform intends, and the cells become what they actually
// are: a drawing of the value.
//
// The input is transparent rather than hidden. Zero-sized or display:none
// inputs cannot reliably take focus on Android, and an off-screen one drags
// the scroll position around when it does. Full-size and invisible, it also
// means a tap anywhere along the row lands on the input itself, so nothing
// has to forward the touch.

const DEFAULT_LENGTH = 6;

type CodeInputProps = {
  value: string;
  onChangeText: (next: string) => void;
  length?: number;
  autoFocus?: boolean;
  editable?: boolean;
};

export function CodeInput({
  value,
  onChangeText,
  length = DEFAULT_LENGTH,
  autoFocus,
  editable = true,
}: CodeInputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Which cell the next digit lands in. Clamped so a full code keeps the
  // highlight on the last cell rather than on a seventh that isn't there.
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()}>
      <View style={styles.row}>
        {Array.from({ length }).map((_, index) => {
          const isActive = isFocused && index === activeIndex;
          return (
            <View
              key={index}
              style={[
                styles.cell,
                { backgroundColor: theme.backgroundElement },
                isActive && { borderColor: theme.sage },
              ]}
            >
              <ThemedText type="subtitle">{value[index] ?? ''}</ThemedText>
            </View>
          );
        })}

        <TextInput
          ref={inputRef}
          value={value}
          // Digits only, and capped here rather than trusting maxLength
          // alone: autofill and paste can both deliver more than was asked
          // for, and a code with a stray space is the inbox's formatting
          // rather than a mistake worth rejecting.
          onChangeText={(next) => onChangeText(next.replace(/[^0-9]/g, '').slice(0, length))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoFocus={autoFocus}
          editable={editable}
          maxLength={length}
          // number-pad, not numeric: numeric carries a decimal point and a
          // minus sign, neither of which belongs in a PIN. On iOS this is
          // the keypad with no return key, which is right — there is a
          // button for submitting.
          keyboardType="number-pad"
          // The pair that makes the OS offer the code from the notification
          // rather than making anyone read it and type it back.
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          // Invisible, but present and full size — see the note above.
          style={styles.input}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    // The input below is absolutely positioned against this row, so it
    // needs to be the positioning context.
    position: 'relative',
  },
  cell: {
    flex: 1,
    aspectRatio: 0.82,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.three,
    // Same outline as TextField, for the same reason: on a card the fill
    // matches the card and the cell would otherwise not read as a field.
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.18)',
  },
  input: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Android measures the touch target from the text box itself, so it has
    // to fill the row rather than sit at its natural single-line height —
    // otherwise the top of each cell is tappable and the rest is not.
    bottom: 0,
    opacity: 0,
    color: 'transparent',
  },
});
