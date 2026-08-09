import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandColors, Spacing } from '@/constants/theme';
import type { AttachmentType } from '@/lib/profile-prompts';

type FormatOption = { value: AttachmentType; label: string; icon: keyof typeof Ionicons.glyphMap };

// Icon + label per answer format — 'place' reads as "Location" here (a
// wording-only change to match how the prompt editor's own mockup labeled
// it; the stored attachment_type/DB value stays 'place').
const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'text', label: 'Text', icon: 'text-outline' },
  { value: 'photo', label: 'Photo', icon: 'image-outline' },
  { value: 'board', label: 'Board', icon: 'albums-outline' },
  { value: 'review', label: 'Review', icon: 'star-outline' },
  { value: 'place', label: 'Location', icon: 'location-outline' },
  { value: 'travel_book', label: 'Travel Book', icon: 'book-outline' },
];

export function formatLabel(type: AttachmentType): string {
  return FORMAT_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function formatIcon(type: AttachmentType): keyof typeof Ionicons.glyphMap {
  return FORMAT_OPTIONS.find((o) => o.value === type)?.icon ?? 'help-outline';
}

type AttachmentTypePickerProps = {
  value: AttachmentType;
  expanded: boolean;
  onSelect: (type: AttachmentType) => void;
  onToggleExpanded: () => void;
};

// The prompt editor's per-attachment format picker: a tall box listing every
// format with a leading icon while choosing, which collapses down to a
// single compact "current format" header (tap to reopen and change it) once
// one's picked — the editing UI for whichever format is active renders right
// below this, entirely outside this component.
export function AttachmentTypePicker({ value, expanded, onSelect, onToggleExpanded }: AttachmentTypePickerProps) {
  if (!expanded) {
    return (
      <Pressable onPress={onToggleExpanded} style={styles.collapsedRow}>
        <Ionicons name={formatIcon(value)} size={20} color={BrandColors.cream} />
        <ThemedText type="headline" style={styles.collapsedText}>
          {formatLabel(value)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Change
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      {FORMAT_OPTIONS.map((option) => {
        const isSelected = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onSelect(option.value)} style={styles.optionRow}>
            {isSelected && <View style={styles.selectedPill} />}
            <Ionicons
              name={option.icon}
              size={22}
              color={isSelected ? BrandColors.background : BrandColors.cream}
              style={styles.optionIcon}
            />
            <ThemedText type="headline" style={[styles.optionText, isSelected && styles.selectedText]}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.one,
    overflow: 'hidden',
  },
  optionRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  selectedPill: {
    ...StyleSheet.absoluteFill,
    backgroundColor: BrandColors.sage,
  },
  optionIcon: {
    zIndex: 1,
  },
  optionText: {
    fontSize: 24,
    zIndex: 1,
  },
  selectedText: {
    color: BrandColors.background,
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: 'rgba(234,231,207,0.35)',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  collapsedText: {
    fontSize: 20,
    flex: 1,
  },
});
