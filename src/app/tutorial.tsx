import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { ImageLoadingIcon } from '@/components/ui/image-loading-icon';
import { PostcardFlip } from '@/components/ui/postcard-flip';
import { PostcardPaper } from '@/components/ui/postcard-paper';
import { VisitCard } from '@/components/visit-card';
import { TicketCard } from '@/components/ui/ticket-card';
import { BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { headlineTreatmentFor } from '@/lib/headline-style';
import { POSTCARD_FRAME_RATIO } from '@/lib/postcard-orientation';
import { useAuth } from '@/lib/auth-context';
import { type FeedVisit } from '@/lib/feed';
import {
  loadTutorialCard,
  peekTutorialCard,
  TUTORIAL_VISIT_ID,
} from '@/lib/tutorial-card';
import { useTutorialSeen } from '@/lib/tutorial';
import { sheetFor } from '@/lib/postcard-stock';

// How the app works, once per install.
//
// Three things, and the first one is the reason this screen exists at all: a
// review is a postcard and postcards turn over. Nothing on a card says so
// except a line of printing in one corner, and people were not finding it.
//
// The first page is therefore not a picture of a card, it is a CARD — the
// same PostcardPaper, the same sheet, the same flip gesture, the same printed
// TURN OVER mark. You get past it by doing the thing. Teaching a gesture with
// a diagram of a gesture is how you end up with people who have read about
// the feature and still cannot use it.
//
// It must not become a trap, though, which is the obvious risk with a page
// you have to perform something to leave. Two ways out: Skip is on screen
// from the first frame, and if the card has not been turned after a few
// seconds the page offers to turn it for you. Someone who cannot do the
// gesture — a stiff thumb, a screen protector, a simulator with a mouse —
// still gets to see the back and still gets into the app.
const HINT_AFTER_MS = 6000;

// Fixed, so the fallback card looks the same on every install.
const DEMO_SEED = 'tutorial-card';

// The review the first page teaches on, and its pre-loading, both live in
// lib/tutorial-card.ts — it is started a screen earlier, on find-friends.

type Page = 'flip' | 'review' | 'collect';
const PAGES: Page[] = ['flip', 'review', 'collect'];

export default function TutorialScreen() {
  const { markSeen } = useTutorialSeen();
  const [pageIndex, setPageIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [hasFlipped, setHasFlipped] = useState(false);
  const [showFlipHelp, setShowFlipHelp] = useState(false);

  // The real review, when there is one to fetch. `undefined` means still
  // loading, `null` means there is nothing usable — no id configured, not
  // visible to this viewer, or the request failed — and either way the
  // printed demo card below takes over.
  const { session } = useAuth();
  // Seeded from the preload started on find-friends. When that finished — the
  // normal case — this is already the finished card on the very first render
  // and nothing below ever runs.
  const preloaded = peekTutorialCard();
  const [realVisit, setRealVisit] = useState<FeedVisit | null | undefined>(
    TUTORIAL_VISIT_ID ? (preloaded === undefined ? undefined : (preloaded?.visit ?? null)) : null
  );
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>(
    preloaded?.photoUrls ?? {}
  );
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(preloaded?.avatarUrl);

  useEffect(() => {
    if (!TUTORIAL_VISIT_ID || !session || realVisit !== undefined) return;
    let cancelled = false;
    // The same single-flight promise find-friends already started, so this
    // joins that work rather than repeating it. Only reached when somebody
    // arrived faster than the network, or skipped find-friends outright.
    void loadTutorialCard(session.user.id).then((card) => {
      if (cancelled) return;
      setPhotoUrls(card?.photoUrls ?? {});
      setAvatarUrl(card?.avatarUrl);
      setRealVisit(card?.visit ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [session, realVisit]);

  // VisitCard owns its own flip; this is how the page hears about it, so the
  // hint and the confirmation below work identically for the real card and
  // for the demo one.
  const handleRealFlip = useCallback((flipped: boolean) => {
    setIsFlipped(flipped);
    if (flipped) setHasFlipped(true);
  }, []);

  const page = PAGES[pageIndex];
  const isLast = pageIndex === PAGES.length - 1;

  useEffect(() => {
    if (page !== 'flip' || hasFlipped) return;
    const timer = setTimeout(() => setShowFlipHelp(true), HINT_AFTER_MS);
    return () => clearTimeout(timer);
  }, [page, hasFlipped]);

  function handleFlip() {
    setIsFlipped((current) => !current);
    setHasFlipped(true);
  }

  const sheet = sheetFor({ stock: 0, orientation: 'horizontal' });
  // The "printed on the card" treatment — dark ink on bare cream, the same
  // one a real review with no photograph gets. Without it the name is drawn
  // in the colour meant for lettering ACROSS a photograph, which on an empty
  // cream card is cream on cream.
  const headline = headlineTreatmentFor(DEMO_SEED, { onCard: true });

  return (
    <ThemedView type="screen" style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          {/* Always reachable, from the first frame. A tutorial you cannot
              leave is worse than no tutorial. */}
          <Pressable onPress={markSeen} hitSlop={12} style={styles.skip}>
            <ThemedText type="small" themeColor="textSecondary">
              Skip
            </ThemedText>
          </Pressable>
        </View>

        <View style={styles.body}>
          {page === 'flip' && (
            <>
              <ThemedText type="displaySerif" style={styles.title}>
                Every review is a postcard
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                The picture is the front. The review, the rating and the tags are all on the
                back — drag across the card, or press TURN OVER, to read it.
              </ThemedText>

              <View style={styles.cardWrap}>
                {realVisit === undefined ? (
                  // UNDEFINED IS NOT NULL, and conflating them is what made
                  // this look sloppy. `undefined` means the answer has not
                  // arrived; `null` means there is no usable review and the
                  // printed card below IS the lesson. Drawing the fallback for
                  // both meant the first thing anybody saw was a card that
                  // then silently turned into a different one.
                  //
                  // Holding the postcard's own proportion rather than
                  // collapsing to the icon's size: the real card is about to
                  // occupy exactly this space, so nothing below it moves when
                  // it arrives.
                  <View style={styles.cardLoading}>
                    <ImageLoadingIcon />
                  </View>
                ) : realVisit ? (
                  // The real thing, with every action inert: the callbacks
                  // are no-ops and isOwner is false, so nothing on this
                  // screen can like, share or delete somebody's review.
                  // VisitCard routes all of that through props, so leaving
                  // them empty is enough — it makes no writes of its own.
                  <VisitCard
                    visit={realVisit}
                    photoUrls={photoUrls}
                    avatarUrl={avatarUrl}
                    isOwner={false}
                    isCopied={false}
                    onToggleLike={() => {}}
                    onShare={() => {}}
                    onDeleted={() => {}}
                    onFlipChange={handleRealFlip}
                  />
                ) : (
                <PostcardFlip
                  isFlipped={isFlipped}
                  front={
                    <PostcardPaper
                      sheet={sheet}
                      onFlip={handleFlip}
                      flipLabel="Turn the card over"
                      turnMark
                      framed>
                      {/* A real card's height comes from its photograph. This
                          one has none, so the face carries the postcard's own
                          proportion itself — without it PostcardPaper sizes to
                          two lines of text and the card comes out as a strip. */}
                      <View style={styles.face}>
                        {/* Not StretchText's `fill`. That fits a name to the
                            card's exact width, which is right in a feed where
                            every card must carry its name at the same size —
                            and wrong here, where it scaled past the printed
                            border and clipped the first and last letter. A
                            tutorial card has one job and a fixed name. */}
                        <ThemedText
                          style={[headline.style, styles.demoName]}
                          numberOfLines={1}>
                          Pike Place Market
                        </ThemedText>
                        <ThemedText type="small" style={headline.region.style}>
                          Washington, United States
                        </ThemedText>
                      </View>
                    </PostcardPaper>
                  }
                  back={
                    <PostcardPaper sheet={sheet} onFlip={handleFlip} flipLabel="Show the front">
                      <View style={styles.face}>
                        <ThemedText type="smallBold" style={styles.backInk}>
                          The written side
                        </ThemedText>
                        <ThemedText type="small" style={styles.backInk}>
                          The note, the date, and where it was. Every review in the app turns
                          over like this.
                        </ThemedText>
                      </View>
                    </PostcardPaper>
                  }
                />
                )}
              </View>

              {hasFlipped ? (
                <View style={styles.doneRow}>
                  <Ionicons name="checkmark-circle" size={18} color={BrandColors.sage} />
                  <ThemedText type="small" themeColor="sage">
                    That&apos;s it &mdash; you&apos;ve got it.
                  </ThemedText>
                </View>
              ) : showFlipHelp ? (
                // The escape hatch. Offered rather than forced, and only once
                // it is clear the gesture is not landing.
                <Pressable onPress={handleFlip} hitSlop={8}>
                  <ThemedText type="small" themeColor="link">
                    Having trouble? Tap here to turn it over.
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  Give it a try.
                </ThemedText>
              )}
            </>
          )}

          {page === 'review' && (
            <>
              <ThemedText type="displaySerif" style={styles.title}>
                Write one yourself
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                The + button in the bar at the bottom. Pick a place, rate it, add a photo — the
                card prints itself.
              </ThemedText>

              {/* The real chooser card from the create flow, so the thing
                  they meet a minute later is the thing they were shown. */}
              <View style={styles.sampleWrap}>
                <ChoiceCard
                  title="New review"
                  description="Somewhere you have been"
                  seed="tutorial-review"
                  accentIndex={0}
                  onPress={() => {}}
                />
              </View>
            </>
          )}

          {page === 'collect' && (
            <>
              <ThemedText type="displaySerif" style={styles.title}>
                Keep them together
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.blurb}>
                A board is a list worth sharing. A travel book is one trip, in order. Both live
                under the bookmark tab.
              </ThemedText>

              <View style={styles.sampleWrap}>
                <TicketCard
                  seed="tutorial-board"
                  accentIndex={2}
                  compact
                  contentStyle={styles.ticketBody}>
                  <View style={styles.ticketText}>
                    <ThemedText type="smallBold">Best coffee in Seattle</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      A board · 6 places
                    </ThemedText>
                  </View>
                </TicketCard>
                <TicketCard
                  seed="tutorial-book"
                  accentIndex={4}
                  compact
                  contentStyle={styles.ticketBody}>
                  <View style={styles.ticketText}>
                    <ThemedText type="smallBold">Seattle, August</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      A travel book · 2 days
                    </ThemedText>
                  </View>
                </TicketCard>
              </View>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {PAGES.map((key, index) => (
              <View
                key={key}
                style={[styles.dot, index === pageIndex && styles.dotActive]}
              />
            ))}
          </View>

          <Button
            label={isLast ? 'Start exploring' : 'Next'}
            onPress={() => {
              if (isLast) markSeen();
              else setPageIndex((current) => current + 1);
            }}
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: Spacing.two,
  },
  skip: {
    padding: Spacing.two,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  blurb: {
    textAlign: 'center',
  },
  cardWrap: {
    width: '100%',
  },
  cardLoading: {
    width: '100%',
    aspectRatio: POSTCARD_FRAME_RATIO.horizontal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoName: {
    fontSize: 30,
    lineHeight: 38,
  },
  face: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    // The postcard's own proportion. See the note at the call site.
    aspectRatio: POSTCARD_FRAME_RATIO.horizontal,
    justifyContent: 'center',
  },
  // The written side is bare card here rather than the dark panel a real
  // review's back carries, so it needs the card's ink to be read at all.
  backInk: {
    color: 'rgba(26, 33, 22, 0.88)',
  },
  sampleWrap: {
    width: '100%',
    gap: Spacing.two,
  },
  ticketBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketText: {
    flex: 1,
    gap: Spacing.half,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  footer: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(234,231,207,0.25)',
  },
  dotActive: {
    backgroundColor: BrandColors.sage,
  },
});
