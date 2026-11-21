import { getCachedUrls } from '@/lib/media-url-cache';
import { supabase } from '@/lib/supabase';

const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type UploadAvatarParams = {
  userId: string;
  uri: string;
  mimeType?: string;
};

// Same architecture as visit photo upload: an Edge Function holding the R2
// secrets issues a short-lived presigned PUT URL, the client uploads
// directly to R2, then the resulting key is recorded in Postgres.
export async function uploadAvatar(params: UploadAvatarParams): Promise<string> {
  const { userId, uri, mimeType } = params;
  const contentType = mimeType && ALLOWED_CONTENT_TYPES.includes(mimeType) ? mimeType : 'image/jpeg';

  const { data, error: fnError } = await supabase.functions.invoke('create-avatar-upload-url', {
    body: { contentType },
  });
  if (fnError) throw fnError;
  const { uploadUrl, r2Key } = data as { uploadUrl: string; r2Key: string };

  const fileResponse = await fetch(uri);
  const blob = await fileResponse.blob();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload to storage failed (${uploadResponse.status})`);
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_r2_key: r2Key })
    .eq('id', userId);
  if (updateError) throw updateError;

  return r2Key;
}

// Batched across screens by the viewer-scoped URL cache.
export async function getAvatarViewUrls(userIds: string[]): Promise<Record<string, string>> {
  return getCachedUrls('avatar', userIds, async (missingIds) => {
    const { data, error } = await supabase.functions.invoke('get-avatar-urls', {
      body: { userIds: missingIds },
    });
    if (error) throw error;

    const { urls } = data as { urls: { userId: string; url: string }[] };
    return Object.fromEntries(urls.map((u) => [u.userId, u.url]));
  });
}

// A user with no avatar is remembered for a while, so a list of their posts
// does not ask again for every card.
const NO_AVATAR_TTL_MS = 5 * 60 * 1000;
const noAvatarUntil = new Map<string, number>();
const queued = new Map<string, ((url: string | null) => void)[]>();
let isFlushQueued = false;

// One user's avatar, for a component that knows only its own user: a card on
// a screen that never fetched avatars for its list. Every request made while
// a screen renders goes out as one batch, so a screenful of cards is still
// one call rather than one each.
export function getAvatarViewUrl(userId: string): Promise<string | null> {
  const until = noAvatarUntil.get(userId);
  if (until != null && until > Date.now()) return Promise.resolve(null);
  return new Promise((resolve) => {
    queued.set(userId, [...(queued.get(userId) ?? []), resolve]);
    if (!isFlushQueued) {
      isFlushQueued = true;
      setTimeout(flushQueuedAvatars, 0);
    }
  });
}

async function flushQueuedAvatars() {
  isFlushQueued = false;
  const batch = new Map(queued);
  queued.clear();
  let urls: Record<string, string> | null = null;
  try {
    urls = await getAvatarViewUrls([...batch.keys()]);
  } catch {
    // The card shows the initial instead, which is what it showed before.
  }
  for (const [userId, resolvers] of batch) {
    const url = urls?.[userId] ?? null;
    // Only a request that worked can say someone has no avatar.
    if (urls && !url) noAvatarUntil.set(userId, Date.now() + NO_AVATAR_TTL_MS);
    for (const resolve of resolvers) resolve(url);
  }
}
