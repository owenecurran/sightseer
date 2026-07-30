import { Modal, Pressable, StyleSheet } from 'react-native';

import { PlaceSearchInput } from '@/components/place-search-input';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Database } from '@/lib/database.types';

type PlaceRow = Database['public']['Tables']['places']['Row'];

type LocationSearchModalProps = {
  visible: boolean;
  onCancel: () => void;
  onSelect: (place: PlaceRow) => void;
};

// Web fallback — @rnmapbox/maps has no web renderer at all (same constraint
// expo-maps already has, see profile-map.tsx), so this is a plain full-screen
// text-search modal reusing the existing PlaceSearchInput rather than an
// interactive map. The real map only renders via location-search-modal.native.tsx.
export function LocationSearchModal({ visible, onCancel, onSelect }: LocationSearchModalProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <ThemedView type="screen" style={styles.container}>
        <Pressable onPress={onCancel}>
          <ThemedText type="smallBold">Cancel</ThemedText>
        </Pressable>
        <ThemedText type="displaySerif">Find a place</ThemedText>
        <PlaceSearchInput onSelect={onSelect} placeholder="Search for a place" />
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
