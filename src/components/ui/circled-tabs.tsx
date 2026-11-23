import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { BrandColors, BrandFonts, Spacing } from '@/constants/theme';
import { svgDataUri } from '@/lib/base64';
import { randomFor } from '@/lib/seeded-random';

type CircledTabsProps<K extends string> = {
  items: readonly { key: K; label: string }[];
  // The one picked, or null when nothing is (Search's filters can all be
  // off). A list where several can be on at once, each ringed: the map's
  // layers. onChange then reports the word pressed, to turn it on or off.
  active: K | null | readonly K[];
  onChange: (key: K) => void;
  // What the words are, for screen readers: tabs that switch a view (the
  // default), or a choice on a form ("circle one"). A list of several is
  // always read as checkboxes.
  role?: 'tab' | 'radio';
};

// A row of choices typed across the page, with the one picked ringed in pen,
// the way you would circle a word on a printed list. These replace rows of
// pill chips, which are what every app's tabs and filters are made of.
export function CircledTabs<K extends string>({ items, active, onChange, role = 'tab' }: CircledTabsProps<K>) {
  const isMany = Array.isArray(active);
  return (
    // Wider apart when several can be ringed at once: each ring reaches
    // REACH_X past its word, so at the usual spacing two rings side by side
    // ran into each other.
    <View style={[styles.row, isMany && styles.rowMany]}>
      {items.map((item) => (
        <Tab
          key={item.key}
          label={item.label}
          seed={item.key}
          selected={isMany ? (active as readonly K[]).includes(item.key) : item.key === active}
          role={isMany ? 'checkbox' : role}
          onPress={() => onChange(item.key)}
        />
      ))}
    </View>
  );
}

// How far the ring reaches past the word it goes round.
const REACH_X = 10;
const REACH_Y = 7;

type TabProps = {
  label: string;
  seed: string;
  selected: boolean;
  role: 'tab' | 'radio' | 'checkbox';
  onPress: () => void;
};

function Tab({ label, seed, selected, role, onPress }: TabProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    const h = Math.round(event.nativeEvent.layout.height);
    if (!size || size.w !== w || size.h !== h) setSize({ w, h });
  };
  const ring = useMemo(() => (size ? penRing(`ring-${seed}`, size.w, size.h, REACH_X, REACH_Y) : null), [size, seed]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole={role}
      accessibilityState={role === 'tab' ? { selected } : { checked: selected }}
      onLayout={onLayout}
      style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
      {selected && ring && <Image source={{ uri: ring }} style={styles.ring} />}
      <Text style={[styles.label, !selected && styles.labelIdle]}>{label}</Text>
    </Pressable>
  );
}

// One quick loop of the pen round something w by h: a little more than once
// round, never quite an ellipse, with the end overshooting the start. The
// image is (w + 2 reachX) by (h + 2 reachY), to be laid that far out past
// what it rings. Also rings the chosen postcard on Add a review.
export function penRing(seed: string, w: number, h: number, reachX: number, reachY: number, colour: string = BrandColors.sage): string {
  return svgDataUri(ringSvg(randomFor(seed), w, h, reachX, reachY, colour));
}

function ringSvg(random: () => number, w: number, h: number, reachX: number, reachY: number, colour: string): string {
  const W = w + reachX * 2;
  const H = h + reachY * 2;
  const cx = W / 2 + (random() - 0.5) * 2;
  const cy = H / 2 + (random() - 0.5) * 1.5;
  const rx = W / 2 - 2;
  const ry = H / 2 - 2;
  const start = -Math.PI * (0.55 + random() * 0.3);
  const turns = 1.08 + random() * 0.1;
  const wobble = random() * Math.PI * 2;
  // The loop drifts outward as it goes round, so the overshoot passes
  // outside where it began rather than over it.
  const drift = 0.05 + random() * 0.05;
  const tilt = (random() - 0.5) * 0.08;
  const steps = 56;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = i / steps;
    const t = start + p * turns * Math.PI * 2;
    const k = 1 - drift + drift * 2 * p + 0.025 * Math.sin(3 * t + wobble);
    const x = cx + rx * k * Math.cos(t);
    const y = cy + ry * k * Math.sin(t) + (x - cx) * tilt;
    points.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<path d="M${points.join(' L')}" fill="none" stroke="${colour}" stroke-opacity="0.9" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 14,
    rowGap: Spacing.two,
    paddingVertical: REACH_Y - 2,
    paddingLeft: Spacing.one,
  },
  rowMany: {
    columnGap: REACH_X * 2 + 4,
    rowGap: REACH_Y * 2 + 2,
    paddingLeft: REACH_X - 2,
  },
  tab: {
    paddingVertical: 2,
  },
  ring: {
    position: 'absolute',
    top: -REACH_Y,
    left: -REACH_X,
    right: -REACH_X,
    bottom: -REACH_Y,
  },
  label: {
    fontFamily: BrandFonts.typewriter,
    fontSize: 15,
    color: BrandColors.cream,
    includeFontPadding: false,
  },
  labelIdle: {
    color: 'rgba(234, 231, 207, 0.5)',
  },
  pressed: {
    opacity: 0.6,
  },
});
