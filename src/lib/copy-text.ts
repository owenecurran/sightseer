import { Platform } from 'react-native';

// Put a short string on the clipboard, and say whether it worked.
//
// Separate from shareText in src/lib/share.ts, which reaches for
// navigator.share first and only falls back to the clipboard. That is right
// for sharing a link — a share sheet is what someone wants for that — and
// wrong for a "Copy code" button, where opening a share sheet instead of
// copying is a different action than the one the button named.
//
// Returns a boolean rather than throwing because every caller's handling is
// the same: show "Copied" or leave the label alone. Nothing here is worth
// an error state — the code is on screen and selectable either way, which
// is the actual fallback.
export async function copyText(value: string): Promise<boolean> {
  if (Platform.OS !== 'web') {
    // No clipboard module is installed (expo-clipboard is not a dependency),
    // and the only caller is a web-only screen. Returning false rather than
    // pretending keeps the "Copied" label honest if this is ever reused on
    // a native screen before that package is added.
    return false;
  }

  const nav = typeof navigator === 'undefined' ? undefined : navigator;

  // The modern path. Requires a secure context, so it is present on
  // sightseer.world and on localhost but absent over plain http on a LAN
  // address — which is exactly how someone tests this from a phone against
  // a dev server, hence the fallback below rather than a bare failure.
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(value);
      return true;
    } catch {
      // Permission denied, or not in a user-gesture context. Fall through.
    }
  }

  // execCommand('copy') is deprecated and still the only thing that works in
  // a non-secure context. It needs a real selection to act on, so this makes
  // one on an offscreen element and tidies up afterwards.
  if (typeof document === 'undefined') return false;
  try {
    const scratch = document.createElement('textarea');
    scratch.value = value;
    // Not display:none — a hidden element cannot be selected. Off the left
    // edge and non-interactive is the usual way round that.
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'absolute';
    scratch.style.left = '-9999px';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}
