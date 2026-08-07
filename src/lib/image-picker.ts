import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PickImageResult = ImagePicker.ImagePickerAsset | 'denied' | null;

// null = user cancelled the picker; 'denied' = library permission refused
// (native only — web has no such permission prompt).
export async function pickImageFromLibrary(): Promise<PickImageResult> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

export type PickMultipleImagesResult = ImagePicker.ImagePickerAsset[] | 'denied' | null;

// One bulk-import batch's worth — bounds how many drafts a single pick can
// spawn (photo-clustering.ts creates roughly one draft per detected
// location/unlocated photo).
const BULK_SELECTION_LIMIT = 40;

// exif: true is what the bulk-upload flow reads GPS off of (see
// photo-clustering.ts's extractGpsFromExif) — pickImageFromLibrary above
// stays without it since single-photo flows never need location detection.
export async function pickMultipleImagesFromLibrary(): Promise<PickMultipleImagesResult> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsMultipleSelection: true,
    selectionLimit: BULK_SELECTION_LIMIT,
    exif: true,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets;
}
