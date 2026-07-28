import { supabase } from '@/lib/supabase';

export type ShowcaseVisit = {
  id: string;
  rating: number;
  note: string | null;
  places: { name: string } | null;
  photos: { id: string; position: number }[];
};

export type ProfileShowcase = {
  totalVisits: number;
  latestVisit: ShowcaseVisit | null;
};

// Powers the profile's "N sights seen" stat and "Latest reviews" teaser —
// "Favorite trip review" used to live here too, back when it was a fixed
// user-picked column instead of a regular selectable prompt.
export async function getProfileShowcase(userId: string): Promise<ProfileShowcase> {
  const [countResult, latestResult] = await Promise.all([
    supabase.from('visits').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('visits')
      .select('id, rating, note, places!place_id(name), photos(id, position)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (countResult.error) throw countResult.error;
  if (latestResult.error) throw latestResult.error;

  return {
    totalVisits: countResult.count ?? 0,
    latestVisit: latestResult.data as unknown as ShowcaseVisit | null,
  };
}
