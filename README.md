<div align="center">

<img src="assets/images/icon.png" alt="Sightseer logo" width="120" />

# Sightseer

**Rate the places you've been. Keep the trips you've taken.**

A cross-platform social travel journal. Review a place, rate it out of 10, and see your friends do the same.

<br />

![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo&logoColor=white)
![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB?logo=react&logoColor=black)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![TypeScript 6](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)
![Mapbox](https://img.shields.io/badge/Mapbox-Maps-000000?logo=mapbox&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-F38020?logo=cloudflare&logoColor=white)

<sub>iOS - Android - Web : one codebase</sub>

</div>

---

## What it does

Sightseer is a social journal for places. You review somewhere on a 0–10 scale, attach photos, tag
who you were with, and it lands in your followers' feed. On top of that:

|                                 |                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Automatic trip detection**    | Set up to 5 home locations. Reviews posted more than 10 miles from all of them get grouped into a **trip**, labelled with wherever the majority of it happened — and offered up as a travel book in one tap. |
| **Travel books**                | Collaborative, chronological trip journals. Invite people, and everyone's own reviews from the trip flow in. Publish a recap to the feed when it's done.                                                     |
| **Boards**                      | Pinterest-style collections of any reviews — yours or anyone else's — with list, ranked, grid and map views.                                                                                                 |
| **Photo-first review creation** | Point it at your camera roll and it reads EXIF location and dates to build drafts for you: one review per photo, or one review for a whole batch.                                                            |
| **Profile prompts**             | Answer prompts with text, a photo, a review, a board, a travel book, or a place. Each is rendered as its own card layout.                                                                                    |
| **Maps everywhere**             | Discover reviewed places nearby, see a profile's visited regions, or open any trip full-screen.                                                                                                              |
| **Discover**                    | Editorial articles, admin-featured boards, and globally popular locations.                                                                                                                                   |

### The rating stamp

Ratings render as a **postage stamp**, drawn in Skia from a real perforated-frame vector, with a
liquid-glass fill whose colour tracks the score. Each one is randomly tilted and positioned, leaning
off the corner of the card like something actually stuck on an envelope — but seeded deterministically
per post, so it never reshuffles between renders.

---

## Tech stack

### Core

| Tool                                                                                 | Why it's here                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [**Expo**](https://expo.dev) SDK 57                                                  | Managed native tooling, config plugins, and one build pipeline for three platforms |
| [**React Native**](https://reactnative.dev) 0.86 · [**React**](https://react.dev) 19 | The app runtime, on the New Architecture                                           |
| [**TypeScript**](https://www.typescriptlang.org) 6                                   | Strict throughout, including generated database types                              |
| [**Expo Router**](https://docs.expo.dev/router/introduction/)                        | File-based routing with typed routes and `Stack.Protected` auth guards             |
| [**React Native Web**](https://necolas.github.io/react-native-web/)                  | The same codebase ships to browsers                                                |

### Backend

| Tool                                                       | Why it's here                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [**Supabase**](https://supabase.com)                       | Postgres, auth, realtime, and edge functions                                 |
| **Postgres + PostGIS**                                     | Place hierarchies, geography columns, and radius/bounding-box queries        |
| **Row Level Security**                                     | Every application table. Privacy is enforced in the database, not the client |
| **Supabase Edge Functions** (Deno)                         | 13 functions holding the storage credentials, issuing presigned URLs         |
| [**Cloudflare R2**](https://developers.cloudflare.com/r2/) | Photo, avatar and cover storage via short-lived presigned uploads            |

### Graphics, motion & maps

| Tool                                                                                                        | Why it's here                                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [**React Native Skia**](https://shopify.github.io/react-native-skia/)                                       | The rating stamp and the liquid-glass rating slider, incl. a custom SkSL shader      |
| [**Reanimated**](https://docs.swmansion.com/react-native-reanimated/) 4 + **Worklets**                      | Card shuffles, heart bursts, hide-on-scroll nav, slider gestures                     |
| [**Gesture Handler**](https://docs.swmansion.com/react-native-gesture-handler/)                             | Drag-to-rate, double-tap-to-like                                                     |
| [**Mapbox**](https://www.mapbox.com)                                                                        | `@rnmapbox/maps` on native, `mapbox-gl` on web, Static Images API for map thumbnails |
| [**Expo Image**](https://docs.expo.dev/versions/latest/sdk/image/) · **Linear Gradient** · **Glass Effect** | Media rendering and the brand's glass/gradient surfaces                              |

### Platform APIs

`expo-location` · `expo-image-picker` · `expo-image-manipulator` · `expo-contacts` · `expo-haptics` ·
`expo-crypto` · `expo-apple-authentication` · `@react-native-google-signin/google-signin` ·
[**Google Places API**](https://developers.google.com/maps/documentation/places/web-service/overview)
(autocomplete, details, nearby search)

### Build & tooling

| Tool                                                       | Why it's here                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [**EAS Build**](https://docs.expo.dev/build/introduction/) | Cloud builds and internal distribution for device testing                            |
| [**Supabase CLI**](https://supabase.com/docs/guides/cli)   | Migrations and generated types (`database.types.ts` is generated, never hand-edited) |
| **ESLint**                                                 | `expo lint`                                                                          |
| [**Claude Code**](https://claude.com/claude-code)          | Used heavily as a pair-programmer throughout                                         |

---

## Architecture notes

A few decisions worth calling out:

- **Trips are derived, not stored.** They're recomputed from `visits` on every read by a
  `security definer` RPC, so a new review extends the right trip with no sync step. Only user
  _overrides_ — the display level, the linked travel book, dismissals — are persisted.
- **Trip labels use majority, not common ancestor.** Labelling a trip by the deepest place containing
  _every_ review meant one airport layover in Chicago turned a Seattle trip into "United States." It
  now picks the most specific place holding a strict majority of the reviews.
- **Home locations are never readable by anyone else.** Trip grouping is visible to everyone, but only
  because the RPC is `security definer` and returns the groupings — never the home locations behind them.
- **The feed is a plain ScrollView, deliberately.** `FlatList` virtualises cells, which on Android
  requires clipping each cell to its own bounds — that clipped the rating stamp's intentional overhang.
- **Width caps live on scroll _content_, not the scroll frame.** Capping the frame makes a mouse wheel
  in the margins of a wide browser window hit nothing.

---

## Getting started

### Prerequisites

Node 20+, and a Supabase project. For device builds, an Expo account and the EAS CLI.

```bash
git clone <repo-url>
cd alien-app
npm install
```

### Environment

Copy the template and fill it in — see [`.env.example`](.env.example) for what each key is and where
it comes from.

```bash
cp .env.example .env.local
```

> **Note**
> `EXPO_PUBLIC_*` values ship in the client bundle by design. The Supabase anon key is safe there
> because RLS does the enforcing. The R2 credentials are **not** prefixed and must stay server-side —
> they're only ever read by edge functions.

### Database

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # apply migrations
npx supabase functions deploy # deploy edge functions
```

### Run it

```bash
npx expo start          # dev server
npx expo start --web    # browser
npm run android         # local native build
npm run ios
```

Native modules (Skia, Mapbox, Google Sign-In, Apple Sign-In) mean Expo Go won't work — you need a
[development build](https://docs.expo.dev/develop/development-builds/introduction/):

```bash
npx eas build --profile development --platform ios
```

---

## Project layout

```
src/
├── app/            # Expo Router routes — screens and layouts
│   ├── (auth)/     # sign-in, sign-up, password reset
│   ├── (tabs)/     # feed, explore, create, boards, profile
│   └── ...         # visit, place, board, travel-book, trip, settings
├── components/     # shared UI — feed cards, maps, pickers, stamps
├── lib/            # data access, Supabase client, domain logic
├── hooks/          # theme, tab paging, scroll behaviour
└── constants/      # theme tokens, prompt catalogue

supabase/
├── migrations/     # schema, RLS policies, RPCs
└── functions/      # Deno edge functions
```

---

## Status

An actively developed side project.

---

## License

Copyright © 2026 Owen Curran. **All rights reserved.**

This source is public to be read, not reused — see [`LICENSE`](LICENSE). Feel free to look around,
learn from it, or ask me about any of it; please don't ship it.
