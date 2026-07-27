import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 3;
const VIEWPORT_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const TOP_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
const YEARS_BACK = 10;
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

type WheelPickerProps = {
  itemCount: number;
  selectedIndex: number;
  renderLabel: (index: number) => string;
  onChange: (index: number) => void;
};

// One independently-draggable vertical wheel — same absolute-position
// Pan/snap mechanics originally built for the horizontal day carousel, just
// on the Y axis, generalized to any fixed-length list of labels.
function WheelPicker({ itemCount, selectedIndex, renderLabel, onChange }: WheelPickerProps) {
  const theme = useTheme();
  const translateY = useSharedValue(0);
  const maxIndex = itemCount - 1;

  // Sync from outside (external value change, or another wheel's change
  // clamping this one — e.g. picking Feb clamps a day-31 selection down)
  // rather than from this wheel's own drag settling.
  useEffect(() => {
    translateY.value = withTiming(-(clamp(selectedIndex, 0, maxIndex) * ITEM_HEIGHT), { duration: 150 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, maxIndex]);

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateY.value = clamp(translateY.value + event.changeY, -(maxIndex * ITEM_HEIGHT), 0);
    })
    .onFinalize(() => {
      const nearestIndex = clamp(Math.round(-translateY.value / ITEM_HEIGHT), 0, maxIndex);
      translateY.value = withTiming(-(nearestIndex * ITEM_HEIGHT), { duration: 200 });
      runOnJS(onChange)(nearestIndex);
    });

  const columnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.track}>
        <View
          pointerEvents="none"
          style={[styles.centerIndicator, { top: TOP_PADDING, backgroundColor: theme.backgroundSelected }]}
        />
        <Animated.View style={[styles.column, columnStyle, { paddingVertical: TOP_PADDING }]}>
          {Array.from({ length: itemCount }, (_, index) => (
            <View key={index} style={styles.item}>
              <ThemedText type="default">{renderLabel(index)}</ThemedText>
            </View>
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

type DateCarouselProps = {
  value: string; // ISO date, YYYY-MM-DD
  onChange: (value: string) => void;
};

export function DateCarousel({ value, onChange }: DateCarouselProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const parsed = useMemo(() => parseIsoDate(value), [value]);
  const [year, setYear] = useState(parsed.getFullYear());
  const [month, setMonth] = useState(parsed.getMonth());
  const [day, setDay] = useState(parsed.getDate());

  const currentYear = today.getFullYear();
  const years = useMemo(
    () => Array.from({ length: YEARS_BACK + 1 }, (_, i) => currentYear - YEARS_BACK + i),
    [currentYear]
  );

  // No future dates — you review places you've already been. Each wheel's
  // available range depends on the others: picking the current year caps
  // the month wheel at the current month, and picking the current
  // year+month caps the day wheel at today.
  function commit(nextYear: number, nextMonth: number, nextDay: number) {
    const yearIsCurrent = nextYear === currentYear;
    const clampedMonth = yearIsCurrent ? Math.min(nextMonth, today.getMonth()) : nextMonth;
    const monthIsCurrent = yearIsCurrent && clampedMonth === today.getMonth();
    const dayLimit = monthIsCurrent ? today.getDate() : daysInMonth(nextYear, clampedMonth);
    const clampedDay = Math.min(nextDay, dayLimit);

    setYear(nextYear);
    setMonth(clampedMonth);
    setDay(clampedDay);
    onChange(formatIsoDate(new Date(nextYear, clampedMonth, clampedDay)));
  }

  // Re-sync from outside (e.g. form reset on a new place) rather than from
  // this component's own wheel changes, which already call onChange
  // directly. Routed through the same clamping as a wheel drag — not a
  // plain setState — so the header/wheels can never show an out-of-range
  // date (e.g. an incoming value that's technically in the future), and the
  // parent's value gets corrected via onChange if it needed adjusting.
  useEffect(() => {
    commit(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed]);

  const monthCount = year === currentYear ? today.getMonth() + 1 : 12;
  const dayCount =
    year === currentYear && month === today.getMonth() ? today.getDate() : daysInMonth(year, month);

  const headerLabel = `${MONTH_LABELS[month]} ${day}, ${year}`;

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{headerLabel}</ThemedText>

      <View style={styles.wheelsRow}>
        <View style={styles.wheelWrap}>
          <WheelPicker
            itemCount={monthCount}
            selectedIndex={month}
            renderLabel={(i) => MONTH_LABELS[i]}
            onChange={(i) => commit(year, i, day)}
          />
        </View>
        <View style={styles.wheelWrap}>
          <WheelPicker
            itemCount={dayCount}
            selectedIndex={day - 1}
            renderLabel={(i) => String(i + 1)}
            onChange={(i) => commit(year, month, i + 1)}
          />
        </View>
        <View style={styles.wheelWrap}>
          <WheelPicker
            itemCount={years.length}
            selectedIndex={years.indexOf(year)}
            renderLabel={(i) => String(years[i])}
            onChange={(i) => commit(years[i], month, day)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  wheelsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  wheelWrap: {
    flex: 1,
  },
  track: {
    width: '100%',
    height: VIEWPORT_HEIGHT,
    overflow: 'hidden',
  },
  centerIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: Spacing.two,
  },
  column: {
    flexDirection: 'column',
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
