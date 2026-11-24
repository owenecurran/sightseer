import { pickFor } from '@/lib/seeded-random';

// Distances to places in Discover's "Places to go", in something more fun
// than kilometres: 71K football fields, 300 days of walking, 0.023 trips to
// the Moon. Each place keeps one unit for good (it is chosen by the place's
// id), so a tag does not change its mind between visits. The routes between
// postcards give the real distance, in the reader's unit.

type Unit = { one: string; many: string; metres: number };

const UNITS: Unit[] = [
  { one: 'football field', many: 'football fields', metres: 109.7 },
  { one: 'day of walking', many: 'days of walking', metres: 30_000 },
  { one: 'light-year', many: 'light-years', metres: 9.461e15 },
  { one: 'lion length', many: 'lion lengths', metres: 2.7 },
  { one: 'Eiffel Tower', many: 'Eiffel Towers', metres: 330 },
  { one: 'marathon', many: 'marathons', metres: 42_195 },
  { one: 'blue whale', many: 'blue whales', metres: 30 },
  { one: 'banana', many: 'bananas', metres: 0.18 },
  { one: 'school bus', many: 'school buses', metres: 12 },
  { one: 'stacked Everest', many: 'stacked Everests', metres: 8_849 },
  { one: 'day of driving', many: 'days of driving', metres: 720_000 },
  { one: 'hour of flying', many: 'hours of flying', metres: 850_000 },
  { one: 'giraffe', many: 'giraffes', metres: 5.5 },
  { one: 'Olympic pool', many: 'Olympic pools', metres: 50 },
  { one: 'lap of a track', many: 'laps of a track', metres: 400 },
  { one: 'Golden Gate Bridge', many: 'Golden Gate Bridges', metres: 2_737 },
  { one: 'trip to the Moon', many: 'trips to the Moon', metres: 3.844e8 },
  { one: 'corgi', many: 'corgis', metres: 0.7 },
  { one: 'Statue of Liberty', many: 'Statues of Liberty', metres: 93 },
  { one: 'hot dog', many: 'hot dogs', metres: 0.15 },
];

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
};

// Short enough for a luggage tag's band at any size: "71K", "1.2M", "300",
// "4.5", "0.023", or for the very small, "9.5×10⁻¹⁰".
function formatAmount(value: number): string {
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}K`;
  if (value >= 100) return Math.round(value).toLocaleString('en-US');
  if (value >= 10) return String(Math.round(value));
  if (value >= 1) return value.toFixed(1).replace(/\.0$/, '');
  if (value >= 0.001) return value.toPrecision(2);
  const [mantissa, exponent] = value.toExponential(1).split('e');
  const power = String(Number(exponent))
    .split('')
    .map((c) => SUPERSCRIPT[c] ?? c)
    .join('');
  return `${mantissa}×10${power}`;
}

// "71K football fields away", for a place tag in Discover. Null when there
// is no distance to give.
export function funDistanceLabel(distanceKm: number | null | undefined, seed: string): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const unit = pickFor(`fun-distance-${seed}`, UNITS) ?? UNITS[0];
  const amount = formatAmount((distanceKm * 1000) / unit.metres);
  return `${amount} ${amount === '1' ? unit.one : unit.many} away`;
}
