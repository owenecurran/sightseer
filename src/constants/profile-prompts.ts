export type ProfilePromptCategory = 'discovery' | 'food' | 'planning' | 'reflection';

export type ProfilePromptOption = {
  slug: string;
  label: string;
  category: ProfilePromptCategory;
};

// A fixed, app-defined list — not DB-driven — same pattern as REPORT_REASONS
// in visit-menu.tsx. Users pick from these when filling a prompt slot.
// `category` isn't surfaced in the UI yet (grouping/filtering the picker by
// category is a later addition) but is added now while the list is small,
// rather than needing a data migration once real prompts exist.
export const PROFILE_PROMPTS: ProfilePromptOption[] = [
  { slug: 'hidden-gem', label: 'Best hidden gem I’ve found', category: 'discovery' },
  { slug: 'redo-trip', label: 'A trip I’d redo in a heartbeat', category: 'reflection' },
  { slug: 'comfort-food', label: 'My go-to comfort food spot', category: 'food' },
  { slug: 'next-on-list', label: 'Next on my list', category: 'planning' },
  { slug: 'underrated', label: 'Most underrated place I’ve been', category: 'discovery' },
  { slug: 'local-secret', label: 'A local secret I love sharing', category: 'discovery' },
  { slug: 'worth-the-hype', label: 'A place that was actually worth the hype', category: 'reflection' },
  { slug: 'sunset-spot', label: 'Best sunset I’ve caught', category: 'discovery' },
  { slug: 'would-not-go-back', label: 'Somewhere I wouldn’t rush back to', category: 'reflection' },
  { slug: 'first-solo-trip', label: 'A trip that changed how I travel', category: 'reflection' },
];
