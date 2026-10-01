import { reportError } from '@/lib/error-report';

// Ceilings for list queries that would otherwise return every row there is.
//
// WHY A CEILING AT ALL. A query with no limit is fine until the day it is
// not: a board with nine thousand items, an account that has reviewed every
// pub in England, a visit that attracted a comment thread. The failure is not
// a slow screen, it is a payload big enough to stall the bridge and a parse
// that happens on the UI thread.
//
// WHY A CEILING IS ALSO DANGEROUS. A limit silently drops the rows past it.
// Swapping "slow one day" for "quietly incomplete forever" is not obviously a
// trade worth making, and it is the sort of bug nobody reports because the
// screen looks fine — it just does not have everything on it.
//
// So the cap announces itself. If a query comes back holding exactly its cap,
// the rows past it almost certainly existed, and that is reported rather than
// shrugged off. The number then moves on evidence instead of on a guess.
//
// Two rules for anywhere these are used:
//
//   ORDER FIRST. A limit without an order returns an arbitrary subset, which
//   is worse than either returning everything or failing. Every call site
//   that takes a cap already orders deterministically; one that does not must
//   gain an order in the same change, not later.
//
//   SET IT ABOVE THE REAL WORLD. These are backstops against pathology, not
//   pagination. If one of them is being hit by ordinary use, the answer is
//   paging that screen, not a bigger number.

// A thread on one review.
export const COMMENTS_CAP = 500;

// One account's unpublished drafts.
export const DRAFTS_CAP = 200;

// One account's saved boards and travel books.
export const SAVED_COLLECTIONS_CAP = 500;

// The contents of a single board or travel book.
export const COLLECTION_ITEMS_CAP = 1000;

// Photos hanging off one profile prompt.
export const PROMPT_PHOTOS_CAP = 100;

// One account's own reviews, where a screen loads them in one go.
export const OWN_VISITS_CAP = 2000;

// Says so when a query came back full.
//
// `>=` rather than `===` because a cap applied alongside an `.in()` of
// already-limited ids can legitimately return fewer, and because a future
// caller may pass its own smaller number.
//
// Deliberately not throwing: a screen showing the first 500 comments is far
// better than a screen showing an error, and the point of this is to find out
// that the number needs raising, not to punish the person who hit it.
export function reportIfCapped(label: string, rows: unknown[] | null | undefined, cap: number): void {
  if (!rows || rows.length < cap) return;
  // report_client_error deduplicates to one an hour per account, context and
  // message, so a screen somebody opens repeatedly does not fill the table.
  // reportError logs to the console on the way past, so development sees it
  // immediately too.
  reportError('query-cap', `${label} hit its row cap of ${cap} — rows beyond it were not loaded`);
}
