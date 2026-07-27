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
    const { placeId } = await req.json();
    if (typeof placeId !== "string") {
      return Response.json({ error: "placeId is required" }, { status: 400 });
    }

    const { data: place, error } = await ctx.supabase
      .from("places")
      .select("id, name, level, boundary_geometry, parent:places!parent_id(name)")
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
    const query = place.parent?.name ? `${place.name}, ${place.parent.name}` : place.name;
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=1`;

    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!response.ok) {
      return Response.json({ error: `Nominatim request failed (${response.status})` }, { status: 502 });
    }
    const results = await response.json();
    const geojson = results[0]?.geojson;
    if (!geojson) {
      return Response.json({ error: "No boundary found for that place" }, { status: 404 });
    }

    const { error: storeError } = await ctx.supabase.rpc("store_place_boundary", {
      place_id: placeId,
      geojson,
    });
    if (storeError) {
      return Response.json({ error: storeError.message }, { status: 500 });
    }

    return Response.json({ ok: true, cached: false });
  }),
};
