-- PostGIS relocation audit — READ ONLY, changes nothing.
-- Run in the Supabase SQL editor against the hosted project.
-- Run each section separately and keep the output of all seven.

-- ── 1. where postgis lives now, and whether `extensions` exists ──────────
select e.extname, e.extversion, n.nspname as installed_schema
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname like 'postgis%';

select exists (select 1 from pg_namespace where nspname = 'extensions') as extensions_schema_exists;


-- ── 2. data at risk ─────────────────────────────────────────────────────
-- geog is recomputable from lat/lng; boundary_geometry is NOT recoverable
-- from the database (only re-fetchable from Nominatim).
select
  count(*)                                          as places_total,
  count(geog)                                       as with_geog,
  count(boundary_geometry)                          as with_boundary,
  count(*) filter (where lat is null or lng is null) as missing_latlng
from public.places;


-- ── 3. every column anywhere using a postgis type ───────────────────────
-- Confirms `places` is the only table involved.
select table_schema, table_name, column_name, udt_name
from information_schema.columns
where udt_name in ('geometry', 'geography', 'box2d', 'box3d', 'spheroid')
order by 1, 2, 3;


-- ── 4. everything that depends on postgis ───────────────────────────────
-- This is the list `drop extension postgis` (no cascade) would refuse over.
-- These objects must be recreated by the migration.
with ext as (
  select oid from pg_extension where extname = 'postgis'
),
members as (
  select d.classid as mclassid, d.objid as mobjid
  from pg_depend d, ext
  where d.refclassid = 'pg_extension'::regclass
    and d.refobjid   = ext.oid
    and d.deptype    = 'e'
)
select distinct pg_describe_object(d.classid, d.objid, d.objsubid) as dependent_object
from pg_depend d
join members m
  on d.refclassid = m.mclassid
 and d.refobjid   = m.mobjid
where not exists (
  select 1 from members m2
  where m2.mclassid = d.classid and m2.mobjid = d.objid
)
and d.deptype in ('n', 'a')
order by 1;


-- ── 5. the silent breakers ──────────────────────────────────────────────
-- plpgsql bodies are opaque to the dependency tracker, so these survive the
-- drop and fail at runtime instead. `language sql` ones get cascade-dropped.
-- Both need search_path = public, extensions after the move.
select
  n.nspname || '.' || p.proname                       as function,
  l.lanname                                            as language,
  p.prosecdef                                          as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(none)') as current_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname = 'public'
  and (
    p.prosrc ~* '\mst_[a-z_]+\M'
    or p.prosrc ~* '\m(geography|geometry)\M'
    or pg_get_function_identity_arguments(p.oid) ~* '(geography|geometry)'
    or pg_get_function_result(p.oid) ~* '(geography|geometry)'
  )
order by l.lanname, p.proname;


-- ── 6. indexes on spatial columns ───────────────────────────────────────
select schemaname, tablename, indexname, indexdef
from pg_indexes
where indexdef ~* 'gist|geography|geometry'
  and schemaname = 'public'
order by tablename, indexname;


-- ── 7. search_path as currently configured ──────────────────────────────
-- Decides whether functions WITHOUT an explicit `set search_path` will still
-- resolve postgis once it lives in `extensions`.
select
  coalesce(d.datname, '<all databases>') as database,
  coalesce(r.rolname, '<all roles>')     as role,
  s.setconfig
from pg_db_role_setting s
left join pg_database d on d.oid = s.setdatabase
left join pg_roles    r on r.oid = s.setrole
order by 1, 2;
