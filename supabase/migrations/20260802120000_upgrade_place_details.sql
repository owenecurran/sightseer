-- places has no client-facing UPDATE policy at all ("places are append-only
-- from the client; corrections happen server-side only" — see the RLS
-- migration) — security definer is what lets this write despite that, same
-- established pattern as store_place_boundary. Without this, getOrCreatePlace
-- (src/lib/places-cache.ts) throws whenever it tries to "upgrade" a bare
-- chain-inferred parent row (planted by an earlier POI review's ancestor
-- chain, missing google_place_id/lat/lng) with real details — which is why
-- reviewing a locality/admin_area_1/country directly (rather than a POI)
-- reliably errored: that place's row very often already exists as exactly
-- such a bare placeholder from someone else's earlier POI review nearby.
create or replace function public.upgrade_place_details(
  place_id uuid,
  p_google_place_id text,
  p_category text,
  p_lat float,
  p_lng float
)
returns public.places
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.places;
begin
  update public.places
  set
    google_place_id = coalesce(p_google_place_id, google_place_id),
    category = coalesce(p_category, category),
    lat = p_lat,
    lng = p_lng
  where id = place_id
  returning * into result;
  return result;
end;
$$;

grant execute on function public.upgrade_place_details(uuid, text, text, float, float) to authenticated;
