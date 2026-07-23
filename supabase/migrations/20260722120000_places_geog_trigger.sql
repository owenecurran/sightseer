-- Keeps geog in sync with lat/lng automatically, so client code (and the
-- get-or-create place cache) only ever needs to write plain lat/lng and
-- never has to construct a PostGIS geography literal by hand.
create or replace function public.set_places_geog()
returns trigger
language plpgsql
as $$
begin
  if new.lat is not null and new.lng is not null then
    new.geog := ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)::geography;
  end if;
  return new;
end;
$$;

create trigger places_set_geog
  before insert or update of lat, lng on public.places
  for each row execute function public.set_places_geog();
