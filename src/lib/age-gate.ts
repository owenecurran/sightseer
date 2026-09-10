import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'sightseer.age-gate-failed';

// Remembers, on the device, that someone here already declared an age under
// the minimum.
//
// Worth being clear about what this is and is not. It is not a security
// control: AsyncStorage is cleared by reinstalling the app, and on web it is
// cleared by clearing site data. Anyone determined to get past it will.
//
// What it does stop is the thing that actually happens — a child who is told
// "you must be 13" and immediately makes a second account on the same phone.
// The account-level ban is what persists; this exists so the retry does not
// even get as far as answering again.
//
// The shape is driven by one requirement that is easy to miss: an admin
// lifting a ban has to stick. A bare "this device failed" flag re-bans on
// sight every account that reaches the onboarding screen, silently undoing
// the admin the moment the user gets there — including the account the flag
// was about. So the record tracks which accounts it has already been applied
// to, and never applies to the same account twice. After that one
// application, the account's own ban is the source of truth, and lifting it
// is final.
type AgeGateRecord = {
  // The account that actually answered with an underage date.
  originUserId: string;
  // Accounts this device has blocked as a consequence, origin included.
  // Anyone in here has had their day in court: if they are not banned now,
  // an admin unbanned them, and that decision stands.
  appliedTo: string[];
  at: string;
};

async function read(): Promise<AgeGateRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AgeGateRecord>;
    if (typeof parsed.originUserId !== 'string') return null;
    return {
      originUserId: parsed.originUserId,
      appliedTo: Array.isArray(parsed.appliedTo) ? parsed.appliedTo : [parsed.originUserId],
      at: typeof parsed.at === 'string' ? parsed.at : new Date().toISOString(),
    };
  } catch {
    // Unreadable or malformed — treated as "no record". A storage error
    // should never be the reason someone cannot use the app, and the
    // server-side age trigger is still there regardless.
    return null;
  }
}

async function write(record: AgeGateRecord): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Nothing useful to do — the account is banned either way.
  }
}

// Called when an account answers with an underage date. Starts the record if
// there is none, and otherwise just notes this account against the existing
// one, so the origin stays whoever answered first.
export async function recordAgeGateFailure(userId: string): Promise<void> {
  const existing = await read();
  if (!existing) {
    await write({ originUserId: userId, appliedTo: [userId], at: new Date().toISOString() });
    return;
  }
  if (existing.appliedTo.includes(userId)) return;
  await write({ ...existing, appliedTo: [...existing.appliedTo, userId] });
}

// True only for an account this device has not already acted against.
// Everything else — no record at all, or an account already blocked once and
// since unbanned — passes.
export async function shouldBlockNewAccount(userId: string): Promise<boolean> {
  const record = await read();
  return record !== null && !record.appliedTo.includes(userId);
}

// Notes that this account has now been blocked, so a later admin unban is
// not undone the next time they reach onboarding.
export async function markAgeGateApplied(userId: string): Promise<void> {
  await recordAgeGateFailure(userId);
}
