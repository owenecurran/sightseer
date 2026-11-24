import { putImageBlob, readImageBlob, requestImageUpload } from '@/lib/media-upload';
import { downscaleForUpload, makeThumbForUpload } from '@/lib/photo-downscale';
import { supabase } from '@/lib/supabase';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type PhotoSource = {
  uri: string;
  mimeType?: string;
  width: number;
  height: number;
};

type UploadPhotoParams = PhotoSource & {
  visitId: string;
  position?: number;
};

export async function uploadReviewPhotoAssets(
  target: { visitId: string } | { draftId: string },
  { uri, width, height, mimeType }: PhotoSource,
) {
  const scaled = await downscaleForUpload(uri, width, height, mimeType);
  if (!ALLOWED_CONTENT_TYPES.includes(scaled.mimeType)) {
    throw new Error(`Cannot upload ${scaled.mimeType}. The image was not converted.`);
  }

  const image = await readImageBlob(scaled.uri);
  // The grid can fall back to the original if thumbnail preparation fails.
  const thumbnail = await makeThumbForUpload(scaled.uri, scaled.width, scaled.height)
    .then((thumb) => readImageBlob(thumb.uri))
    .catch(() => null);
  const endpoint = 'visitId' in target ? 'create-photo-upload-url' : 'create-draft-photo-upload-url';
  const urls = await requestImageUpload(endpoint, { ...target, contentType: scaled.mimeType }, image, thumbnail);
  await putImageBlob(urls.uploadUrl, image, scaled.mimeType);

  let storedThumbKey: string | null = null;
  if (thumbnail && urls.thumbUploadUrl && urls.thumbR2Key) {
    try {
      await putImageBlob(urls.thumbUploadUrl, thumbnail, 'image/jpeg');
      storedThumbKey = urls.thumbR2Key;
    } catch {
      // Keep the original when its thumbnail cannot be uploaded.
    }
  }

  return { r2Key: urls.r2Key, storedThumbKey, width: scaled.width, height: scaled.height };
}

export async function uploadPhotoForVisit(params: UploadPhotoParams): Promise<string> {
  const { visitId, position = 0 } = params;
  const { r2Key, storedThumbKey, width, height } = await uploadReviewPhotoAssets({ visitId }, params);
  const { error: insertError } = await supabase.from('photos').insert({
    visit_id: visitId,
    r2_key: r2Key,
    thumb_r2_key: storedThumbKey,
    width,
    height,
    position,
  });
  if (insertError) throw insertError;
  return r2Key;
}
