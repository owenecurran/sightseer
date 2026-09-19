-- Close the PostgREST exposure the advisor flags on public.spatial_ref_sys.
--
-- spatial_ref_sys is PostGIS's own catalogue of spatial reference systems. It
-- is in public because the initial schema installs the extension with a bare
-- `create extension postgis`, which resolves to the first schema on the
-- search_path — and public is the schema PostgREST exposes. So the "RLS
-- disabled in public" lint fires on a table this project neither created nor
-- owns.
--
-- Its contents are not sensitive: ~8,500 rows of EPSG codes and proj4 strings,
-- identical in every PostGIS install anywhere. There is no policy worth
-- writing, because there is no row a given user should be prevented from
-- seeing. What is worth doing is not serving it over the API at all.
--
-- Two statements, for two different reasons:
--
--   1. The revoke is the actual fix, and it works. PostGIS grants select on
--      this table to PUBLIC, which anon and authenticated inherit; taking that
--      away removes /rest/v1/spatial_ref_sys without touching anything PostGIS
--      itself depends on.
--
--   2. Enabling RLS is the fix the linter is looking for, and it fails on the
--      hosted project — the table is owned by supabase_admin, and ownership is
--      what `alter table ... enable row level security` requires. It is
--      attempted anyway, guarded, because it does succeed on a local
--      `supabase start` stack where postgres is superuser, and because if the
--      ownership ever changes this should quietly start working rather than
--      need rediscovering.
--
-- Expect the lint to keep firing on the hosted project regardless. It reads
-- relrowsecurity, which statement 2 is not permitted to set, so a clean
-- advisor page is not actually available here. The exposure is closed either
-- way; the warning that remains is about a bit we cannot flip, not about
-- reachable data.
--
-- The upstream repair is `create extension postgis with schema extensions`, so
-- that none of PostGIS's tables ever land in an exposed schema. That is not
-- retrofittable in place: `alter extension ... set schema` does not survive
-- PostGIS's dependent types, and the drop-and-recreate route would take
-- places.geog and places_geog_idx with it. If this schema is ever rebuilt from
-- scratch, install it into extensions and delete this migration.

-- =========================================================================
-- revoke API access
-- =========================================================================

-- Safe to re-run: revoking a grant that is not held is a no-op, not an error.
-- Already applied by hand against the hosted project — this records it so a
-- database built from migrations comes up in the same state.
--
-- Nothing in this schema reads spatial_ref_sys. The only SRID calls are
-- ST_SetSRID, which stamps an SRID onto a geometry rather than looking one up;
-- ST_Transform, the function that would need the catalogue, is not used
-- anywhere. The geography paths (ST_DWithin, ST_Distance) carry their own
-- spheroid parameters for 4326.
revoke all on table public.spatial_ref_sys from anon, authenticated;

-- =========================================================================
-- attempt RLS
-- =========================================================================

do $$
begin
  alter table public.spatial_ref_sys enable row level security;

  -- Only reachable where the alter above succeeded. Permissive on purpose:
  -- PostGIS consults this catalogue itself, and a migration is not the place
  -- to discover which of its functions break when it goes dark under RLS. The
  -- revoke is what limits reach; this exists to satisfy the lint, not to
  -- restrict anybody.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'spatial_ref_sys'
      and policyname = 'spatial_ref_sys_select_all'
  ) then
    create policy "spatial_ref_sys_select_all" on public.spatial_ref_sys
      for select using (true);
  end if;
exception
  when insufficient_privilege then
    raise notice 'spatial_ref_sys: RLS left disabled (not table owner) — expected on hosted Supabase; the revoke above is the operative fix';
end;
$$;
