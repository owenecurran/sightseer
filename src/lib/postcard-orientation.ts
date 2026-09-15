// Which way up a review's postcard sits.
//
// Two modes and only two. The card used to take whatever height its photos
// happened to imply, so a feed was a column of rectangles of a dozen
// different proportions and nothing read as an object. A postcard is
// landscape or portrait; the pictures fit inside whichever it is, rather
// than deciding it one photo at a time.
//
// The choice also drives the back: a landscape card has width to spare
// beside the message, so the map there is a block you can actually read a
// location off; a portrait one does not, and gets a thumbnail down in the
// action row instead.

export type PostcardOrientation = 'horizontal' | 'vertical';

// Width ÷ height of the picture side. The real thing is 6x4 inches and its
// portrait twin is 4x6, so these are those.
export const POSTCARD_FRAME_RATIO: Record<PostcardOrientation, number> = {
  horizontal: 3 / 2,
  vertical: 2 / 3,
};

export function orientationForPhotos(
  aspectRatios: (number | null)[],
  photoCount: number,
): PostcardOrientation {
  // No photos: the place's map stands in as the picture, and it is a wide
  // image.
  if (photoCount === 0) return 'horizontal';

  // One photo decides for itself — a portrait shot in a landscape frame is
  // mostly the middle third of someone's head.
  if (photoCount === 1) {
    const ratio = aspectRatios[0];
    return ratio != null && ratio < 1 ? 'vertical' : 'horizontal';
  }

  // Two or more tile into a wide block far more naturally than a tall one:
  // two squares side by side is already 2:1 before the frame gets a say.
  return 'horizontal';
}
