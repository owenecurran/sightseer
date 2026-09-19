import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { VisitCard } from '@/components/visit-card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { getVisitsByIds, likeVisit, unlikeVisit, type FeedVisit } from '@/lib/feed';
import { getPhotoThumbUrls, getPhotoViewUrls } from '@/lib/photo-view';
import { shareText } from '@/lib/share';

type PromptPostcardProps = {
  visitId: string;
  // The editor's live preview renders this against an attachment that may not
  // be saved yet, and a preview must not be likeable or shareable — pressing
  // anything there is meant to be about the PROMPT, not about the review.
  disabled?: boolean;
};

// A featured review on a profile, drawn as the postcard it is.
//
// The alternative — review-prompt-card.tsx — is a bespoke layout from before
// the postcard existed: a note beside a photo with a rating stamp in the
// corner. It is still here, and still what an attachment gets when
// show_postcard is turned off, but it is no longer the default. A review
// looks like a card everywhere else in the app and a profile was the last
// place it came out as something else.
//
// Hydrated here rather than fetched alongside the prompts. A prompt
// attachment carries a visit id, a place name, a rating and one photo — a
// postcard needs the tags, the likes, the comment count, the tagged users and
// the card stock it was printed on. Fetching that for every prompt on every
// profile open would be paid by profiles that feature no reviews at all;
// fetching it here means it is paid only where a postcard is actually drawn.
export function PromptPostcard({ visitId, disabled = false }: PromptPostcardProps) {
  const { session } = useAuth();
  const viewerId = session?.user.id;
  const [visit, setVisit] = useState<FeedVisit | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;

    void (async () => {
      try {
        const [hydrated] = await getVisitsByIds([visitId], viewerId);
        if (cancelled) return;
        if (!hydrated) {
          setFailed(true);
          return;
        }
        setVisit(hydrated);

        if (hydrated.photoIds.length === 0) return;
        const [full, thumbs] = await Promise.all([
          getPhotoViewUrls(hydrated.photoIds),
          getPhotoThumbUrls(hydrated.photoIds),
        ]);
        if (cancelled) return;
        setPhotoUrls(full);
        setThumbUrls(thumbs);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visitId, viewerId]);

  async function handleToggleLike() {
    if (!viewerId || !visit || disabled) return;
    const nowLiked = !visit.isLikedByMe;
    // Optimistic and reverted on failure, the same bargain the feed makes.
    setVisit({ ...visit, isLikedByMe: nowLiked, likeCount: visit.likeCount + (nowLiked ? 1 : -1) });
    try {
      if (nowLiked) await likeVisit(viewerId, visit.id);
      else await unlikeVisit(viewerId, visit.id);
    } catch {
      setVisit(visit);
    }
  }

  if (failed) {
    return (
      <View style={styles.placeholder}>
        <ThemedText type="small" themeColor="textSecondary">
          This review is no longer available.
        </ThemedText>
      </View>
    );
  }

  // A postcard's own proportion, so a profile does not jump as each featured
  // review lands.
  if (!visit) return <View style={styles.placeholder} />;

  return (
    <VisitCard
      visit={visit}
      photoUrls={photoUrls}
      photoThumbUrls={thumbUrls}
      isOwner={visit.user_id === viewerId}
      isCopied={false}
      onToggleLike={() => void handleToggleLike()}
      onShare={() => {
        if (disabled) return;
        void shareText(`${visit.placeName}\n${visit.note ?? ''}`.trim());
      }}
      // A featured review is a pointer at a review, not the review's home.
      // Deleting it belongs on the review itself, so there is nothing to do
      // here — the prompt editor is where a feature is removed.
      onDeleted={() => {}}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: '100%',
    aspectRatio: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.three,
  },
});
