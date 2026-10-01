// Dialling codes for the country picker.
//
// The flag is DERIVED from the ISO code rather than stored: a flag emoji is
// just the two letters as regional-indicator symbols, so AU is U+1F1E6 U+1F1FA.
// Storing 200 emoji would be 200 chances to paste the wrong one, and some of
// them render as a pair of letters on platforms with no flag font anyway —
// which is a perfectly readable fallback and arrives for free.
//
// Not exhaustive, and deliberately so: this is the list of places this app
// has any reason to text a code to, ordered by how likely that is. Adding one
// is a single line. The alternative — all 249 ISO entries including the ones
// with no mobile networks — makes the picker harder to use for everybody in
// exchange for nothing.
export type Country = {
  // ISO 3166-1 alpha-2. Also what the flag is built from.
  iso: string;
  // Without the plus.
  dial: string;
  name: string;
};

export const COUNTRIES: Country[] = [
  { iso: 'US', dial: '1', name: 'United States' },
  { iso: 'CA', dial: '1', name: 'Canada' },
  { iso: 'GB', dial: '44', name: 'United Kingdom' },
  { iso: 'IE', dial: '353', name: 'Ireland' },
  { iso: 'AU', dial: '61', name: 'Australia' },
  { iso: 'NZ', dial: '64', name: 'New Zealand' },
  { iso: 'DE', dial: '49', name: 'Germany' },
  { iso: 'FR', dial: '33', name: 'France' },
  { iso: 'ES', dial: '34', name: 'Spain' },
  { iso: 'IT', dial: '39', name: 'Italy' },
  { iso: 'PT', dial: '351', name: 'Portugal' },
  { iso: 'NL', dial: '31', name: 'Netherlands' },
  { iso: 'BE', dial: '32', name: 'Belgium' },
  { iso: 'CH', dial: '41', name: 'Switzerland' },
  { iso: 'AT', dial: '43', name: 'Austria' },
  { iso: 'SE', dial: '46', name: 'Sweden' },
  { iso: 'NO', dial: '47', name: 'Norway' },
  { iso: 'DK', dial: '45', name: 'Denmark' },
  { iso: 'FI', dial: '358', name: 'Finland' },
  { iso: 'IS', dial: '354', name: 'Iceland' },
  { iso: 'PL', dial: '48', name: 'Poland' },
  { iso: 'CZ', dial: '420', name: 'Czechia' },
  { iso: 'GR', dial: '30', name: 'Greece' },
  { iso: 'TR', dial: '90', name: 'Türkiye' },
  { iso: 'RO', dial: '40', name: 'Romania' },
  { iso: 'HU', dial: '36', name: 'Hungary' },
  { iso: 'UA', dial: '380', name: 'Ukraine' },
  { iso: 'MX', dial: '52', name: 'Mexico' },
  { iso: 'BR', dial: '55', name: 'Brazil' },
  { iso: 'AR', dial: '54', name: 'Argentina' },
  { iso: 'CL', dial: '56', name: 'Chile' },
  { iso: 'CO', dial: '57', name: 'Colombia' },
  { iso: 'PE', dial: '51', name: 'Peru' },
  { iso: 'JP', dial: '81', name: 'Japan' },
  { iso: 'KR', dial: '82', name: 'South Korea' },
  { iso: 'CN', dial: '86', name: 'China' },
  { iso: 'HK', dial: '852', name: 'Hong Kong' },
  { iso: 'SG', dial: '65', name: 'Singapore' },
  { iso: 'IN', dial: '91', name: 'India' },
  { iso: 'PK', dial: '92', name: 'Pakistan' },
  { iso: 'PH', dial: '63', name: 'Philippines' },
  { iso: 'ID', dial: '62', name: 'Indonesia' },
  { iso: 'MY', dial: '60', name: 'Malaysia' },
  { iso: 'TH', dial: '66', name: 'Thailand' },
  { iso: 'VN', dial: '84', name: 'Vietnam' },
  { iso: 'IL', dial: '972', name: 'Israel' },
  { iso: 'AE', dial: '971', name: 'United Arab Emirates' },
  { iso: 'SA', dial: '966', name: 'Saudi Arabia' },
  { iso: 'ZA', dial: '27', name: 'South Africa' },
  { iso: 'NG', dial: '234', name: 'Nigeria' },
  { iso: 'KE', dial: '254', name: 'Kenya' },
  { iso: 'EG', dial: '20', name: 'Egypt' },
  { iso: 'MA', dial: '212', name: 'Morocco' },
];

export const DEFAULT_COUNTRY: Country =
  COUNTRIES.find((c) => c.iso === 'US') ?? COUNTRIES[0];

// Two letters to a flag.
//
// Guarded rather than assumed: a malformed ISO code would otherwise produce
// whatever Unicode happens to live at that offset, and a stray glyph in a
// picker is worse than no flag at all.
export function flagFor(iso: string): string {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '';
  const BASE = 0x1f1e6; // REGIONAL INDICATOR SYMBOL LETTER A
  return String.fromCodePoint(
    BASE + (code.charCodeAt(0) - 65),
    BASE + (code.charCodeAt(1) - 65),
  );
}

// How many digits a national number should have, where we know.
//
// Only +1 is pinned, because it is the only plan this app formats and the
// only one where "ten digits" is reliably true across the whole country code.
// Everywhere else falls back to E.164's own bounds, which is a weak check and
// an honest one — the alternative is a per-country length table that is wrong
// for somebody the week after it is written.
export function isValidNationalNumber(country: Country, digits: string): boolean {
  if (country.dial === '1') return digits.length === 10;
  // E.164 allows 15 digits including the country code.
  return digits.length >= 4 && digits.length + country.dial.length <= 15;
}

// (xxx) xxx-xxxx, and only for +1.
//
// Applied as you type, so the parentheses and the dash appear under the
// cursor rather than being added at the end. Everywhere else the digits are
// left alone: a North American mask on a German number would be actively
// misleading about how many digits are expected and where they group.
export function formatNationalNumber(country: Country, digits: string): string {
  if (country.dial !== '1') return digits;
  const d = digits.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
