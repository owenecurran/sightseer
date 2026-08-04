import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';

import { supabase } from '@/lib/supabase';

// No phone-number-parsing library in this project, so this is a deliberately
// simple E.164-ish normalization rather than full libphonenumber-grade
// parsing: strip everything but digits and a leading '+', and assume a
// bare 10-digit number (no country code entered) is US/Canada — the only
// region this app has needed so far. Both the device-contacts side and the
// "enter your own number" side (see setMyPhoneNumber in settings.tsx) must
// normalize identically before hashing, or matches silently never happen.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

async function hashPhone(raw: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalizePhone(raw));
}

export type DeviceContact = { name: string; hash: string };

// null = permission denied. Follows this app's established permission
// convention (src/lib/image-picker.ts, src/lib/current-location.ts): call
// the Expo permission API directly, no custom pre-permission explainer.
export async function getDeviceContactsHashed(): Promise<DeviceContact[] | 'denied'> {
  const { granted } = await Contacts.requestPermissionsAsync();
  if (!granted) return 'denied';

  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });

  const contacts: DeviceContact[] = [];
  for (const contact of data) {
    const number = contact.phoneNumbers?.[0]?.number;
    if (!number || !contact.name) continue;
    contacts.push({ name: contact.name, hash: await hashPhone(number) });
  }
  return contacts;
}

export type MatchedUser = {
  id: string;
  handle: string | null;
  name: string | null;
  is_private: boolean;
  hashed_phone: string | null;
};

export async function matchContactsToUsers(hashes: string[]): Promise<MatchedUser[]> {
  if (hashes.length === 0) return [];
  const { data, error } = await supabase.rpc('match_contacts_by_hash', { hashes: [...new Set(hashes)] });
  if (error) throw error;
  return data;
}

// The write side of the same column match_contacts_by_hash reads —
// hashed_phone/discoverable_by_contacts were already scaffolded on `users`
// but never written to anywhere until this feature. Passing `null` clears a
// previously-set number.
export async function setMyPhoneNumber(userId: string, rawPhone: string | null): Promise<void> {
  const hashed = rawPhone ? await hashPhone(rawPhone) : null;
  const { error } = await supabase.from('users').update({ hashed_phone: hashed }).eq('id', userId);
  if (error) throw error;
}

export async function setDiscoverableByContacts(userId: string, discoverable: boolean): Promise<void> {
  const { error } = await supabase.from('users').update({ discoverable_by_contacts: discoverable }).eq('id', userId);
  if (error) throw error;
}
