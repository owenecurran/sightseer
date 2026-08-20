-- Continents as a real tier in the place hierarchy.
--
-- Chosen over a `continent` text column on countries after measuring both:
-- the extra level costs ~1ms (labelling is 4ms of a 366ms RPC; the walk goes
-- from depth 3 to 4), while a column would have broken the invariant that an
-- area IS a place -- area_place_id is a uuid joined against places, and
-- trip_overrides.display_place_id has a foreign key to it, so a continent
-- with no row could be neither returned, overridden, nor offered in the
-- level picker.
--
-- What this makes possible: a trip through France, Germany and Norway has no
-- majority country, so today it gets named after whichever has the most
-- reviews. With this tier it rolls up to "Europe".

alter table public.places drop constraint if exists places_level_check;
alter table public.places add constraint places_level_check
  check (level in ('continent', 'country', 'admin_area_1', 'locality', 'poi', 'trail'));

insert into public.places (level, source, name)
select 'continent', 'manual', c
from unnest(array['Africa','Antarctica','Asia','Europe','North America','Oceania','South America']) as c
where not exists (select 1 from public.places p where p.level = 'continent' and p.name = c);

-- Name-keyed rather than ISO-keyed because that is what we actually have:
-- places rows come from Google Places, which gives a display name and no
-- country code. Seeded with common destinations -- an unmapped country keeps
-- a null parent and rolls up no further than itself, which is exactly
-- today's behaviour, so gaps degrade gracefully rather than breaking.
create table if not exists public.country_continents (
  country_name text primary key,
  continent_name text not null
);

insert into public.country_continents (country_name, continent_name) values
  ('United States','North America'),
  ('Canada','North America'),
  ('Mexico','North America'),
  ('Guatemala','North America'),
  ('Costa Rica','North America'),
  ('Panama','North America'),
  ('Cuba','North America'),
  ('Jamaica','North America'),
  ('Dominican Republic','North America'),
  ('Bahamas','North America'),
  ('Belize','North America'),
  ('Honduras','North America'),
  ('Nicaragua','North America'),
  ('El Salvador','North America'),
  ('Haiti','North America'),
  ('Brazil','South America'),
  ('Argentina','South America'),
  ('Chile','South America'),
  ('Peru','South America'),
  ('Colombia','South America'),
  ('Ecuador','South America'),
  ('Bolivia','South America'),
  ('Uruguay','South America'),
  ('Paraguay','South America'),
  ('Venezuela','South America'),
  ('Guyana','South America'),
  ('Suriname','South America'),
  ('United Kingdom','Europe'),
  ('Ireland','Europe'),
  ('France','Europe'),
  ('Germany','Europe'),
  ('Spain','Europe'),
  ('Portugal','Europe'),
  ('Italy','Europe'),
  ('Netherlands','Europe'),
  ('Belgium','Europe'),
  ('Switzerland','Europe'),
  ('Austria','Europe'),
  ('Norway','Europe'),
  ('Sweden','Europe'),
  ('Denmark','Europe'),
  ('Finland','Europe'),
  ('Iceland','Europe'),
  ('Poland','Europe'),
  ('Czechia','Europe'),
  ('Czech Republic','Europe'),
  ('Hungary','Europe'),
  ('Greece','Europe'),
  ('Croatia','Europe'),
  ('Romania','Europe'),
  ('Bulgaria','Europe'),
  ('Serbia','Europe'),
  ('Slovenia','Europe'),
  ('Slovakia','Europe'),
  ('Estonia','Europe'),
  ('Latvia','Europe'),
  ('Lithuania','Europe'),
  ('Ukraine','Europe'),
  ('Russia','Europe'),
  ('Turkey','Europe'),
  ('Malta','Europe'),
  ('Luxembourg','Europe'),
  ('Albania','Europe'),
  ('Japan','Asia'),
  ('China','Asia'),
  ('South Korea','Asia'),
  ('North Korea','Asia'),
  ('India','Asia'),
  ('Thailand','Asia'),
  ('Vietnam','Asia'),
  ('Indonesia','Asia'),
  ('Malaysia','Asia'),
  ('Singapore','Asia'),
  ('Philippines','Asia'),
  ('Cambodia','Asia'),
  ('Laos','Asia'),
  ('Myanmar','Asia'),
  ('Nepal','Asia'),
  ('Sri Lanka','Asia'),
  ('Pakistan','Asia'),
  ('Bangladesh','Asia'),
  ('Israel','Asia'),
  ('Jordan','Asia'),
  ('United Arab Emirates','Asia'),
  ('Saudi Arabia','Asia'),
  ('Qatar','Asia'),
  ('Oman','Asia'),
  ('Taiwan','Asia'),
  ('Hong Kong','Asia'),
  ('Mongolia','Asia'),
  ('Kazakhstan','Asia'),
  ('Georgia','Asia'),
  ('Armenia','Asia'),
  ('Azerbaijan','Asia'),
  ('Egypt','Africa'),
  ('Morocco','Africa'),
  ('Algeria','Africa'),
  ('Tunisia','Africa'),
  ('Libya','Africa'),
  ('South Africa','Africa'),
  ('Kenya','Africa'),
  ('Tanzania','Africa'),
  ('Uganda','Africa'),
  ('Ethiopia','Africa'),
  ('Ghana','Africa'),
  ('Nigeria','Africa'),
  ('Senegal','Africa'),
  ('Namibia','Africa'),
  ('Botswana','Africa'),
  ('Zimbabwe','Africa'),
  ('Zambia','Africa'),
  ('Mozambique','Africa'),
  ('Rwanda','Africa'),
  ('Madagascar','Africa'),
  ('Australia','Oceania'),
  ('New Zealand','Oceania'),
  ('Fiji','Oceania'),
  ('Papua New Guinea','Oceania'),
  ('Samoa','Oceania'),
  ('Tonga','Oceania'),
  ('Antarctica','Antarctica')
on conflict (country_name) do nothing;

-- Attach existing countries to their continent.
update public.places c
set parent_id = cont.id
from public.country_continents m
join public.places cont on cont.level = 'continent' and cont.name = m.continent_name
where c.level = 'country' and c.parent_id is null and c.name = m.country_name;

-- And attach future ones as they are cached. cachePlaceHierarchy inserts
-- country rows with no parent, so doing this in a trigger means the client
-- needs no knowledge of continents at all.
create or replace function public.set_country_continent()
returns trigger
language plpgsql
as $fn$
begin
  if new.level = 'country' and new.parent_id is null then
    select cont.id into new.parent_id
    from public.country_continents m
    join public.places cont on cont.level = 'continent' and cont.name = m.continent_name
    where m.country_name = new.name;
  end if;
  return new;
end;
$fn$;

drop trigger if exists places_set_country_continent on public.places;
create trigger places_set_country_continent
  before insert on public.places
  for each row execute function public.set_country_continent();

alter table public.country_continents enable row level security;
-- Reference data: readable by all, written only by migrations.
drop policy if exists "country_continents_select" on public.country_continents;
create policy "country_continents_select" on public.country_continents for select using (true);
