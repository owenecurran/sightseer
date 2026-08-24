import * as ImageManipulator from 'expo-image-manipulator';

// Longest edge after downscale. Photos were uploading at native camera
// resolution (measured live: average ~4100px, max 6000) — multi-MB files
// rendered into a ~400pt feed column. 2048 keeps comfortable headroom for
// the lightbox and any future 2x-column layout while cutting transfer size
// roughly an order of magnitude.
const MAX_EDGE = 2048;

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
  if (!Number.isFinite(longest) || longest <= MAX_EDGE) {
    return { uri, width, height, mimeType: mimeType ?? 'image/jpeg' };
  }
  const scale = MAX_EDGE / longest;
  const target = { width: Math.round(width * scale), height: Math.round(height * scale) };
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: target }], {
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
