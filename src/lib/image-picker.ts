import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export type PickImageResult = ImagePicker.ImagePickerAsset | 'denied' | null;

// null = user cancelled the picker; 'denied' = library permission refused
// (native only — web has no such permission prompt). `exif` defaults off —
// most callers here (avatar/cover/prompt photos) have no use for it, and
// requesting it is extra payload for no benefit; review-form.tsx passes
// `exif: true` specifically so it can back-fill the visit date from the
// first photo's own EXIF (see photo-clustering.ts's extractDateFromExif,
// already used the same way for bulk-upload's per-cluster dates).
export async function pickImageFromLibrary(options?: { exif?: boolean }): Promise<PickImageResult> {
  if (Platform.OS !== 'web') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return 'denied';
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    exif: options?.exif ?? false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

// Same null/'denied' shape as pickImageFromLibrary — no web branch needed
// here (unlike the library picker) since expo-image-picker's own
// launchCameraAsync already throws a clear "not available on web" error on
// that platform; the review flow's own camera option only ever renders on
// native (see PhotoSourceModal).
export async function takePhotoWithCamera(options?: { exif?: boolean }): Promise<PickImageResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return 'denied';
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    exif: options?.exif ?? false,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0];
}

export type PickMultipleImagesResult = ImagePicker.ImagePickerAsset[] | 'denied' | null;

// One bulk-import batch's worth — bounds how many drafts a single pick can
// spawn (photo-clustering.ts creates roughly one draft per detected
// location/unlocated photo).
const BULK_SELECTION_LIMIT = 10;

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
