import { Image } from 'expo-image';

import { getAvatarViewUrls } from '@/lib/avatar';
import { getVisitsByIds, type FeedVisit } from '@/lib/feed';
import { getPhotoViewUrls } from '@/lib/photo-view';

// The review the tutorial's first page teaches on, and the machinery for
// having it ready BEFORE that page is reached.
//
// A REAL review, fetched by id, rather than a replica assembled in the
// tutorial. The page is trying to say "this is what every review in the app
// is", and a mock-up that drifts from the real card teaches the wrong thing
// the moment the real one changes. Fetching it also means the back carries a
// real note, a real rating and real tags, which is exactly the thing people
// were not finding.
//
// This one is @owen's Pike Place Market review. It has to be a review every
// viewer is allowed to see, because the people meeting it have had an account
// for about a minute: RLS decides, and a private or blocked author returns
// nothing at all. That account is public, so the visits_select policy's
// `is_private = false` branch lets a brand-new user read it without following
// anybody.
//
// Empty falls back to the tutorial's printed demo card, so changing or
// clearing this is safe — the tutorial keeps working either way.
export const TUTORIAL_VISIT_ID = '9433a6cd-4d06-4299-9461-2af1914b0419';

export type TutorialCard = {
  visit: FeedVisit;
  photoUrls: Record<string, string>;
  avatarUrl: string | undefined;
};

// WHY THIS IS A MODULE AND NOT JUST AN EFFECT IN THE TUTORIAL.
//
// Three round trips stand between opening the tutorial and it looking like
// anything: the visit, then its signed photo and avatar URLs, then the
// photograph itself over the network. Started when the screen mounts, all of
// that happens while somebody is looking at the screen — so the first thing
// they see is the fallback card, which then silently becomes a different card
// once the real one lands.
//
// The fix has two halves and needs both. This is the first: start the work one
// screen earlier, on find-friends, which is the step immediately before the
// tutorial in the gate chain (see _layout.tsx). The second is in the tutorial
// itself, which must not draw the fallback while the answer is merely unknown
// — see the `undefined` vs `null` distinction there.
//
// Single-flight and memoised: find-friends starts it, the tutorial asks for
// the same thing a moment later, and both get the one promise rather than two
// identical fetches. Kept at module scope because it outlives both screens by
// design — that is the entire point.
let inFlight: Promise<TutorialCard | null> | null = null;
let settled: TutorialCard | null | undefined;

// What is already known, synchronously, for a screen's initial state.
//
// `undefined` means "not answered yet", `null` means "nothing usable" — no id
// configured, not visible to this viewer, or the request failed. The tutorial
// treats those two very differently, so they must stay distinguishable.
export function peekTutorialCard(): TutorialCard | null | undefined {
  return settled;
}

export function loadTutorialCard(myUserId: string): Promise<TutorialCard | null> {
  if (settled !== undefined) return Promise.resolve(settled);
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<TutorialCard | null> => {
    if (!TUTORIAL_VISIT_ID) return null;
    try {
      const [found] = await getVisitsByIds([TUTORIAL_VISIT_ID], myUserId);
      if (!found) return null;

      const [photoUrls, avatars] = await Promise.all([
        found.photoIds.length > 0 ? getPhotoViewUrls(found.photoIds) : Promise.resolve({}),
        getAvatarViewUrls([found.user_id]),
      ]);
      const avatarUrl = avatars[found.user_id];

      // The URLs are not the picture. Without this the card still arrives
      // with an empty frame and fills in afterwards, which is the same
      // sloppiness one layer down — so the bytes are pulled into expo-image's
      // cache here, and the card draws complete the first time it is shown.
      //
      // Awaited rather than fired and forgotten: the caller is a screen the
      // person is already looking at, so there is time to spend, and spending
      // it here is exactly what buys the clean arrival.
      //
      // Failures are ignored on purpose. prefetch rejects for a URL that will
      // not load, and a missing photograph is not a reason to throw away a
      // review that has a note, a rating and tags on the back.
      const urls = [...Object.values(photoUrls), avatarUrl].filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      );
      if (urls.length > 0) {
        await Image.prefetch(urls).catch(() => false);
      }

      return { visit: found, photoUrls, avatarUrl };
    } catch {
      // A tutorial that fails to load must still be a tutorial. The printed
      // demo card is a complete lesson on its own, so this degrades rather
      // than showing an error on the first screen of the app.
      return null;
    }
  })();

  void inFlight.then((result) => {
    settled = result;
    inFlight = null;
  });

  return inFlight;
}

// Starts the work and does not make the caller care when it finishes.
//
// For the screen that is merely warming this up on the way past: it has no use
// for the result, and should not be holding anything open waiting for it.
export function warmTutorialCard(myUserId: string): void {
  void loadTutorialCard(myUserId);
}
