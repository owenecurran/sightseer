import { router } from 'expo-router';

// Where a back control lands when there is nothing to go back to. The feed
// is the app's home tab (see TAB_ROUTES).
const HOME_ROUTE = '/';

// `router.back()`, with a floor under it.
//
// Plain back() does nothing when there is no history to pop, which strands
// anyone who arrived at a screen directly rather than by navigating to it:
// a deep link, a notification tap, a shared URL, or — most easily — a hard
// refresh on web, which resets the history stack to just the current page.
// The back control then looks broken, because it is: it has nowhere to go
// and silently declines.
//
// When there IS history this behaves exactly like back(), so every screen
// that relies on popping to a specific caller (see review-form's "Done",
// which pops back to the drafts list it was pushed from) is unaffected.
// Only the dead-end case changes.
//
// `replace`, not `push`: there is no stack to add to, and pushing would
// leave a phantom entry that backs straight into the same dead end.
export function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(HOME_ROUTE);
}
