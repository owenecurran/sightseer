import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

// The little picture printed on each tag sticker beside its word, so a tag
// can be recognised at a glance before it is read. One per tag rather than
// one per category: a category's tags are not alike enough to share one
// ("Free" and "Book ahead" are both Practical), and a sticker for a sunset
// with a generic scenery mark on it says less than one with a sun.
const ICONS: Record<string, IconName> = {
  // Scenery & setting
  'perfect-sunset': 'partly-sunny-outline',
  'scenic-location': 'image-outline',
  'open-water': 'water-outline',
  'great-trails': 'trail-sign-outline',
  'mountain-views': 'triangle-outline',
  waterfront: 'boat-outline',
  'green-space': 'leaf-outline',
  wildlife: 'paw-outline',
  stargazing: 'star-outline',
  // Atmosphere
  vibe: 'sparkles-outline',
  cozy: 'bonfire-outline',
  'live-music': 'musical-notes-outline',
  bar: 'beer-outline',
  'night-out': 'moon-outline',
  quiet: 'volume-low-outline',
  lively: 'megaphone-outline',
  romantic: 'heart-outline',
  historic: 'library-outline',
  artsy: 'color-palette-outline',
  // Who it suits
  'young-people': 'people-outline',
  'kid-friendly': 'happy-outline',
  'pet-friendly': 'paw-outline',
  'solo-friendly': 'person-outline',
  'good-for-groups': 'people-circle-outline',
  accessible: 'accessibility-outline',
  'date-spot': 'rose-outline',
  // Food & drink
  'good-food': 'restaurant-outline',
  'good-coffee': 'cafe-outline',
  'great-cocktails': 'wine-outline',
  'local-food': 'pizza-outline',
  // Practical
  walkable: 'walk-outline',
  affordable: 'cash-outline',
  'high-end': 'diamond-outline',
  'easy-parking': 'car-outline',
  'transit-friendly': 'bus-outline',
  free: 'pricetag-outline',
  'gets-crowded': 'people-outline',
  'book-ahead': 'calendar-outline',
  'rainy-day': 'umbrella-outline',
  // Verdict
  'local-secret': 'key-outline',
  'highlight-of-the-city': 'trophy-outline',
  'worth-the-detour': 'navigate-outline',
  underrated: 'trending-up-outline',
  overrated: 'trending-down-outline',
};

// A tag added after this list was written still gets a mark: a label tag.
export function tagIcon(slug: string): IconName {
  return ICONS[slug] ?? 'pricetag-outline';
}

// The same picture as a solid glyph, for the sticker graphics on the backs
// of postcards, where it is the whole face of the sticker and an outline
// would read as thin.
export function tagGlyph(slug: string): IconName {
  return tagIcon(slug).replace(/-outline$/, '') as IconName;
}

export type TagFamily = 'scenery' | 'atmosphere' | 'people' | 'food' | 'practical' | 'verdict';

// Which family a tag belongs to (the categories the tag picker groups them
// under), which decides the shape of its sticker.
const FAMILIES: Record<TagFamily, string[]> = {
  scenery: ['perfect-sunset', 'scenic-location', 'open-water', 'great-trails', 'mountain-views', 'waterfront', 'green-space', 'wildlife', 'stargazing'],
  atmosphere: ['vibe', 'cozy', 'live-music', 'bar', 'night-out', 'quiet', 'lively', 'romantic', 'historic', 'artsy'],
  people: ['young-people', 'kid-friendly', 'pet-friendly', 'solo-friendly', 'good-for-groups', 'accessible', 'date-spot'],
  food: ['good-food', 'good-coffee', 'great-cocktails', 'local-food'],
  practical: ['walkable', 'affordable', 'high-end', 'easy-parking', 'transit-friendly', 'free', 'gets-crowded', 'book-ahead', 'rainy-day'],
  verdict: ['local-secret', 'highlight-of-the-city', 'worth-the-detour', 'underrated', 'overrated'],
};

export function tagFamily(slug: string): TagFamily {
  for (const [family, slugs] of Object.entries(FAMILIES) as [TagFamily, string[]][]) {
    if (slugs.includes(slug)) return family;
  }
  return 'verdict';
}

// The word printed on a tag's sticker banner: a sticker's slogan rather than
// the tag's full name, short enough to set large on a sticker an inch
// across. The name itself shows when the sticker is tapped.
const SLOGANS: Record<string, string> = {
  'perfect-sunset': 'Golden hour',
  'scenic-location': 'What a view',
  'open-water': 'Splash',
  'great-trails': 'Trails',
  'mountain-views': 'Peaks',
  waterfront: 'Harbour',
  'green-space': 'Green',
  wildlife: 'Wild',
  stargazing: 'Starry',
  vibe: 'Vibes',
  cozy: 'Cozy',
  'live-music': 'Live',
  bar: 'Cheers',
  'night-out': 'Night out',
  quiet: 'Hush',
  lively: 'Buzzing',
  romantic: 'Amour',
  historic: 'Old soul',
  artsy: 'Artsy',
  'young-people': 'Young',
  'kid-friendly': 'Kids',
  'pet-friendly': 'Pets',
  'solo-friendly': 'Solo',
  'good-for-groups': 'Crew',
  accessible: 'Step-free',
  'date-spot': 'Date',
  'good-food': 'Yum',
  'good-coffee': 'Coffee',
  'great-cocktails': 'Sips',
  'local-food': 'Local',
  walkable: 'Stroll',
  affordable: 'Cheap',
  'high-end': 'Fancy',
  'easy-parking': 'Parking',
  'transit-friendly': 'Transit',
  free: 'Free',
  'gets-crowded': 'Busy',
  'book-ahead': 'Book it',
  'rainy-day': 'Rainy day',
  'local-secret': 'Hidden gem',
  'highlight-of-the-city': 'The best',
  'worth-the-detour': 'Detour',
  underrated: 'Sleeper',
  overrated: 'Meh',
};

export function tagSlogan(slug: string, label: string): string {
  return SLOGANS[slug] ?? label.split(' ')[0];
}
