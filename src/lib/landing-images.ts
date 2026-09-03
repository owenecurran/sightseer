import { supabase } from '@/lib/supabase';

// The photo pool the welcome screen's road draws from.
//
// Curated by admins into `landing_images` and signed by the
// get-landing-image-urls edge function, which is one of only two
// unauthenticated functions in this project — this screen renders before
// anyone has a session, so there is nothing to authenticate with.
//
// Returns an empty list rather than throwing. This is the first thing a new
// install shows, often on a bad connection, and the screen is designed to
// stand on its own without the road behind it. A blank first impression
// because a decorative query failed would be the worst possible outcome.
export async function getLandingImageUrls(): Promise<string[]> {
  try {
    const { data, error } = await supabase.functions.invoke('get-landing-image-urls', {
      // No body: the function takes no input on purpose, so an anonymous
      // caller cannot ask it to sign anything an admin has not curated.
      body: {},
    });
    if (error) return [];
    const { urls } = data as { urls: { id: string; url: string }[] };
    return urls.map((entry) => entry.url);
  } catch {
    return [];
  }
}
