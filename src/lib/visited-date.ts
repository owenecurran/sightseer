// Formatting for `visited_on`, which is a bare calendar date with no time
// and no zone.
//
// Parsed as LOCAL NOON rather than handed straight to `new Date(string)`:
// `new Date('2026-08-03')` is specified to parse as UTC midnight, which
// renders as the *previous day* for anyone west of Greenwich. Noon is far
// enough from both midnights that no timezone can push it across a date
// boundary.
//
// Extracted because this exact parse had been written out four times
// (trip-group-card, trip-collection-row, trip-day-reviews, and the feed
// card) — four chances for one of them to be "fixed" back to the naive
// version and start showing the wrong day again.

function parseLocalNoon(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

// "Aug 3"
export function formatVisitedDate(date: string): string {
  return parseLocalNoon(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// "Aug 3, 2026" — for somewhere the year genuinely matters, like a card that
// is not sitting in a dated list.
export function formatVisitedDateWithYear(date: string): string {
  return parseLocalNoon(date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// "Aug 3 – Aug 11", collapsing to one date when a range spans a single day.
export function formatVisitedRange(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatVisitedDate(startDate)
    : `${formatVisitedDate(startDate)} – ${formatVisitedDate(endDate)}`;
}

// Split for the postmark ring, which sets the day and the year on separate
// lines the way a cancellation does. Uppercased here rather than with
// textTransform so the caller can measure what it is actually drawing.
export function formatVisitedPostmark(date: string): { line: string; year: string } {
  const parsed = parseLocalNoon(date);
  return {
    line: parsed
      .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      .toUpperCase(),
    year: String(parsed.getFullYear()),
  };
}
