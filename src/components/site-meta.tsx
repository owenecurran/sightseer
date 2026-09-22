import { Platform } from 'react-native';

import Head from 'expo-router/head';
import { usePathname } from 'expo-router';

import { SITE_ORIGIN } from '@/lib/site';

// The link-preview card every route falls back to.
//
// These tags used to live inside WebLanding, which meant only the two routes
// that render it — `/welcome` and `/i/[code]` — had any. Everything else
// shipped with an empty <title> and no OG tags at all, including the bare
// domain, which is the URL someone actually types when telling a friend
// about the app. Pasted into a message it produced no card whatsoever.
//
// Rendered from the root navigator rather than per-screen so that it covers
// routes which never render their own head — and, more importantly, so it
// survives the `isLoading` early return up there. Web prerendering runs in
// Node where the auth session never resolves, so for most paths that early
// return is the ONLY thing a crawler ever sees.
//
// A screen that knows more than this can still override it: expo-router's
// Head is react-helmet underneath, and the deepest mounted Head wins per
// tag. That is the intended path for per-review and per-profile cards
// later; it needs the data rendered server-side, which is a larger job.

export const SITE_NAME = 'Sightseer';
export const SITE_TITLE = 'Sightseer — keep the places you have been';
export const SITE_DESCRIPTION =
  'Record where you have been, rate it, and share that with people you choose.';

// Absolute, opaque, and 1200x630 — see scripts/generate-og-image.js for why
// each of those three matters. Served from public/ at the site root, which
// is as stable as the domain: the landing photos are signed URLs that
// expire, so a crawler refetching one later would get a 403 and show a
// broken card.
export const SITE_OG_IMAGE = `${SITE_ORIGIN}/sightseer-og.png`;

export function SiteMeta() {
  const pathname = usePathname();

  // Purely a web concern. Bailing before rendering Head rather than relying
  // on it being inert on native keeps this from having any native surface
  // at all — it is mounted in the root navigator, which is the last place
  // worth taking a risk in.
  if (Platform.OS !== 'web') return null;

  // Canonicalises each page to itself, so a link that picked up tracking
  // params on its way through a messaging app still previews as the page it
  // points at rather than as a second, separate card.
  //
  // Emitted ONLY for concrete paths. Web prerendering runs once per route at
  // build time and the server hands that same file to every request, so on a
  // dynamic route `pathname` is the route PATTERN — `/visit/[id]`, not
  // `/visit/7f3a…`. usePathname is correct once the client hydrates, but a
  // crawler never gets that far: it reads the HTML and leaves. Publishing
  // `og:url = https://sightseer.world/visit/[id]` would tell every scraper
  // that honours it to canonicalise each shared review onto one page that
  // does not exist, which is a good deal worse than saying nothing and
  // letting it fall back to the URL it requested. Verified against `expo
  // serve` over the real export rather than assumed.
  const isConcretePath = !pathname.includes('[');
  const url = `${SITE_ORIGIN}${pathname === '/' ? '' : pathname}`;

  return (
    <Head>
      <title>{SITE_TITLE}</title>
      <meta name="description" content={SITE_DESCRIPTION} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={SITE_TITLE} />
      <meta property="og:description" content={SITE_DESCRIPTION} />
      <meta property="og:type" content="website" />
      {isConcretePath ? <meta property="og:url" content={url} /> : null}
      <meta property="og:image" content={SITE_OG_IMAGE} />
      {/* Stated explicitly because several clients lay the card out before
          they have finished fetching the image, and guess wrong without
          them — the small square card is the usual wrong guess. */}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={`The ${SITE_NAME} mark`} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={SITE_TITLE} />
      <meta name="twitter:description" content={SITE_DESCRIPTION} />
      <meta name="twitter:image" content={SITE_OG_IMAGE} />
    </Head>
  );
}
