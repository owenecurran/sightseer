import { getVisitsByIds, type FeedVisit } from '@/lib/feed';
import { supabase } from '@/lib/supabase';

// Keep in sync with the enforce_visit_tag_limit trigger, which is the real
// rule — this constant only drives the picker's affordances.
export const MAX_VISIT_TAGS = 3;

export type Tag = { slug: string; label: string; category: string };

// The vocabulary in the order the picker shows it, split into its category
// sections. Built by walking the already-sorted rows and starting a new
// section whenever the category changes — which is why sort_order is laid out
// in per-category blocks (see 20260914120000_tag_categories.sql). No second
// ordering column, and no list of category names duplicated on the client
// that a new category would have to be remembered in.
export type TagSection = { category: string; tags: Tag[] };

export function groupTags(tags: Tag[]): TagSection[] {
  const sections: TagSection[] = [];
  for (const tag of tags) {
    const current = sections[sections.length - 1];
    if (current?.category === tag.category) current.tags.push(tag);
    else sections.push({ category: tag.category, tags: [tag] });
  }
  return sections;
}

// The vocabulary barely changes and is small (43 rows), but every review form
// and every place page wants it. Cached for the session so opening the
// picker twice isn't two round trips.
let vocabularyPromise: Promise<Tag[]> | null = null;

export function listTags(): Promise<Tag[]> {
  vocabularyPromise ??= (async () => {
    const { data, error } = await supabase
      .from('tags')
      .select('slug, label, category')
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

// Replace the review's tag set in one transaction.
export async function setVisitTags(visitId: string, slugs: string[]): Promise<void> {
  const capped = [...new Set(slugs)].slice(0, MAX_VISIT_TAGS);
  const { error } = await supabase.rpc('set_visit_tags', { p_visit_id: visitId, p_tag_slugs: capped });
  if (error) throw error;
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

// How many reviews of a tag to show on its page.
const TAG_PAGE_LIMIT = 30;

// The reviews carrying one tag, newest first, of those the viewer is allowed
// to see (visit_tags is read through the same visibility rule as visits),
// with the tag's own label for the page's title.
export async function getVisitsWithTag(
  slug: string,
  viewerId: string,
): Promise<{ label: string | null; visits: FeedVisit[] }> {
  const [tagRows, tag] = await Promise.all([
    supabase.from('visit_tags').select('visit_id').eq('tag_slug', slug).limit(200),
    supabase.from('tags').select('label').eq('slug', slug).maybeSingle(),
  ]);
  if (tagRows.error) throw tagRows.error;
  const ids = [...new Set((tagRows.data ?? []).map((row) => row.visit_id))];
  const visits = await getVisitsByIds(ids, viewerId);
  return { label: tag.data?.label ?? null, visits: visits.slice(0, TAG_PAGE_LIMIT) };
}
