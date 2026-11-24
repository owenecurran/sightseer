import { CircledTabs } from '@/components/ui/circled-tabs';

export type FeedMode = 'feed' | 'discover';

type FeedSwitcherProps = {
  active: FeedMode;
  onChange: (mode: FeedMode) => void;
};

const MODES: { key: FeedMode; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'discover', label: 'Discover' },
];

// The same circled-word toggle as collections-switcher.tsx: Feed and
// Discover live on the same Home screen, so this is a plain toggle, not a
// navigation link between two routes.
export function FeedSwitcher({ active, onChange }: FeedSwitcherProps) {
  return <CircledTabs items={MODES} active={active} onChange={onChange} />;
}
