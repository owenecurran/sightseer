import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { TeaserCard } from '@/components/ui/teaser-card';
import { TAB_ROUTES } from '@/constants/tab-routes';
import { useAuth } from '@/lib/auth-context';
import { listMyBoards } from '@/lib/boards';
import { getBoardThumbnailUrls, getTravelBookThumbnailUrls } from '@/lib/collection-thumbnails';
import { listMyTravelBooks, listUserTravelBooks } from '@/lib/travel-books';
import { useTabPager } from '@/hooks/use-tab-pager';

type UserCollectionsSectionProps = { userId: string };

type FeaturedCollection = { id: string; label: string; updatedAt: string; kind: 'board' | 'travel_book' };

// A single teaser (photo + name + chevron) matching the visual weight
// profile.tsx's own "Latest reviews"/"Tagged in" cards already get, linking
// out to the full sortable list (the Boards tab for your own profile,
// /collections/[userId] for someone else's) rather than listing everything
// inline here.
export function UserCollectionsSection({ userId }: UserCollectionsSectionProps) {
  const { session } = useAuth();
  const { setActivePage } = useTabPager();
  const isSelf = session?.user.id === userId;
  const [featured, setFeatured] = useState<FeaturedCollection | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>();
  const [isEmpty, setIsEmpty] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setHasLoaded(false);
    // isSelf uses listMyTravelBooks (includes books you collaborate on, same
    // as the Boards tab shows for your own profile); viewing someone else
    // uses listUserTravelBooks (owner-only) — matches (tabs)/boards.tsx and
    // collections/[userId].tsx's own dataset choice for the same user.
    Promise.all([listMyBoards(userId), isSelf ? listMyTravelBooks(userId) : listUserTravelBooks(userId)])
      .then(async ([boards, travelBooks]) => {
        if (boards.length === 0 && travelBooks.length === 0) {
          setIsEmpty(true);
          return;
        }
        setIsEmpty(false);

        const candidates: FeaturedCollection[] = [
          ...boards.map((b) => ({ id: b.id, label: b.name, updatedAt: b.updated_at, kind: 'board' as const })),
          ...travelBooks.map((b) => ({ id: b.id, label: b.title, updatedAt: b.updated_at, kind: 'travel_book' as const })),
        ];
        const top = candidates.reduce((a, b) => (a.updatedAt >= b.updatedAt ? a : b));
        setFeatured(top);

        const [boardUrls, travelBookUrls] = await Promise.all([
          getBoardThumbnailUrls(boards),
          getTravelBookThumbnailUrls(travelBooks),
        ]);
        setThumbnailUrl(top.kind === 'board' ? boardUrls[top.id] : travelBookUrls[top.id]);
      })
      .catch(() => setIsEmpty(true))
      .finally(() => setHasLoaded(true));
  }, [userId, isSelf]);

  if (!hasLoaded || isEmpty || !featured) return null;

  function handlePress() {
    if (isSelf) {
      // Boards is one of the 5 main pager tabs on native — a bare
      // router.push('/boards') doesn't switch the PagerView's active page
      // there (tab switching bypasses the router entirely, see
      // tab-pager.native.tsx's own comment), it was instead falling through
      // to whatever the Stack resolved '/boards' to and landing back on
      // Feed. setActivePage is the same mechanism FloatingNavBar itself
      // uses to switch tabs, and already branches correctly per-platform
      // (router.navigate on web, pagerRef.setPage on native).
      setActivePage(TAB_ROUTES.indexOf('/boards'));
    } else {
      router.push({ pathname: '/collections/[userId]', params: { userId } });
    }
  }

  return <TeaserCard label="Boards & travel books" title={featured.label} thumbnailUrl={thumbnailUrl} onPress={handlePress} />;
}
