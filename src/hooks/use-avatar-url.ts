import { useEffect, useState } from 'react';

import { getAvatarViewUrl } from '@/lib/avatar';

// A user's avatar URL: the one the screen already fetched when it has it,
// and otherwise fetched here. Several screens show posts without ever
// fetching their authors' avatars (Discover, a place page, a board's
// postcards), which left every byline on them showing an initial.
export function useAvatarUrl(userId: string, known?: string): string | undefined {
  const [fetched, setFetched] = useState<{ userId: string; url: string | null } | null>(null);

  useEffect(() => {
    if (known) return;
    let isActive = true;
    void getAvatarViewUrl(userId).then((url) => {
      if (isActive) setFetched({ userId, url });
    });
    return () => {
      isActive = false;
    };
  }, [userId, known]);

  if (known) return known;
  return fetched?.userId === userId ? (fetched.url ?? undefined) : undefined;
}
