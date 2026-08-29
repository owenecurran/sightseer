import { supabase } from '@/lib/supabase';

// Keep in sync with the enforce_visit_tag_limit trigger, which is the real
// rule — this constant only drives the picker's affordances.
export const MAX_VISIT_TAGS = 3;

export type Tag = { slug: string; label: string };

// The vocabulary barely changes and is tiny (17 rows), but every review form
// and every place page wants it. Cached for the session so opening the
// picker twice isn't two round trips.
let vocabularyPromise: Promise<Tag[]> | null = null;

export function listTags(): Promise<Tag[]> {
  vocabularyPromise ??= (async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('slug, label')
      .order('sort_order');
    if (error) {
      // Not cached on failure — a cached rejection would keep the picker
      // empty for the rest of the session over one dropped request.
      vocabularyPromise = null;
      throw error;
    }
    return data as Tag[];
  })();
  return vocabularyPromise;
}

// Replaces a review's tags wholesale. Delete-then-insert rather than working
// out a diff: there are at most three, so the diff would be more code than
// it saves, and this also converges if a previous save half-failed.
export async function setVisitTags(visitId: string, slugs: string[]): Promise<void> {
  const capped = [...new Set(slugs)].slice(0, MAX_VISIT_TAGS);

  const { error: deleteError } = await supabase
    .from('visit_tags')
    .delete()
    .eq('visit_id', visitId);
  if (deleteError) throw deleteError;

  if (capped.length === 0) return;

  const { error: insertError } = await supabase
    .from('visit_tags')
    .insert(capped.map((slug) => ({ visit_id: visitId, tag_slug: slug })));
  if (insertError) throw insertError;
}

// Which tags are in use on the reviews at or under a place, with how many
// carry each — so a place page can offer only filters that would actually
// match something rather than the whole vocabulary.
export function countTagsForVisits(
  visitTags: { slug: string; label: string }[][]
): { slug: string; label: string; count: number }[] {
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const tags of visitTags) {
    for (const tag of tags) {
      const existing = counts.get(tag.slug);
      if (existing) existing.count += 1;
      else counts.set(tag.slug, { ...tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
