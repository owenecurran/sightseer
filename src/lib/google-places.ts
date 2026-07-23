import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

// Groups an Autocomplete typing sequence + its closing Place Details call into
// one billed session instead of paying per autocomplete request. Call once
// when a search starts, reuse for every keystroke, pass the same value to
// fetchPlaceDetails when the user picks a result, then discard it.
export function createPlacesSessionToken(): string {
  return Crypto.randomUUID();
}

const IOS_BUNDLE_ID = 'com.owenecurran.alienapp';
const ANDROID_PACKAGE = 'com.owenecurran.alienapp';
// X-Android-Cert must be the SHA-1 as a bare hex string, no colons.
const ANDROID_CERT_SHA1 = '1A5FD9B6727EE38845EE47CCA78837DF6E43DBC5';

function getApiKeyAndHeaders(): { apiKey: string; headers: Record<string, string> } {
  if (Platform.OS === 'ios') {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS;
    if (!apiKey) throw new Error('Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS');
    return { apiKey, headers: { 'X-Ios-Bundle-Identifier': IOS_BUNDLE_ID } };
  }
  if (Platform.OS === 'android') {
    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID;
    if (!apiKey) throw new Error('Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID');
    return {
      apiKey,
      headers: { 'X-Android-Package': ANDROID_PACKAGE, 'X-Android-Cert': ANDROID_CERT_SHA1 },
    };
  }
  // Web: the browser attaches Referer itself; nothing to set manually.
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_WEB;
  if (!apiKey) throw new Error('Missing EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_WEB');
  return { apiKey, headers: {} };
}

export type PlaceAutocompleteSuggestion = {
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

export async function autocompletePlaces(
  input: string,
  sessionToken: string
): Promise<PlaceAutocompleteSuggestion[]> {
  if (!input.trim()) return [];

  const { apiKey, headers } = getApiKeyAndHeaders();
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      ...headers,
    },
    body: JSON.stringify({ input, sessionToken }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Places autocomplete failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const suggestions = data.suggestions ?? [];
  return suggestions
    .filter((s: { placePrediction?: unknown }) => s.placePrediction)
    .map((s: { placePrediction: { placeId: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } } } }) => ({
      placeId: s.placePrediction.placeId,
      primaryText: s.placePrediction.structuredFormat?.mainText?.text ?? '',
      secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text ?? '',
    }));
}

export type PlaceAddressComponent = {
  longText: string;
  shortText: string;
  types: string[];
};

export type PlaceDetails = {
  id: string;
  displayName: string;
  types: string[];
  lat: number;
  lng: number;
  addressComponents: PlaceAddressComponent[];
};

export async function fetchPlaceDetails(
  placeId: string,
  sessionToken: string
): Promise<PlaceDetails> {
  const { apiKey, headers } = getApiKeyAndHeaders();
  const fieldMask = 'id,displayName,types,location,addressComponents';
  const url = `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask,
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Place details failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  return {
    id: data.id,
    displayName: data.displayName?.text ?? '',
    types: data.types ?? [],
    lat: data.location?.latitude,
    lng: data.location?.longitude,
    addressComponents: data.addressComponents ?? [],
  };
}
