import { downscaleForUpload } from '@/lib/photo-downscale';
import { supabase } from '@/lib/supabase';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type UploadPhotoParams = {
  visitId: string;
  uri: string;
  mimeType?: string;
  width: number;
  height: number;
  position?: number;
};

// Client never touches R2 credentials: a Supabase Edge Function (which owns
// the R2 secrets) issues a short-lived presigned PUT URL after confirming the
// visit belongs to the caller, the client uploads directly to R2 with it,
// then the resulting key is recorded in Postgres.
export async function uploadPhotoForVisit(params: UploadPhotoParams): Promise<string> {
  const { visitId, uri, mimeType, width, height, position = 0 } = params;
  // Downscale before anything touches the network — see photo-downscale.ts.
  const scaled = await downscaleForUpload(uri, width, height, mimeType);
  const contentType = ALLOWED_CONTENT_TYPES.includes(scaled.mimeType) ? scaled.mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-photo-upload-url', {
    body: { visitId, contentType },
  });
  if (fnError) throw fnError;
  const { uploadUrl, r2Key } = data as { uploadUrl: string; r2Key: string };

  const fileResponse = await fetch(scaled.uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

  const { error: insertError } = await supabase.from('photos').insert({
    visit_id: visitId,
    r2_key: r2Key,
    width: scaled.width,
    height: scaled.height,
    position,
  });
  if (insertError) throw insertError;

  return r2Key;
}
