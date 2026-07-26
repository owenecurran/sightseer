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
