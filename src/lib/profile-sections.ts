import { supabase } from '@/lib/supabase';

// The reorderable content modules on a profile — header/stats/follow
// requests/footer utility links stay fixed at their current positions, not
// draggable.
export const PROFILE_SECTION_KEYS = ['latest_reviews', 'tagged_in', 'prompts', 'map'] as const;

export type ProfileSectionKey = (typeof PROFILE_SECTION_KEYS)[number];

export const PROFILE_SECTION_LABELS: Record<ProfileSectionKey, string> = {
  latest_reviews: 'Latest reviews',
  tagged_in: 'Tagged in',
  prompts: 'Prompts',
  map: 'Map',
};

function isSectionKey(value: string): value is ProfileSectionKey {
  return (PROFILE_SECTION_KEYS as readonly string[]).includes(value);
}

// Mirrors map-layers.ts's parseDefaultLayers: unset/unrecognized stored
// values fall back to PROFILE_SECTION_KEYS' own default order, and any
// recognized key missing from a stored (older) order is appended at the end
// so a newly added section still shows up for existing users.
export function parseSectionOrder(stored: string[] | null | undefined): ProfileSectionKey[] {
  const filtered = (stored ?? []).filter(isSectionKey);
  const missing = PROFILE_SECTION_KEYS.filter((key) => !filtered.includes(key));
  return [...filtered, ...missing];
}

export async function saveProfileSectionOrder(userId: string, order: ProfileSectionKey[]): Promise<void> {
  const { error } = await supabase.from('users').update({ profile_section_order: order }).eq('id', userId);
  if (error) throw error;
}
