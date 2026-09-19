import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

// How a collection's contents are shown: as a list, as postcards, as
// photographs, and so on.
//
// The same vocabulary for a board and for a travel book, deliberately. They
// are two arrangements of the same thing — somewhere you collected reviews —
// and someone who has decided they want to read postcards has decided it
// about both. One remembered choice, not one per screen.
export type CollectionViewMode = 'list' | 'ranked' | 'full' | 'images' | 'map';

// What a collection opens as before anyone has chosen anything.
//
// Postcards. The card is the review — it carries the photographs, the
// lettering, the stamp and the writing on the back — and a list is a way of
// finding one, not a way of reading them. Boards used to open on 'list',
// which meant the app's own object was the mode you had to go looking for.
export const DEFAULT_VIEW_MODE: CollectionViewMode = 'full';

const STORAGE_KEY = 'sightseer.collection-view-mode';

const ALL_MODES: CollectionViewMode[] = ['list', 'ranked', 'full', 'images', 'map'];

function parse(value: string | null): CollectionViewMode | null {
  return ALL_MODES.includes(value as CollectionViewMode) ? (value as CollectionViewMode) : null;
}

// The last mode chosen anywhere, or null if that is nothing yet.
//
// Best-effort throughout: a device that cannot read its own storage gets the
// default rather than an error. This is a display preference, and there is no
// version of "could not remember which tab you were on" worth surfacing.
export async function loadViewMode(): Promise<CollectionViewMode | null> {
  try {
    return parse(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export async function saveViewMode(mode: CollectionViewMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not remembering is survivable; failing to render is not.
  }
}

// The remembered mode, narrowed to what this particular screen offers.
//
// `available` matters because the surfaces do not offer the same set: a board
// with an unranked list has no 'ranked' mode, and a travel book has no map of
// its own. Someone who last chose 'map' on a board and then opens a travel
// book must not land on a mode that screen cannot draw — so anything not on
// offer here falls back to postcards rather than to whatever happens to be
// first in the list.
//
// Starts on the default and corrects itself once storage answers. That one
// frame of postcards-then-list is deliberate: the alternative is rendering
// nothing until the read completes, which is a blank screen on every open to
// save a flicker on some of them.
export function useCollectionViewMode(
  available: CollectionViewMode[],
): [CollectionViewMode, (mode: CollectionViewMode) => void] {
  const fallback = available.includes(DEFAULT_VIEW_MODE) ? DEFAULT_VIEW_MODE : available[0];
  const [mode, setMode] = useState<CollectionViewMode>(fallback);

  // Joined, so a screen that rebuilds this array every render — which is all
  // of them — does not re-read storage on every render.
  const key = available.join(',');

  useEffect(() => {
    let cancelled = false;
    void loadViewMode().then((stored) => {
      if (cancelled || stored == null) return;
      if (!key.split(',').includes(stored)) return;
      setMode(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const choose = useCallback((next: CollectionViewMode) => {
    setMode(next);
    // Not awaited: the tab has already changed, and whether the preference
    // reached disk is not something the press should wait on.
    void saveViewMode(next);
  }, []);

  return [mode, choose];
}
