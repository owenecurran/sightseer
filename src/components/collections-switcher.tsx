import { CircledTabs } from '@/components/ui/circled-tabs';

export type CollectionMode = 'boards' | 'travel_books' | 'trips';

type CollectionsSwitcherProps = {
  active: CollectionMode;
  onChange: (mode: CollectionMode) => void;
};

// Switches between Boards, Travel Books and Trips — all three live on the
// same tabbed screen (boards.tsx), so this is a plain controlled toggle, not
// navigation between routes. Trips sit here because they're the same kind of
// thing to a user: a collection of their own reviews, just one the app
// assembled for them rather than one they built by hand.
const MODES: { key: CollectionMode; label: string }[] = [
  { key: 'boards', label: 'Boards' },
  { key: 'travel_books', label: 'Travel books' },
  { key: 'trips', label: 'Trips' },
];
export function CollectionsSwitcher({ active, onChange }: CollectionsSwitcherProps) {
  return <CircledTabs items={MODES} active={active} onChange={onChange} />;
}
