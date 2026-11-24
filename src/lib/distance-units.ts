import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from '@/lib/auth-context';
import { listHomeLocations } from '@/lib/home-locations';
import { resolveStateCountries } from '@/lib/places-cache';

// Kilometres or miles, for every distance the app shows.
//
// Until someone picks one in Settings it follows where they live: miles if
// their first home location is in a country that measures roads in miles,
// kilometres anywhere else. The pick is kept on the device, not the
// account: it is a reading preference, like a font size.
export type DistanceUnit = 'km' | 'mi';

const STORAGE_KEY = 'distance-unit-v1';
const KM_PER_MILE = 1.609344;
// Where road distances are given in miles.
const MILES_COUNTRIES = new Set(['United States', 'United Kingdom', 'Liberia', 'Myanmar', 'Myanmar (Burma)']);

let picked: DistanceUnit | null = null;
let regional: DistanceUnit = 'km';
let hasLoaded = false;
let regionalFor: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function current(): DistanceUnit {
  return picked ?? regional;
}

async function loadPicked() {
  if (hasLoaded) return;
  hasLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'km' || raw === 'mi') {
      picked = raw;
      emit();
    }
  } catch {
    // Unreadable storage: the regional default stands.
  }
}

async function loadRegional(userId: string) {
  if (regionalFor === userId) return;
  regionalFor = userId;
  try {
    const homes = await listHomeLocations(userId);
    if (homes.length === 0) return;
    const first = homes[0];
    const regions = await resolveStateCountries([first.placeId]);
    // "Washington, United States", or the country alone; a home location
    // that is itself a country is its own name.
    const country = regions.get(first.placeId)?.split(', ').pop() ?? first.name;
    regional = MILES_COUNTRIES.has(country) ? 'mi' : 'km';
    emit();
  } catch {
    // Tried again next time something asks.
    regionalFor = null;
  }
}

// The unit to show distances in, kept current as it changes.
export function useDistanceUnit(): DistanceUnit {
  const { session } = useAuth();
  const userId = session?.user.id;
  useEffect(() => {
    void loadPicked();
    if (userId) void loadRegional(userId);
  }, [userId]);
  return useSyncExternalStore(subscribe, current, current);
}

export function setDistanceUnit(unit: DistanceUnit) {
  picked = unit;
  emit();
  AsyncStorage.setItem(STORAGE_KEY, unit).catch(() => {});
}

// "2,783 km", "1,729 mi", "4.2 km", "650 m".
export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = unit === 'mi' ? km / KM_PER_MILE : km;
  if (unit === 'km' && value < 1) return `${Math.max(10, Math.round(value * 100) * 10)} m`;
  if (value < 10) return `${value.toFixed(1)} ${unit}`;
  return `${Math.round(value).toLocaleString('en-US')} ${unit}`;
}
