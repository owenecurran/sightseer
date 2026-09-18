import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { VisitCard, type VisitCardVisit } from '@/components/visit-card';
import { MaxContentWidth, Spacing } from '@/constants/theme';

// A gallery of postcards with made-up data, behind no session.
//
// Every screen that renders a card is signed-in, which makes the web build
// awkward to look at: checking a layout meant having a session in whatever
// browser was doing the checking. This renders the card directly, from
// fixtures, so `node scripts/web-shot.mjs dev-postcards` is the whole loop.
//
// DEV ONLY. The route is exempted from the signed-out redirect in
// _layout.tsx under the same __DEV__ check, so it does not exist in a release
// build at all — see that file. Fixtures rather than a real review on purpose:
// the cases worth looking at are the LAYOUTS (a square picture, a wide one, a
// grid, none at all), and waiting for a feed to happen to contain all four is
// not a test.

// Public domain photographs at known aspect ratios, so each card below
// exercises the branch it is named for rather than whatever the network
// happened to return.
const WIDE = 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=800&fit=crop';
const TALL = 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=1200&fit=crop';
const SQUARE = 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1000&h=1000&fit=crop';
// Two shapes that do NOT match a frame, and so leave bare card for the stamp
// and the stickers to sit in. Every other fixture here happens to match its
// frame exactly (1.5 on a landscape card, 0.667 on a portrait one), which
// means none of them showed a front stamp at all — the preview was silently
// missing the whole ornament branch.
const NARROW = 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&h=1000&fit=crop';
const PANORAMA =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1600&h=667&fit=crop';

type Case = {
  key: string;
  label: string;
  photos: { url: string; ratio: number }[];
  rating: number | null;
  // Enough tags to make the sticker row wrap. Left out means the usual two.
  tags?: { slug: string; label: string }[];
  // Overrides the fixture's place name, for cases about name length.
  placeName?: string;
  stateCountry?: string;
  // The visit id to build the fixture with. headlineTreatmentFor hashes this
  // to pick a face and an effect, so spelling it out is the only way to see a
  // GIVEN treatment on demand — otherwise which ones a preview shows is
  // whatever the fixture keys happened to hash to, and half the vocabulary
  // never appears at all. See TREATMENTS.
  id?: string;
};

const MANY_TAGS = [
  { slug: 'scenic-location', label: 'Scenic location' },
  { slug: 'great-trails', label: 'Great trails' },
  { slug: 'open-water', label: 'Open water' },
  { slug: 'walkable', label: 'Walkable' },
  { slug: 'family-friendly', label: 'Family friendly' },
  { slug: 'worth-the-detour', label: 'Worth the detour' },
];

const CASES: Case[] = [
  { key: 'wide', label: 'One wide photo', photos: [{ url: WIDE, ratio: 1.5 }], rating: 8.4 },
  { key: 'tall', label: 'One tall photo', photos: [{ url: TALL, ratio: 0.667 }], rating: 6.1 },
  {
    key: 'square',
    label: 'Square — caption printed below',
    photos: [{ url: SQUARE, ratio: 1 }],
    rating: 9.2,
  },
  {
    key: 'grid',
    label: 'Four photos',
    photos: [
      { url: WIDE, ratio: 1.5 },
      { url: SQUARE, ratio: 1 },
      { url: TALL, ratio: 0.667 },
      { url: WIDE, ratio: 1.5 },
    ],
    rating: 7.0,
  },
  { key: 'none', label: 'No photos — map stands in', photos: [], rating: null },
  {
    key: 'narrow',
    label: 'Narrower than the frame — columns of bare card, stamp in one',
    photos: [{ url: NARROW, ratio: 1.2 }],
    rating: 8.8,
  },
  {
    key: 'panorama',
    label: 'Wider than the frame — bands top and bottom, stamp and stickers',
    photos: [{ url: PANORAMA, ratio: 2.4 }],
    rating: 5.5,
  },
  {
    key: 'shortname',
    // A SHORT name, which is the case that exposed the broader location line
    // running past it: fill is capped, so a short name stops well short of
    // its box while the line was still aligning to the box's edge.
    label: 'Short name — the region line must stay within it',
    photos: [{ url: WIDE, ratio: 1.5 }],
    rating: 9.0,
    id: 'fx-3',
    placeName: 'Bath',
  },
  {
    key: 'shortright',
    // The same short name, drawn on the RIGHT margin. It has to end where the
    // name ends, not at the card's edge.
    label: 'Short name, right margin — ends where the name ends',
    photos: [{ url: WIDE, ratio: 1.5 }],
    rating: 9.0,
    id: 'fx-12',
    placeName: 'Bath',
    // A region string far wider than the name it must stay inside.
    stateCountry: 'Illinois, United States',
  },
  {
    key: 'cutoff',
    // A reported card: a long name with the region line above-right, where
    // the line looked cut off at the card's edge.
    label: 'Long name, region above-right, no rating — reported as cut off',
    photos: [{ url: WIDE, ratio: 1.5 }],
    // No rating, so no stamp in the top-right corner — which is what leaves
    // the region line on the right margin instead of being moved clear.
    rating: null,
    id: 'fx-0',
    placeName: 'Greene Valley Scenic Overlook',
    // Deep descenders (g, y, p, j) — the shape that exposes a line box cut
    // too short for these faces.
    stateCountry: 'Patagonia, Paraguay',
  },
  {
    key: 'descenders',
    // A face with real lowercase descenders, on a descender-heavy string.
    label: 'Lowercase region face — descenders must survive',
    photos: [{ url: WIDE, ratio: 1.5 }],
    rating: null,
    id: 'fx-2',
    placeName: 'Greene Valley Scenic Overlook',
    stateCountry: 'Patagonia, Paraguay',
  },
  {
    key: 'nameinband',
    // Two labels WOULD fit the band, but this card's name is set along the
    // foot — the same strip — so they belong on the back instead.
    label: 'Name along the foot — the band is the name’s, so no stickers',
    photos: [{ url: PANORAMA, ratio: 2.4 }],
    rating: 7.1,
    id: 'dev-band-0',
  },
  {
    key: 'manytags',
    // Six labels will not fit the band on one row. They must drop off the
    // front entirely rather than wrap up over the photograph.
    label: 'Six tags — too many for the band, so none on the front',
    photos: [{ url: PANORAMA, ratio: 2.4 }],
    rating: 6.7,
    tags: MANY_TAGS,
    id: 'dev-panorama',
  },
];

// Every face-and-effect pair in headline-style.ts, on one photograph.
//
// The ids are not decorative: headlineTreatmentFor picks the face from
// hashSeed(`headline-face:${id}`) and the effect from
// hashSeed(`headline-effect:${id}`), so these were SEARCHED for — the first
// id of the form fx-N that lands on each pair. If either hash or either list
// changes, they stop meaning what their labels say, and the search has to be
// run again. The point is to be able to look at a treatment on purpose
// instead of scrolling a feed until one turns up.
const TREATMENTS: { id: string; label: string }[] = [
  { id: 'fx-0', label: 'serif · none' },
  { id: 'fx-7', label: 'serif · softShadow' },
  { id: 'fx-6', label: 'condensed · none' },
  { id: 'fx-5', label: 'condensed · softShadow' },
  { id: 'fx-20', label: 'condensed · outlineCentred' },
  { id: 'fx-23', label: 'condensed · floatingColor' },
  { id: 'fx-26', label: 'condensed · outlineTopLeft' },
  { id: 'fx-10', label: 'condensed · extrudeUpRight' },
  { id: 'fx-15', label: 'condensed · borderOut' },
  { id: 'fx-2', label: 'deco · outlineCentred' },
  { id: 'fx-1', label: 'deco · outlineTopLeft' },
  { id: 'fx-4', label: 'deco · extrudeUpRight' },
  { id: 'fx-18', label: 'deco · borderOut' },
];

const TREATMENT_CASES: Case[] = TREATMENTS.map(({ id, label }) => ({
  key: id,
  id,
  label,
  photos: [{ url: WIDE, ratio: 1.5 }],
  rating: 7.4,
}));

function fixture({ key, photos, rating, id, tags, placeName, stateCountry }: Case): VisitCardVisit {
  return {
    id: id ?? `dev-${key}`,
    rating,
    note: 'A short message on the written side, so the back has something on it.',
    visited_on: '2026-08-14',
    created_at: '2026-08-14T12:00:00Z',
    user_id: 'dev-user',
    authorName: 'Preview',
    placeId: 'dev-place',
    placeName: placeName ?? 'Saint-Michel-de-Provence',
    placeLat: 43.6,
    placeLng: 5.1,
    placeLevel: 'locality',
    stateCountry: stateCountry ?? 'Provence, France',
    photoIds: photos.map((_, index) => `${key}-${index}`),
    photoAspectRatios: photos.map((photo) => photo.ratio),
    likeCount: 3,
    isLikedByMe: false,
    taggedUsers: [],
    taggedPlaces: [],
    tags: tags ?? [
      { slug: 'scenic-location', label: 'Scenic location' },
      { slug: 'great-trails', label: 'Great trails' },
    ],
    commentCount: 0,
    isViewerTagged: false,
    card: { stock: null, grain: null, stamp: null, orientation: null, side: null },
  };
}

function noop() {}

export default function DevPostcards() {
  return (
    <ThemedView type="screen" style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.column}>
          {[...TREATMENT_CASES, ...CASES].map((testCase) => {
            const visit = fixture(testCase);
            const photoUrls: Record<string, string> = {};
            testCase.photos.forEach((photo, index) => {
              photoUrls[`${testCase.key}-${index}`] = photo.url;
            });

            return (
              // nativeID renders as a DOM `id` on web, which is what makes a
              // layout check scriptable: `node scripts/web-shot.mjs` can only
              // show a picture, and "does the name stay inside the card" is a
              // question about two rectangles, not about a picture.
              <View key={testCase.key} nativeID={`case-${testCase.key}`} style={styles.case}>
                <ThemedText type="sectionLabel" themeColor="textSecondary">
                  {testCase.label}
                </ThemedText>
                <VisitCard
                  visit={visit}
                  photoUrls={photoUrls}
                  isOwner
                  isCopied={false}
                  onToggleLike={noop}
                  onShare={noop}
                  onDeleted={noop}
                />
              </View>
            );
          })}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingVertical: Spacing.three,
  },
  // The feed's own reading column, copied from the `list` style in
  // (tabs)/index.tsx. Without it this route was a lie on a desktop browser:
  // the cards stretched to whatever the window was — 2560px on a 1440p
  // monitor — while the real feed caps them at MaxContentWidth. Anything
  // measured here about how big a card is, or about how big a stamp looks ON
  // one, was measured at a width the app never actually renders.
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  case: {
    gap: Spacing.two,
  },
});
