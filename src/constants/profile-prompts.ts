export type ProfilePromptCategory = 'discovery' | 'food' | 'planning' | 'reflection';

export type ProfilePromptOption = {
  slug: string;
  label: string;
  category: ProfilePromptCategory;
};

export const PROFILE_PROMPT_CATEGORY_LABELS: Record<ProfilePromptCategory, string> = {
  discovery: 'Discovery',
  food: 'Food',
  planning: 'Planning',
  reflection: 'Reflection',
};

// A fixed, app-defined list — not DB-driven — same pattern as REPORT_REASONS
// in visit-menu.tsx. Users pick from these when filling a prompt slot,
// grouped by category in prompt-editor.tsx's picker.
//
// To add, remove, or reword a prompt: edit this array directly. `label` is
// the question text shown to users; `slug` must stay unique (kebab-case) and
// is what's actually stored per-user once answered, so renaming a slug on an
// already-used prompt orphans existing answers — change `label` instead of
// `slug` to just reword one. No migration/deploy step beyond a normal app
// release; this is plain bundled app code, not database content.
export const PROFILE_PROMPTS: ProfilePromptOption[] = [
  { slug: 'next-trip-destination', label: 'Next trip destination', category: 'planning' },
  { slug: 'favorite-trip-review', label: 'Favorite trip review', category: 'reflection' },
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
