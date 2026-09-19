import { FilterSortMenu } from '@/components/ui/filter-sort-menu';
import type { BoardVisitItem } from '@/lib/boards';

export type ReviewSortMode = 'recent' | 'oldest' | 'top_rated' | 'place';

const SORT_MODES: { key: ReviewSortMode; label: string }[] = [
  { key: 'recent', label: 'Most recent' },
  { key: 'oldest', label: 'Oldest first' },
  { key: 'top_rated', label: 'Top rated' },
  { key: 'place', label: 'Place A–Z' },
];

export const DEFAULT_REVIEW_SORT: ReviewSortMode = 'recent';

type ReviewsSortControlProps = {
  active: ReviewSortMode;
  onChange: (mode: ReviewSortMode) => void;
};

// The same trigger-and-sheet every other sort in the app uses, so a screen
// with four options looks like the screen with twenty and adding one never
// turns into another row of chips above the list.
export function ReviewsSortControl({ active, onChange }: ReviewsSortControlProps) {
  return (
    <FilterSortMenu
      groups={[
        {
          kind: 'single',
          key: 'sort',
          label: 'Sort',
          options: SORT_MODES.map((mode) => ({ value: mode.key, label: mode.label })),
          value: active,
          onChange: (value) => onChange(value as ReviewSortMode),
        },
      ]}
    />
  );
}

// Sorted copy, never in place — the caller's array is state somewhere.
//
// Unrated reviews sort LAST under "top rated" rather than as a zero. A review
// without a rating is one someone chose not to score, not one they scored
// nothing; burying it under every 0.1 would read as a judgement the author
// never made.
export function sortReviewItems<T extends BoardVisitItem>(
  items: T[],
  mode: ReviewSortMode,
): T[] {
  const sorted = [...items];
  switch (mode) {
    case 'oldest':
      return sorted.sort((a, b) => a.visitedOn.localeCompare(b.visitedOn));
    case 'top_rated':
      return sorted.sort((a, b) => {
        if (a.rating == null && b.rating == null) return b.visitedOn.localeCompare(a.visitedOn);
        if (a.rating == null) return 1;
        if (b.rating == null) return -1;
        return b.rating - a.rating;
      });
    case 'place':
      return sorted.sort((a, b) => a.placeName.localeCompare(b.placeName));
    case 'recent':
    default:
      return sorted.sort((a, b) => b.visitedOn.localeCompare(a.visitedOn));
  }
}
