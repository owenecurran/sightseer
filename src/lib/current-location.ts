import * as Location from 'expo-location';

export type Coordinate = { lat: number; lng: number };

// Best-effort: any failure (permission denied, location services off,
// timeout) just means the caller falls back to its own default view rather
// than blocking or crashing the location picker over a nice-to-have.
// expo-location has a real web implementation (backed by the browser's
// Geolocation API), so this one function works unmodified on every platform
// this app ships to — no native/web split needed here.
export async function getCurrentLocation(): Promise<Coordinate | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({});
    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    return null;
  }
}
