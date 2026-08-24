import { supabase } from '@/lib/supabase';

export type Harmony = {
  // 0-100, already shrunk toward 50 by how much evidence exists — see the
  // get_harmony migration. Null when the viewer can't see this user's
  // content, or when there's nothing at all to compare.
  score: number | null;
  sharedPlaces: number;
  sharedAreas: number;
  // Exact places both chose to visit away from their own homes — the
  // strongest single signal, since deciding to go somewhere says more than
  // how you rated it once there.
  sharedDestinations: number;
  // Places both rated that are home turf for one of them. Excluded from
  // destination overlap on purpose (living somewhere isn't travelling), but
  // a shared local favourite is real taste agreement.
  sharedLocal: number;
  evidence: number;
};

// Below this the score is mostly the neutral prior showing through rather
// than a real signal, so the UI says so instead of implying precision.
export const LOW_EVIDENCE_THRESHOLD = 4;

export async function getHarmony(viewerId: string, otherId: string): Promise<Harmony | null> {
  const { data, error } = await supabase.rpc('get_harmony', {
    viewer_id: viewerId,
    other_id: otherId,
  });
  if (error) throw error;

  const row = (data as unknown as {
    score: number | null;
    shared_places: number;
    shared_areas: number;
    shared_destinations: number;
    shared_local: number;
    evidence: number;
  }[])?.[0];
  if (!row || row.score == null) return null;

  return {
    score: row.score,
    sharedPlaces: row.shared_places ?? 0,
    sharedAreas: row.shared_areas ?? 0,
    sharedDestinations: row.shared_destinations ?? 0,
    sharedLocal: row.shared_local ?? 0,
    evidence: Number(row.evidence ?? 0),
  };
}

// Deliberately hedged wording at the top end: this is a similarity estimate
// from sparse data, not a measurement.
export function harmonyLabel(score: number): string {
  if (score >= 80) return 'Kindred travellers';
  if (score >= 65) return 'Similar taste';
  if (score >= 45) return 'Some overlap';
  return 'Different paths';
}

export type HarmonyReason = {
  // 'place' = both rated this exact spot. 'area' = both travelled here,
  // compared on their effective rating for it (see user_area_ratings).
  kind: 'place' | 'area';
  placeId: string;
  name: string;
  myRating: number;
  theirRating: number;
  // 0-1, where 1 is identical ratings.
  agreement: number;
  isLocal: boolean;
};

// The specific places behind a score, closest agreement first. Fetched only
// when the user asks ("Learn why") rather than alongside every profile —
// it's a second round trip that most profile views never need.
export async function getHarmonyBreakdown(
  viewerId: string,
  otherId: string,
  maxRows = 6
): Promise<HarmonyReason[]> {
  const { data, error } = await supabase.rpc('get_harmony_breakdown', {
    viewer_id: viewerId,
    other_id: otherId,
    max_rows: maxRows,
  });
  if (error) throw error;

  return ((data ?? []) as unknown as {
    kind: string;
    place_id: string;
    name: string;
    my_rating: number;
    their_rating: number;
    agreement: number;
    is_local: boolean;
  }[]).map((row) => ({
    kind: row.kind === 'place' ? 'place' : 'area',
    placeId: row.place_id,
    name: row.name,
    myRating: Number(row.my_rating),
    theirRating: Number(row.their_rating),
    agreement: Number(row.agreement),
    isLocal: row.is_local,
  }));
}
