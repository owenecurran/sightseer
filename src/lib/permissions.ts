import { Linking } from 'react-native';

// What to say when the phone has refused Sightseer something only its own
// Settings can give back: photos, or the camera.
//
// Each screen used to word this its own way ("Photo library permission is
// required.", "...to set a cover photo.") and stop there. Once a permission
// has been refused, neither iOS nor Android asks again, so pressing the
// same button again just repeated the sentence: a dead end with no hint of
// where the switch is. Now there is one sentence for each, and wherever one
// is shown it comes with a way to the app's page in Settings (see
// ErrorNotice and FormError).

export const PHOTOS_NEEDED = 'Sightseer needs access to your photos for this. Allow it in Settings, then try again.';
export const CAMERA_NEEDED = 'Sightseer needs the camera for this. Allow it in Settings, then try again.';

// Whether this message is one that Settings fixes.
export function needsSettings(message: string | null | undefined): boolean {
  return message === PHOTOS_NEEDED || message === CAMERA_NEEDED;
}

// The app's own page in the phone's Settings, where its permissions are.
export function openAppSettings() {
  void Linking.openSettings().catch(() => {});
}
