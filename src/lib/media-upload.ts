import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type UploadUrls = {
  uploadUrl: string;
  r2Key: string;
  thumbUploadUrl?: string;
  thumbR2Key?: string;
};

export async function readImageBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read that image.');
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('That image is empty.');
  return blob;
}

export async function requestImageUpload(
  endpoint: string,
  args: { contentType: string } & Record<string, string>,
  image: Blob,
  thumbnail?: Blob | null,
): Promise<UploadUrls> {
  const { data, error } = await supabase.functions.invoke<UploadUrls>(endpoint, {
    body: { ...args, contentLength: image.size, thumbnailContentLength: thumbnail?.size ?? null },
  });
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (typeof body?.error === 'string') throw new Error(body.error);
  }
  if (error) throw error;
  if (!data?.uploadUrl || !data.r2Key) throw new Error('Could not prepare the image upload.');
  return data;
}

export async function putImageBlob(url: string, image: Blob, contentType: string): Promise<void> {
  // Native networking can derive Content-Type from the Blob itself. Use the
  // signed type and keep the same bytes and length.
  const body = image.type === contentType ? image : image.slice(0, image.size, contentType);
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!response.ok) throw new Error(`Upload to storage failed (${response.status})`);
}
