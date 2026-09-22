import * as ImageManipulator from 'expo-image-manipulator';

// Longest edge after downscale. Photos were uploading at native camera
// resolution (measured live: average ~4100px, max 6000) — multi-MB files
// rendered into a ~400pt feed column. 2048 keeps comfortable headroom for
// the lightbox and any future 2x-column layout while cutting transfer size
// roughly an order of magnitude.
const MAX_EDGE = 2048;

// What a browser will actually decode.
//
// HEIC is the one that matters and the reason this list exists. An iPhone
// set to "High Efficiency" hands the picker a .heic, and nine photos in
// production are intact HEIC files sitting under .jpeg keys because nothing
// on the way in ever re-encoded them — every non-Apple client refuses to
// draw them. See scripts/audit-photo-objects.py, which is what found them.
const WEB_SAFE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Downscaled = { uri: string; width: number; height: number; mimeType: string };

// Applied inside the uploaders (not at each picker call site) so every path
// into R2 — review form, bulk upload, in-app camera, drafts — is covered
// without remembering to. EXIF is stripped by the re-encode; that's fine:
// bulk upload reads GPS/date from the picker asset BEFORE upload, and
// serving location-stripped files to other users is a privacy improvement,
// not a loss.
export async function downscaleForUpload(
  uri: string,
  width: number,
  height: number,
  mimeType?: string
): Promise<Downscaled> {
  const longest = Math.max(width, height);
  const isOversized = Number.isFinite(longest) && longest > MAX_EDGE;
  // Unknown counts as unsafe. A caller that does not know what it picked up
  // is exactly the caller whose file needs converting, and the old code's
  // `mimeType ?? 'image/jpeg'` turned that missing knowledge into an
  // assertion — which is how HEIC ended up labelled as JPEG.
  const isUnsafeType = !mimeType || !WEB_SAFE_TYPES.includes(mimeType);

  // Nothing to do only when it is BOTH small enough and already a format the
  // web can read. Size alone was the old condition, and it let every small
  // HEIC through untouched.
  if (!isOversized && !isUnsafeType) {
    return { uri, width, height, mimeType };
  }

  // No resize action when the image is already small enough — this pass is
  // then purely a format conversion, and asking for a resize to its own
  // dimensions would be a needless resample. An unknown size lands here too:
  // it cannot be scaled sensibly, but it can still be re-encoded.
  const actions: ImageManipulator.Action[] = [];
  if (isOversized) {
    const scale = MAX_EDGE / longest;
    actions.push({
      resize: { width: Math.round(width * scale), height: Math.round(height * scale) },
    });
  }

  const result = await ImageManipulator.manipulateAsync(uri, actions, {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg' };
}

// Longest edge for the grid derivative. A feed grid tile is roughly 180pt
// wide, so ~540px on a 3x screen; 800 leaves headroom for a wider tablet
// column without carrying anything like the full image's weight.
const THUMB_MAX_EDGE = 800;

// The small copy served to multi-photo grids. Always produced, even for an
// image already under the limit, so every new photo has a derivative and the
// client never has to reason about which ones do.
export async function makeThumbForUpload(
  uri: string,
  width: number,
  height: number
): Promise<Downscaled> {
  const longest = Math.max(width, height);
  const scale = Number.isFinite(longest) && longest > 0 ? Math.min(1, THUMB_MAX_EDGE / longest) : 1;
  const target = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: target }], {
    // Lower quality than the full image on purpose: at grid size the
    // artefacts are invisible and the saving is most of the point.
    compress: 0.7,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height, mimeType: 'image/jpeg' };
}
