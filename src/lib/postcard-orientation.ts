// Which way up a review's postcard sits, and how its picture sits inside it.
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

  // The average of whatever ratios are known. This used to look at the
  // single-photo case only and hand every multi-photo post a landscape
  // frame regardless — so a pair of portrait shots got a landscape card,
  // which is exactly the thing the orientation exists to avoid. Nulls are
  // dropped rather than counted as 1: an unmeasured photo should not drag
  // the average toward square, it should simply not vote.
  const known = aspectRatios.slice(0, photoCount).filter((r): r is number => r != null && r > 0);
  if (known.length === 0) return 'horizontal';

  const mean = known.reduce((sum, ratio) => sum + ratio, 0) / known.length;
  // A square picture goes on a portrait card, not a landscape one. It fits
  // neither, so the question is what to do with what is left over — and a tall
  // card leaves one clean band under the picture, which the place name fills.
  // A landscape card would leave two thin columns either side of it instead,
  // which is room for nothing.
  if (isSquarish(mean)) return 'vertical';
  return mean < 1 ? 'vertical' : 'horizontal';
}

// How far from square still counts as square. Wide enough to catch a 4:5 or a
// 5:4 crop, which is what most "square" photos actually are once a phone has
// been at them.
const SQUARE_LOW = 0.86;
const SQUARE_HIGH = 1.16;

export function isSquarish(ratio: number | null): boolean {
  return ratio != null && ratio >= SQUARE_LOW && ratio <= SQUARE_HIGH;
}

export type PictureFit = {
  width: number;
  height: number;
  // Cream left over on each side once the picture is fitted inside the
  // frame. One pair is always zero — a picture can only fall short of the
  // frame on one axis.
  sideBand: number;
  topBand: number;
};

// The picture is fitted inside the frame, not cropped to fill it, so what
// is left over is card. That leftover is the only place the stamp and the
// tag stickers are allowed to go on the picture side: a review whose photo
// happens to match the frame gets a clean picture and carries both on the
// back instead.
export function fitPicture(
  frameWidth: number,
  frameHeight: number,
  pictureRatio: number | null,
): PictureFit {
  if (frameWidth <= 0 || frameHeight <= 0 || pictureRatio == null || pictureRatio <= 0) {
    return { width: frameWidth, height: frameHeight, sideBand: 0, topBand: 0 };
  }

  const frameRatio = frameWidth / frameHeight;
  if (pictureRatio > frameRatio) {
    // Wider than the frame: full width, short of the height.
    const height = frameWidth / pictureRatio;
    return { width: frameWidth, height, sideBand: 0, topBand: (frameHeight - height) / 2 };
  }

  const width = frameHeight * pictureRatio;
  return { width, height: frameHeight, sideBand: (frameWidth - width) / 2, topBand: 0 };
}
