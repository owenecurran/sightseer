import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

// Nominatim's own boundary GeoJSON, not raw Overpass relation members —
// avoids hand-assembling rings from ways. Same OSM data family already
// used in this project for trails (Overpass). Fair-use policy requires a
// real identifying User-Agent and caps at 1 request/second — acceptable
// here since this only ever runs once per place (result is cached
// permanently in `places.boundary_geometry`, shared across every user).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "alien-app (contact: owenecurran@gmail.com)";

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

    const body = await req.json().catch(() => null);
    const placeId = body?.placeId;
    if (typeof placeId !== "string") {
      return Response.json({ error: "placeId is required" }, { status: 400 });
    }

    const { data: place, error } = await ctx.supabase
      .from("places")
      .select("name, level, boundary_geometry, parent_id")
      .eq("id", placeId)
      .single();

    if (error || !place) {
      return Response.json({ error: "Place not found" }, { status: 404 });
    }
    if (place.level !== "country" && place.level !== "admin_area_1") {
      return Response.json({ error: "Only country/admin_area_1 places have boundaries" }, { status: 400 });
    }
    if (place.boundary_geometry) {
      return Response.json({ ok: true, cached: true });
    }

    // Include the parent (country) name for admin_area_1 disambiguation —
    // "Colorado" alone is ambiguous globally, "Colorado, United States" isn't.
    let query = place.name;
    if (place.level === "admin_area_1" && place.parent_id) {
      const { data: country, error: countryError } = await ctx.supabase
        .from("places").select("name").eq("id", place.parent_id).single();
      if (countryError || !country) return Response.json({ error: "Region's country not found" }, { status: 404 });
      query = `${place.name}, ${country.name}`;
    }
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=1`;

    let geojson;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
      const results = await response.json();
      geojson = results[0]?.geojson;
    } catch (err) {
      console.error("fetch-place-boundary: provider lookup", err);
      return Response.json({ error: "Could not look up the boundary" }, { status: 502 });
    }
    if (geojson?.type !== "Polygon" && geojson?.type !== "MultiPolygon") {
      return Response.json({ error: "No boundary found for that place" }, { status: 404 });
    }

    const { error: storeError } = await ctx.supabaseAdmin.rpc("store_place_boundary", {
      place_id: placeId,
      geojson,
    });
    if (storeError) {
      console.error("fetch-place-boundary: cache write", storeError);
      return Response.json({ error: "Could not cache the boundary" }, { status: 500 });
    }

    return Response.json({ ok: true, cached: false });
  }),
};
