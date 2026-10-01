import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TextField } from '@/components/ui/text-field';
import { BrandColors, MaxContentWidth, Spacing, StickerAccents } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  COUNTRIES,
  DEFAULT_COUNTRY,
  flagFor,
  formatNationalNumber,
  isValidNationalNumber,
  type Country,
} from '@/lib/countries';

// A phone number, entered.
//
// An underline rather than a box, because the box around a single field is
// decoration: the line under the digits is already the whole affordance, and
// without the box the country picker and the number read as one control
// rather than two sitting next to each other.
//
// THE COLOUR IS THE VALIDATION. Amber while the number is unfinished, sage
// once it could actually be dialled. No error text, because there is no error
// — a half-typed number is not a mistake, it is somebody halfway through
// typing, and telling them off for it is both rude and useless. The line
// going green is the only feedback needed, and it arrives on the keystroke
// that earns it.
//
// `number-pad` rather than `phone-pad`: the mask supplies every bracket and
// dash itself, so the letters, the star and the hash on a phone pad are all
// things that can only produce a number this field then has to strip back
// out. A pad of ten digits cannot be typed wrong.
const AMBER = StickerAccents[1];

export type PhoneFieldProps = {
  // The E.164 number, or '' while it is not yet valid. Giving the caller ''
  // rather than a partial number means a Continue button can be disabled on
  // falsiness alone and can never submit half a number.
  onChange: (e164: string) => void;
  autoFocus?: boolean;
};

export function PhoneField({ onChange, autoFocus }: PhoneFieldProps) {
  const theme = useTheme();
  const [country, setCountry] = useState<Country>(DEFAULT_COUNTRY);
  // Digits only. The mask is applied for display and never stored, so moving
  // the cursor or changing country cannot strip a digit by accident.
  const [digits, setDigits] = useState('');
  const [isPicking, setIsPicking] = useState(false);
  const [search, setSearch] = useState('');

  const isValid = isValidNationalNumber(country, digits);
  const lineColor = isValid ? BrandColors.sage : AMBER;

  function emit(next: Country, nextDigits: string) {
    onChange(isValidNationalNumber(next, nextDigits) ? `+${next.dial}${nextDigits}` : '');
  }

  function handleChangeText(raw: string) {
    // Everything that is not a digit is dropped, including whatever the mask
    // put there a moment ago. Backspacing over a ')' therefore deletes the
    // digit before it rather than a bracket that reappears immediately.
    const next = raw.replace(/\D/g, '').slice(0, country.dial === '1' ? 10 : 15);
    setDigits(next);
    emit(country, next);
  }

  function handlePick(next: Country) {
    setCountry(next);
    setIsPicking(false);
    setSearch('');
    // The digits stay. Somebody correcting the country code has not changed
    // their mind about their own number.
    emit(next, digits);
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.dial.startsWith(q.replace('+', '')),
    );
  }, [search]);

  return (
    <View>
      <View style={[styles.row, { borderBottomColor: lineColor }]}>
        <Pressable
          onPress={() => setIsPicking(true)}
          hitSlop={8}
          style={styles.country}
          accessibilityRole="button"
          accessibilityLabel={`Country code, ${country.name}, plus ${country.dial}`}
        >
          <ThemedText type="default" style={styles.flag}>
            {flagFor(country.iso)}
          </ThemedText>
          <ThemedText type="default">+{country.dial}</ThemedText>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </Pressable>

        <TextInput
          value={formatNationalNumber(country, digits)}
          onChangeText={handleChangeText}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus={autoFocus}
          placeholder={country.dial === '1' ? '(555) 123-4567' : 'Phone number'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
          maxLength={country.dial === '1' ? 14 : 18}
        />
      </View>

      <Modal
        visible={isPicking}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsPicking(false)}
      >
        <ThemedView type="screen" style={styles.modal}>
          <SafeAreaView style={styles.modalInner}>
            <View style={styles.modalHeader}>
              <ThemedText type="displaySerif">Country</ThemedText>
              <Pressable onPress={() => setIsPicking(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>

            <TextField
              placeholder="Search"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ScrollView keyboardShouldPersistTaps="handled">
              {results.map((c) => (
                <Pressable
                  key={`${c.iso}-${c.dial}`}
                  onPress={() => handlePick(c)}
                  style={styles.countryRow}
                >
                  <ThemedText type="default" style={styles.flag}>
                    {flagFor(c.iso)}
                  </ThemedText>
                  <ThemedText type="default" style={styles.countryName}>
                    {c.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    +{c.dial}
                  </ThemedText>
                </Pressable>
              ))}
              {results.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.noResults}>
                  No country matches that.
                </ThemedText>
              )}
            </ScrollView>
          </SafeAreaView>
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderBottomWidth: 2,
    paddingBottom: Spacing.two,
  },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  // Emoji flags sit on their own metrics and ride high against the text
  // beside them without this.
  flag: {
    fontSize: 20,
    lineHeight: 24,
  },
  input: {
    flex: 1,
    fontSize: 18,
    paddingVertical: Spacing.two,
  },
  modal: {
    flex: 1,
  },
  modalInner: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  countryName: {
    flex: 1,
  },
  noResults: {
    paddingVertical: Spacing.four,
  },
});
