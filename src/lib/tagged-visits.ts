import { FEED_VISIT_SELECT, mapRawFeedVisit, type FeedVisit, type RawFeedVisit } from '@/lib/feed';
import { supabase } from '@/lib/supabase';

export type TaggedVisit = Omit<FeedVisit, 'visitNumber'>;

// The reverse of visit_tagged_users' usual read direction (normally read as
// a nested join off a visit its own owner is fetching, to render "with
// @X"). Two queries rather than one: PostgREST can't order/filter the top
// level by an embedded many-to-one column, so we resolve tagged visit ids
// first, then run the same select as the feed against just those ids.
export async function getVisitsTaggedIn(myUserId: string): Promise<TaggedVisit[]> {
  const { data: tags, error: tagsError } = await supabase
    .from('visit_tagged_users')
    .select('visit_id')
    .eq('user_id', myUserId);
  if (tagsError) throw tagsError;

  const visitIds = tags.map((t) => t.visit_id);
  if (visitIds.length === 0) return [];

  const { data, error } = await supabase
    .from('visits')
    .select(FEED_VISIT_SELECT)
    .in('id', visitIds)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rawVisits = data as unknown as RawFeedVisit[];
  return rawVisits.map((visit) => mapRawFeedVisit(visit, myUserId));
}

// RLS (visit_tagged_users_delete) already permits the tagged user to remove
// their own tag, independent of the visit's owner.
export async function untagSelf(visitId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('visit_tagged_users')
    .delete()
    .eq('visit_id', visitId)
    .eq('user_id', userId);
  if (error) throw error;
}

export type TaggedInShowcase = {
  totalTagged: number;
  latestTagged: TaggedVisit | null;
};

// Powers the profile's "Tagged in" teaser box, same shape as
// getProfileShowcase's "Latest reviews" teaser.
export async function getTaggedInShowcase(userId: string): Promise<TaggedInShowcase> {
  const [countResult, tagsResult] = await Promise.all([
    supabase.from('visit_tagged_users').select('visit_id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('visit_tagged_users')
      .select('visit_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countResult.error) throw countResult.error;
  if (tagsResult.error) throw tagsResult.error;

  const latestVisitId = tagsResult.data?.visit_id;
  if (!latestVisitId) {
    return { totalTagged: countResult.count ?? 0, latestTagged: null };
  }

  const { data, error } = await supabase.from('visits').select(FEED_VISIT_SELECT).eq('id', latestVisitId).single();
  if (error) throw error;

  return {
    totalTagged: countResult.count ?? 0,
    latestTagged: mapRawFeedVisit(data as unknown as RawFeedVisit, userId),
  };
}
