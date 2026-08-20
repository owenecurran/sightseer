-- Teaches the area functions about the continent tier. Without this the
-- rows exist but nothing consults them: both functions filter on an
-- explicit level list, and majority_area falls back to a country.

create or replace function public.majority_area(p_ids uuid[])
returns uuid
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    select u.ord, u.pid as leaf_id, u.pid as anc_id
    from unnest(p_ids) with ordinality as u(pid, ord)
    union all
    select c.ord, c.leaf_id, pl.parent_id
    from chain c join public.places pl on pl.id = c.anc_id
    where pl.parent_id is not null
  ),
  ranked as (
    select c.anc_id, a.level, count(*) as n
    from chain c join public.places a on a.id = c.anc_id
    where a.level in ('locality', 'admin_area_1', 'country', 'continent')
    group by c.anc_id, a.level
  ),
  total as (select cardinality(p_ids) as n)
  select coalesce(
    (select r.anc_id from ranked r, total t
      where r.level = 'locality' and r.n * 2 > t.n order by r.n desc, r.anc_id limit 1),
    (select r.anc_id from ranked r, total t
      where r.level = 'admin_area_1' and r.n * 2 > t.n order by r.n desc, r.anc_id limit 1),
    (select r.anc_id from ranked r, total t
      where r.level = 'country' and r.n * 2 > t.n order by r.n desc, r.anc_id limit 1),
    -- No single country holds a majority: several countries in one trip is
    -- exactly the "continent trip" case, so roll up rather than picking
    -- whichever country happens to have the most reviews.
    (select r.anc_id from ranked r
      where r.level = 'continent' order by r.n desc, r.anc_id limit 1),
    (select r.anc_id from ranked r
      where r.level = 'country' order by r.n desc, r.anc_id limit 1),
    public.deepest_common_area(p_ids)
  );
$fn$;

create or replace function public.deepest_common_area(p_ids uuid[])
returns uuid
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    select id as leaf_id, id as anc_id from public.places where id = any(p_ids)
    union all
    select c.leaf_id, pl.parent_id
    from chain c join public.places pl on pl.id = c.anc_id
    where pl.parent_id is not null
  ),
  leaf_count as (select count(distinct id) as n from public.places where id = any(p_ids)),
  common as (
    select c.anc_id
    from chain c join public.places a on a.id = c.anc_id
    where a.level in ('locality', 'admin_area_1', 'country', 'continent')
    group by c.anc_id, a.level
    having count(distinct c.leaf_id) = (select n from leaf_count)
    order by case a.level
               when 'locality' then 4 when 'admin_area_1' then 3
               when 'country' then 2 else 1 end desc
    limit 1
  ),
  fallback as (
    select c.anc_id
    from chain c join public.places a on a.id = c.anc_id
    where a.level = 'continent'
    group by c.anc_id
    order by count(distinct c.leaf_id) desc, c.anc_id
    limit 1
  )
  select anc_id from common
  union all
  select anc_id from fallback where not exists (select 1 from common)
  limit 1;
$fn$;

-- The level picker offers continents too, so a trip auto-named "Europe" can
-- be narrowed, and a country-level one widened.
create or replace function public.get_place_ancestry(p_id uuid)
returns table (id uuid, name text, level text, depth int)
language sql stable security definer set search_path = public
as $fn$
  with recursive chain as (
    select pl.id, pl.name, pl.level, pl.parent_id, 0 as depth
    from public.places pl where pl.id = p_id
    union all
    select pl.id, pl.name, pl.level, pl.parent_id, c.depth + 1
    from chain c join public.places pl on pl.id = c.parent_id
  )
  select c.id, c.name, c.level, c.depth
  from chain c
  where c.level in ('locality', 'admin_area_1', 'country', 'continent')
  order by c.depth;
$fn$;
