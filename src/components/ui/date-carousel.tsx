import { useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const ITEM_WIDTH = 56;
const CAROUSEL_HEIGHT = 64;
const RANGE_YEARS = 3;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function clamp(n: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(n, min), max);
}

type DateCarouselProps = {
  value: string; // ISO date, YYYY-MM-DD
  onChange: (value: string) => void;
};

export function DateCarousel({ value, onChange }: DateCarouselProps) {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const startDate = useMemo(() => {
    const d = new Date(today);
    d.setFullYear(d.getFullYear() - RANGE_YEARS);
    return d;
  }, [today]);

  const dates = useMemo(() => {
    const count = daysBetween(startDate, today) + 1;
    return Array.from({ length: count }, (_, i) => addDays(startDate, i));
  }, [startDate, today]);

  const maxIndex = dates.length - 1;

  function indexForValue(iso: string): number {
    return clamp(daysBetween(startDate, parseIsoDate(iso)), 0, maxIndex);
  }

  const translateX = useSharedValue(0);
  const sidePadding = Math.max((containerWidth - ITEM_WIDTH) / 2, 0);

  // Sync from outside (form reset on new place, or initial mount) rather
  // than from this carousel's own drag settling.
  useEffect(() => {
    if (containerWidth === 0) return;
    translateX.value = withTiming(-(indexForValue(value) * ITEM_WIDTH), { duration: 150 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, containerWidth]);

  function handleLayout(event: LayoutChangeEvent) {
    setContainerWidth(event.nativeEvent.layout.width);
  }

  function commitIndex(index: number) {
    onChange(formatIsoDate(dates[index]));
  }

  const pan = Gesture.Pan()
    .onChange((event) => {
      translateX.value = clamp(translateX.value + event.changeX, -(maxIndex * ITEM_WIDTH), 0);
    })
    .onFinalize(() => {
      const nearestIndex = clamp(Math.round(-translateX.value / ITEM_WIDTH), 0, maxIndex);
      translateX.value = withTiming(-(nearestIndex * ITEM_WIDTH), { duration: 200 });
      runOnJS(commitIndex)(nearestIndex);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const selectedDate = parseIsoDate(value);
  const headerLabel = `${WEEKDAY_LABELS[selectedDate.getDay()]}, ${MONTH_LABELS[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{headerLabel}</ThemedText>

      <GestureDetector gesture={pan}>
        <View style={styles.track} onLayout={handleLayout}>
          {containerWidth > 0 && (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.centerIndicator,
                  {
                    left: sidePadding,
                    width: ITEM_WIDTH,
                    backgroundColor: theme.backgroundSelected,
                  },
                ]}
              />
              <Animated.View
                style={[styles.row, rowStyle, { paddingHorizontal: sidePadding }]}>
                {dates.map((date, index) => {
                  const isFirstOfMonth = date.getDate() === 1;
                  return (
                    <View key={index} style={styles.item}>
                      <ThemedText type="small" themeColor="textSecondary">
                        {isFirstOfMonth ? MONTH_LABELS[date.getMonth()] : WEEKDAY_LABELS[date.getDay()]}
                      </ThemedText>
                      <ThemedText type="default">{date.getDate()}</ThemedText>
                    </View>
                  );
                })}
              </Animated.View>
            </>
          )}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  track: {
    width: '100%',
    height: CAROUSEL_HEIGHT,
    overflow: 'hidden',
  },
  centerIndicator: {
    position: 'absolute',
    top: 0,
    height: CAROUSEL_HEIGHT,
    borderRadius: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    height: CAROUSEL_HEIGHT,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.half,
  },
});
