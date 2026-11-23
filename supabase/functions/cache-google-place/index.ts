import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { longText?: string; types: string[] }[];
};

const FOOD_DRINK_TYPES = new Set([
  "restaurant", "bar", "pub", "cocktail_bar", "wine_bar", "sports_bar", "lounge_bar",
  "cafe", "coffee_shop", "tea_house", "bakery", "ice_cream_shop", "brewery", "food",
]);

function placeCategory(types: string[]) {
  if (types.includes("national_park")) return "national_park";
  if (types.some((type) => ["beach", "lake", "river", "island"].includes(type))) return "water";
  if (types.some((type) => ["hiking_area", "nature_preserve", "scenic_spot"].includes(type))) return "trail";
  if (types.some((type) => type.endsWith("_restaurant") || FOOD_DRINK_TYPES.has(type))) return "food_drink";
  return null;
}

// Place Details returns address components but not the database's ancestry.
// Keep the same country, state, locality and POI hierarchy as the app.
const ADDRESS_LEVELS = [
  { type: "country", level: "country" },
  { type: "administrative_area_level_1", level: "admin_area_1" },
  { type: "locality", level: "locality" },
];

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

    const body = await req.json().catch(() => null);
    const placeId = body?.placeId;
    if (typeof placeId !== "string" || !/^[A-Za-z0-9_-]{1,512}$/.test(placeId)) {
      return Response.json({ error: "Invalid Google place ID" }, { status: 400 });
    }

    const { data: cached, error: cacheError } = await ctx.supabase
      .from("places").select("*").eq("google_place_id", placeId).maybeSingle();
    if (cacheError) {
      console.error("cache-google-place: cache lookup", cacheError);
      return Response.json({ error: "Could not load the place" }, { status: 500 });
    }
    if (cached) return Response.json({ place: cached });

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      console.error("cache-google-place: missing GOOGLE_PLACES_API_KEY");
      return Response.json({ error: "Place lookup is unavailable" }, { status: 503 });
    }
    const { data: allowed, error: quotaError } = await ctx.supabase.rpc("take_google_place_lookup_quota");
    if (quotaError) {
      console.error("cache-google-place: quota", quotaError);
      return Response.json({ error: "Could not load the place" }, { status: 500 });
    }
    if (!allowed) return Response.json({ error: "Place lookup limit reached. Try again later." }, { status: 429 });

    let details: GooglePlace;
    try {
      const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,displayName,types,location,addressComponents",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 404) return Response.json({ error: "Place not found" }, { status: 404 });
      if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
      details = await response.json();
    } catch (err) {
      console.error("cache-google-place: provider lookup", err);
      return Response.json({ error: "Could not verify the place" }, { status: 502 });
    }

    const name = details.displayName?.text?.trim();
    const lat = details.location?.latitude;
    const lng = details.location?.longitude;
    if (!details.id || !name || typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return Response.json({ error: "The place has incomplete details" }, { status: 422 });
    }

    const types = details.types ?? [];
    const selectedIndex = ADDRESS_LEVELS.findIndex(({ type }) => types.includes(type));
    const ancestors = selectedIndex === -1 ? ADDRESS_LEVELS : ADDRESS_LEVELS.slice(0, selectedIndex);
    const path = ancestors.flatMap(({ type, level }) => {
      const component = details.addressComponents?.find((c) => c.types.includes(type));
      const name = component?.longText?.trim();
      return name ? [{ level, name }] : [];
    });
    path.push({ level: ADDRESS_LEVELS[selectedIndex]?.level ?? "poi", name });

    const { data: place, error: writeError } = await ctx.supabaseAdmin.rpc("cache_google_place", {
      p_google_place_id: details.id,
      p_lat: lat,
      p_lng: lng,
      p_category: placeCategory(types),
      p_path: path,
    }).single();
    if (writeError || !place) {
      console.error("cache-google-place: cache write", writeError);
      return Response.json({ error: "Could not cache the place" }, { status: 500 });
    }
    return Response.json({ place });
  }),
};
