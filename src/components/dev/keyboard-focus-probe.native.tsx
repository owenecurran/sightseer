import { useCallback, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View, type TextInput } from 'react-native';
import {
  useKeyboardHandler,
  useReanimatedFocusedInput,
  type FocusedInputLayoutChangedEvent,
} from 'react-native-keyboard-controller';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

// A measurement, not a fix.
//
// The comment composer does not lift above the keyboard on iOS, and three
// separate explanations all sounded right. This exists so the next thing we
// say about it is something we read off a screen rather than something we
// reasoned our way to.
//
// WHAT IT COMPARES. Two numbers that should be identical and probably are
// not:
//
//   lib  — where react-native-keyboard-controller believes the focused
//          field is, taken from useReanimatedFocusedInput. This is what it
//          decides to scroll by.
//   real — where the field actually is on the glass, from measureInWindow.
//
// The composer lives inside PostcardFlip's `back` face, which is absolutely
// positioned and carries perspective + rotateY. A 3D transform is exactly
// the kind of thing that makes a native measurement disagree with what the
// eye sees, so if lib.y is far above real.y then the library thinks the
// field is already clear of the keyboard and correctly does nothing — which
// would look precisely like the bug.
//
// scrollTag is the other half of the question, and worth as much as the
// coordinates. The library can only scroll a field it can trace to a parent
// ScrollView. If that comes back 0 or -1, there is nothing for it to move
// and no amount of bottomOffset will ever help.
//
// ON SCREEN rather than only in a console, because the device that shows
// the bug is an iPhone that may not be attached to Metro. One screenshot
// carries the whole answer. It still logs as well, for when it is attached.
//
// __DEV__ only, and rendered from one call site. It is scaffolding; when the
// answer is in, it comes out.

type Reading = {
  libY: number;
  libHeight: number;
  libAbsX: number;
  scrollTag: number;
  target: number;
};

const SCREEN = Dimensions.get('window');

export function KeyboardFocusProbe({
  label,
  inputRef,
}: {
  label: string;
  inputRef: { current: TextInput | null };
}) {
  const [lib, setLib] = useState<Reading | null>(null);
  const [real, setReal] = useState<{ x: number; y: number; h: number } | null>(null);
  const [kb, setKb] = useState(0);
  // Measured once per keyboard settle rather than on every frame — the
  // question is where things ended up, not how they got there.
  const pending = useRef(false);

  const measureReal = useCallback(() => {
    const node = inputRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((x, y, _w, h) => {
      setReal({ x, y, h });
      pending.current = false;
    });
  }, [inputRef]);

  const takeLib = useCallback(
    (event: FocusedInputLayoutChangedEvent) => {
      setLib({
        libY: event.layout.absoluteY,
        libHeight: event.layout.height,
        libAbsX: event.layout.absoluteX,
        scrollTag: event.parentScrollViewTarget,
        target: event.target,
      });
      if (!pending.current) {
        pending.current = true;
        // One tick later: measureInWindow during the same commit reports the
        // position before the scroll view has moved, which is the number we
        // are trying NOT to compare against.
        setTimeout(measureReal, 350);
      }
    },
    [measureReal],
  );

  const { input } = useReanimatedFocusedInput();

  useAnimatedReaction(
    () => input.value,
    (current, previous) => {
      if (!current) return;
      if (previous && current.target === previous.target && current.layout.absoluteY === previous.layout.absoluteY) {
        return;
      }
      runOnJS(takeLib)(current);
    },
    [takeLib],
  );

  useKeyboardHandler(
    {
      onEnd: (event) => {
        'worklet';
        runOnJS(setKb)(event.height);
        runOnJS(measureReal)();
      },
    },
    [measureReal],
  );

  if (!__DEV__) return null;

  const visibleBottom = SCREEN.height - kb;
  const libBottom = lib ? lib.libY + lib.libHeight : null;
  const realBottom = real ? real.y + real.h : null;
  const drift = lib && real ? real.y - lib.libY : null;

  // The verdict, spelled out so a screenshot does not need interpreting.
  //
  // It turns on the DISAGREEMENT, not on either number alone. "lib thinks it
  // is clear" is only interesting when the field is actually covered: that
  // is the library deciding correctly from a wrong measurement, and it puts
  // the fix at the measurement rather than at bottomOffset. If both agree
  // the field is clear, nothing is wrong and nothing should move — which is
  // exactly what Android reports, and why Android was never the bug.
  const libCovered = libBottom != null && libBottom > visibleBottom;
  const realCovered = realBottom != null && realBottom > visibleBottom;

  let verdict = 'waiting for focus…';
  if (lib && real) {
    if (lib.scrollTag <= 0) {
      verdict = 'NO PARENT SCROLLVIEW — nothing for it to scroll';
    } else if (realCovered && !libCovered) {
      verdict = 'MISMATCH — really covered, lib believes it is clear';
    } else if (realCovered && libCovered) {
      verdict = 'both agree it is covered — it should be scrolling and is not';
    } else {
      verdict = 'field is clear of the keyboard — nothing to do';
    }
  }

  const line = [
    `[probe:${label}]`,
    lib ? `lib y=${lib.libY.toFixed(0)} h=${lib.libHeight.toFixed(0)} bottom=${libBottom?.toFixed(0)}` : 'lib —',
    real ? `real y=${real.y.toFixed(0)} h=${real.h.toFixed(0)} bottom=${realBottom?.toFixed(0)}` : 'real —',
    drift != null ? `drift=${drift.toFixed(0)}` : '',
    `kb=${kb.toFixed(0)} screen=${SCREEN.height.toFixed(0)} visibleBottom=${visibleBottom.toFixed(0)}`,
    `scrollTag=${lib?.scrollTag ?? '—'}`,
    verdict,
  ]
    .filter(Boolean)
    .join('  |  ');

  if (lib && real) console.log(line);

  return (
    <View style={styles.box} pointerEvents="none">
      <Text style={styles.text} selectable={false}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderColor: '#ff5c5c',
    borderWidth: 1,
    borderRadius: 6,
    padding: 6,
    marginBottom: 6,
  },
  text: {
    color: '#ffd36b',
    fontSize: 9,
    lineHeight: 12,
  },
});
