# Deferred deep linking (store-install attribution)

This is the one invite path that cannot be closed with code in this repo
alone. Everything else already works:

| Path | Attributed by | Status |
| --- | --- | --- |
| Opens link, signs up on web | code in the URL → `setPendingInviteCode` | working |
| Opens link, app already installed | `src/app/i/[code].tsx` | working |
| Opens link → store → installs → opens | **needs the setup below** | inert |

The third case has nothing to carry the code: iOS hands an app no referrer
from the App Store, and the app's first launch has no idea a link was ever
involved. Branch closes it by matching the click to the install on their
side.

## Before any of this is worth doing

**The app has to actually be listed on a store.** Deferred deep linking
attributes store installs and nothing else, so until there are listings
there is no path for it to attribute and no way to test it end to end.
`src/lib/stores.ts` is the other half of that same blocker — its two URLs
are still empty.

## Setup

1. **Branch account.** Create an app in the Branch dashboard, set the iOS
   bundle ID and Android package to `com.owenecurran.alienapp`, and add the
   App Store / Play Store IDs once they exist.

2. **Install the SDK.**

   ```bash
   npx expo install react-native-branch
   ```

3. **Config plugin + keys** in `app.json`, under `expo.plugins`. Branch's
   plugin takes the live and test keys from the dashboard:

   ```json
   [
     "react-native-branch",
     {
       "apiKey": "key_live_...",
       "testApiKey": "key_test_..."
     }
   ]
   ```

4. **Rebuild.** This is a native module, so a JS reload will not pick it up:

   ```bash
   eas build --profile development --platform all
   ```

   Until this build is installed, `src/lib/deferred-links.ts` deliberately
   does nothing — it requires the module lazily and tolerates its absence, so
   the current dev client keeps working rather than crashing on a module
   that is not in the binary.

5. **Generate links with the invite code attached.** The code must travel as
   custom data under the key `invite_code`, which is what
   `deferred-links.ts` reads back:

   ```js
   const { url } = await branch.createBranchUniversalObject(`invite/${code}`, {
     title: 'Join me on Sightseer',
     contentMetadata: { customMetadata: { invite_code: code } },
   }).generateShortUrl()
   ```

   Note this replaces `inviteUrl()` in `src/lib/invites.ts` for the *shared*
   link only. `sightseer.world/i/<code>` stays as-is and keeps working — it
   is what the web landing and the already-installed case use.

## ⚠️ The SDK call surface is unverified

`src/lib/deferred-links.ts` is written against Branch's documented
`branch.subscribe` API, but that documentation could not be reached when it
was written, so the exact callback signature and the `+clicked_branch_link`
key name have **not** been confirmed against a specific version. Check them
against whatever version you install.

What that check cannot break: the pending-code store, `redeem_invite`, and
the write-once attribution behind it are all independent of Branch and are
verified. If the callback shape turns out to differ, the fix is confined to
the `subscribe` call in that one file.

## Privacy

Branch is a data processor that fingerprints devices. Adding it means
disclosing it in the privacy policy — which does not exist yet
(`PRIVACY_POLICY_URL` in `src/lib/legal.ts` is still empty, deliberately).
Both stores require that disclosure at review time, so this and the privacy
policy have to land together.
