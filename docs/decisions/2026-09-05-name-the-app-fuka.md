---
status: superseded
superseded_by: 2026-09-06-name-the-app-lorenzini.md
---

# Name The App Fuka

## Context

The product has never had a public name. `juicio` is this repository's
internal codename — it is the only name the iOS bundle identifier, the
Android package, the Expo slug, the deep-link scheme, the npm package, the
SQLite database filename, and the settings storage-key prefix have ever
carried — and `espada` separately names the equity engine
(`modules/espada-engine/`). Neither was ever meant to reach a player, and the
maintainer (`@axross`) kept both off the table for a public name.

The maintainer asked for candidates built around two themes: analysis,
judgment, and foresight, matching what the app itself is for — reviewing a
hand after the fact rather than playing it — and water, the sea, and the
shark-and-fish illustration Analyze's own empty state already draws on.

## Decision

The display name is **Fuka** — 鱶 (fuka, a large shark) and 深 (fuka, deep) —
set only in `app.json`'s `expo.name` field and in `app.config.ts`'s matching
local fallback, in Latin script, spelled identically for the English and
Japanese locales alike. No katakana or kanji rendering is added anywhere;
Latin-script "Fuka" is the whole of the display name in both locales.

## Alternatives considered

- **Sharkscope, Orca, Faro, Fathom, Sonar, Periscope, Current(s).** Rejected:
  each lands in an already-crowded naming space rather than a distinct one —
  shark- and fish-named poker software is dense already (SharkScope,
  PokerSharkAI, FishPoker, Poker Fish, Orca Poker), so any of these reads as
  one more entry in that set rather than as its own name.
- **Thresher**, the runner-up. Rejected: a live United States trademark
  registration in Class 9 (software) is held by Thresher Ventures / Two Six
  Technologies, and a June 2026 Trademark Trial and Appeal Board opinion
  treats THRESHER and THRASHER as highly similar marks — too close a live
  conflict to build a public name on.

## Identifiers and storage names kept as `juicio`

Nothing that identifies the app to a platform, a build tool, or an existing
install changes:

- The iOS bundle identifier (`app.axross.juicio`), the Android package
  (`app.axross.juicio`), the Expo slug (`juicio`), and the deep-link scheme
  (`juicio`) all stay as they are. Google Play and App Store Connect both
  treat a package/bundle identifier as fixed for the life of an app record;
  changing it would mean new app records on both stores, a new Firebase App
  Distribution registration, a new provisioning profile, and edits across
  `fastlane/`, all four CI workflows, and all 23 Maestro flows under
  `e2e/flows/` that already assume the current identifiers — for a rename no
  player ever sees, since neither store surfaces a bundle or package
  identifier to them.
- The npm package name stays `juicio`. It already matches the repository's
  own name, and no one outside this repository's own tooling ever reads it.
- The SQLite database filename (`juicio.db`,
  `src/core/db/client.ts`) and the settings storage-key prefix
  (`juicio.settings.*`, `src/features/settings/adapter/settings-storage.ts`)
  both stay `juicio`-prefixed. Either is how the app finds data it already
  wrote; renaming either would orphan every existing install's on-device data
  for a change nothing in the product surfaces to a player.

## Accepted risks

- Read aloud, ふか (fuka) suggests 不可 (impossible) or 負荷 (load, burden) to
  a Japanese ear before it lands on 鱶 or 深.
- "Fuka" sits one sound away from an English profanity.
- `fuka.app`, `fuka.com`, `fuka.io`, and `fuka.jp`, and the GitHub, npm, and X
  handles for "fuka", are all already taken.
- No formal trademark register — USPTO, EUIPO, WIPO, or Japan's J-PlatPat —
  was queried directly. Only a web search found no existing
  FUKA app or trademark use in poker- or gambling-adjacent Class 9, 41, or 42
  contexts, so a conflicting registered mark could still exist that search
  did not surface.

## Consequences

`app.json`'s `expo.name` and `app.config.ts`'s local fallback both resolve to
`Fuka`; every identifier and storage name listed above is unchanged.
README.md and AGENTS.md's project-overview line now introduce the product as
Fuka, naming `juicio` as the codename in the same sentence rather than as the
product's own name — the direction every other file in this repository, this
record included, keeps calling it by.
