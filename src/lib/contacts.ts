import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// No phone-number-parsing library in this project, so this is a deliberately
// simple E.164-ish normalization rather than full libphonenumber-grade
// parsing: strip everything but digits and a leading '+', and assume a
// bare 10-digit number (no country code entered) is US/Canada — the only
// region this app has needed so far. Both the device-contacts side and the
// "your own verified number" side (private.normalize_phone in
// 20260922150000_verified_phone_and_email.sql) must normalize identically
// before hashing, or matches silently never happen. Verified byte-for-byte
// against the server's output rather than assumed.
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

// How much of the address book we were actually given.
//
// 'limited' is iOS 18's middle answer: the person picked a few specific
// contacts rather than handing over the lot. It is reported separately from
// 'all' because the two produce identical-looking results — a short list —
// and conflating them is how "we only looked at four people" gets shown to
// somebody as "none of your contacts are on Sightseer".
export type ContactAccess = 'all' | 'limited';

export type DeviceContactsResult =
  | { contacts: DeviceContact[]; access: ContactAccess }
  | 'denied';

// Follows this app's established permission convention
// (src/lib/image-picker.ts, src/lib/current-location.ts): call the Expo
// permission API directly, no custom pre-permission explainer.
export async function getDeviceContactsHashed(): Promise<DeviceContactsResult> {
  const permission = await Contacts.requestPermissionsAsync();
  if (!permission.granted) return 'denied';

  // accessPrivileges is undefined on Android and on iOS before 18, where
  // there is no such thing as partial access — granted means everything.
  const access: ContactAccess = permission.accessPrivileges === 'limited' ? 'limited' : 'all';

  const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers] });

  const contacts: DeviceContact[] = [];
  for (const contact of data) {
    const number = contact.phoneNumbers?.[0]?.number;
    if (!number || !contact.name) continue;
    contacts.push({ name: contact.name, hash: await hashPhone(number) });
  }
  return { contacts, access };
}

// Ask iOS to show its own picker so more contacts can be added to a limited
// grant, without sending anybody to the Settings app.
//
// Returns whether anything new was actually selected, so the caller knows
// whether a re-sync is worth doing. iOS 18 only — everywhere else this is a
// no-op, because nowhere else has a partial grant to widen.
export async function widenContactAccess(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const added = await Contacts.presentAccessPickerAsync();
    return added.length > 0;
  } catch {
    // Older iOS throws rather than returning empty. Nothing was added, and
    // that is the whole answer the caller needs.
    return false;
  }
}

export type MatchedUser = {
  id: string;
  handle: string | null;
  name: string | null;
  is_private: boolean;
  hashed_phone: string | null;
};

// Read-only matching: who among these numbers is already here.
//
// The hashes are peppered server-side before they are compared, so what goes
// over the wire is never what is stored. `hashed_phone` on the way back is
// the hash YOU sent, not the stored one, so the caller can still map each
// match onto the contact it came from.
export async function matchContactsToUsers(hashes: string[]): Promise<MatchedUser[]> {
  if (hashes.length === 0) return [];
  const { data, error } = await supabase.rpc('match_contacts_by_hash', { hashes: [...new Set(hashes)] });
  if (error) throw error;
  return data;
}

// Matching, and remembering the phonebook so it can be matched again later.
//
// This is what a sync is FOR, and it is the difference between the two
// functions: matchContactsToUsers answers "who is here now", this one also
// records the question so that "someone you know just joined" can be
// answered months later, when they finally sign up.
//
// The server stores only a peppered hash — no name, no number. A
// notification about somebody joining names them from their own public
// profile, never from whatever you saved them as.
//
// Replaces, rather than accumulates: a contact you have since deleted stops
// being one you get told about.
export async function syncContactHashes(hashes: string[]): Promise<MatchedUser[]> {
  if (hashes.length === 0) return [];
  const { data, error } = await supabase.rpc('sync_contact_hashes', {
    p_hashes: [...new Set(hashes)],
  });
  if (error) throw error;
  return data;
}

// Forget the uploaded phonebook without giving up the account. Paired with
// the discovery toggle in Settings: turning discovery off should not leave
// your contacts sitting on a server.
export async function clearContactHashes(): Promise<void> {
  const { error } = await supabase.rpc('clear_contact_hashes');
  if (error) throw error;
}

// Whether this account can use contact finding at all.
//
// sync_contact_hashes refuses an unverified caller with P0002, because
// matching is mutual by construction and an account that reads the directory
// without appearing in it is the shape of a scraper. This is the same
// condition, asked before the attempt, so the screen can explain rather than
// show an error.
export const PHONE_NOT_VERIFIED = 'P0002';

export function isPhoneNotVerified(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === PHONE_NOT_VERIFIED
  );
}

export async function setDiscoverableByContacts(userId: string, discoverable: boolean): Promise<void> {
  const { error } = await supabase.from('users').update({ discoverable_by_contacts: discoverable }).eq('id', userId);
  if (error) throw error;
}
