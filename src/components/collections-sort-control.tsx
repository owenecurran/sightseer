import { FilterSortMenu } from '@/components/ui/filter-sort-menu';

export type CollectionSortMode = 'recently_edited' | 'mean_rating' | 'most_saves';

const SORT_MODES: { key: CollectionSortMode; label: string }[] = [
  { key: 'recently_edited', label: 'Recently edited' },
  { key: 'mean_rating', label: 'Top rated' },
  { key: 'most_saves', label: 'Most saved' },
];

type CollectionsSortControlProps = {
  active: CollectionSortMode;
  onChange: (mode: CollectionSortMode) => void;
};

// A row of chips before, now the same trigger-and-sheet every other sort and
// filter in the app uses — so the pattern is consistent whether a screen has
// three options or twenty, and adding one here never turns into another row
// of chips above the list.
export function CollectionsSortControl({ active, onChange }: CollectionsSortControlProps) {
  return (
    <FilterSortMenu
      groups={[
        {
          kind: 'single',
          key: 'sort',
          label: 'Sort',
          options: SORT_MODES.map((mode) => ({ value: mode.key, label: mode.label })),
          value: active,
          onChange: (value) => onChange(value as CollectionSortMode),
        },
      ]}
    />
  );
}
