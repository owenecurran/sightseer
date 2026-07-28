import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import type { Database } from '@/lib/database.types';
import {
  autocompletePlaces,
  createPlacesSessionToken,
  fetchPlaceDetails,
  type PlaceAutocompleteSuggestion,
} from '@/lib/google-places';
import { cachePlaceHierarchy } from '@/lib/places-cache';

type PlaceRow = Database['public']['Tables']['places']['Row'];

const DEBOUNCE_MS = 300;

type PlaceSearchInputProps = {
  onSelect: (place: PlaceRow) => void;
  placeholder?: string;
};

// Reusable place-search input — pulled out of review.tsx's inline
// autocomplete-to-cached-place flow (which duplicates this same
// search/select/session-token logic twice already for its own main search
// and its tag-a-sub-location search) specifically so a third call site (the
// "place" prompt attachment type) doesn't duplicate it a third time.
export function PlaceSearchInput({ onSelect, placeholder = 'Search for a place' }: PlaceSearchInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceAutocompleteSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef(createPlacesSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      setError(null);
      try {
        setSuggestions(await autocompletePlaces(query, sessionTokenRef.current));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleSelect(suggestion: PlaceAutocompleteSuggestion) {
    setError(null);
    setIsSearching(true);
    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionTokenRef.current);
      const cached = await cachePlaceHierarchy(details);
      onSelect(cached);
      setQuery('');
      setSuggestions([]);
      sessionTokenRef.current = createPlacesSessionToken();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that place.');
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextField placeholder={placeholder} value={query} onChangeText={setQuery} />
      {error && (
        <ThemedText type="small" themeColor="textSecondary">
          {error}
        </ThemedText>
      )}
      {isSearching && !error && (
        <ThemedText type="small" themeColor="textSecondary">
          Searching…
        </ThemedText>
      )}
      {suggestions.length > 0 && (
        <View style={styles.suggestions}>
          {suggestions.map((s) => (
            <Pressable key={s.placeId} onPress={() => handleSelect(s)}>
              <ThemedView type="backgroundElement" style={styles.suggestionRow}>
                <ThemedText type="small">{s.primaryText}</ThemedText>
                {s.secondaryText && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {s.secondaryText}
                  </ThemedText>
                )}
              </ThemedView>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  suggestions: {
    gap: Spacing.one,
  },
  suggestionRow: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.half,
  },
});
