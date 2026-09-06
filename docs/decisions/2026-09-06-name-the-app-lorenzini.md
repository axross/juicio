---
status: superseded
superseded_by: 2026-09-06-keep-lorenzini-after-the-store-policy-and-trademark-review.md
---

# Name The App Lorenzini

## Context

`docs/decisions/2026-09-05-name-the-app-fuka.md` set the display name to
Fuka, keeping `juicio` as this repository's internal codename and identifier
throughout. After that record was accepted and its change begun, the
maintainer (`@axross`) reconsidered and chose a different display name
instead: **Lorenzini**. This record supersedes that one and carries the same
identifier-scoped decision forward under the new name.

## Decision

The display name is **Lorenzini** — after the *ampullae of Lorenzini*, the
electroreceptor organs sharks and rays use to detect prey, named for the
17th-century ichthyologist Stefano Lorenzini who first described them. The
reference continues the same two themes the original naming brainstorm asked
for: analysis and detection, and the shark/sea illustration Analyze's own
empty state already draws on.

As with Fuka before it, only the display name changes: it is set in
`app.json`'s `expo.name` field and in `app.config.ts`'s matching local
fallback, in Latin script, spelled identically for the English and Japanese
locales alike — no katakana or kanji rendering is added anywhere.

## Alternatives considered

- **Fuka**, the previously accepted name (see the superseded record). Set
  aside by the maintainer's own reconsideration rather than a newly
  discovered conflict; its accepted risks (the ふか → 不可/負荷 homophone, the
  near-profanity reading in English, and its taken domains and handles)
  stand as recorded there and are not why it was dropped.
- **Thresher**, rejected earlier for a live United States trademark
  conflict — unaffected by this change, see the superseded record.

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
- The SQLite database filename (`juicio.db`, `src/core/db/client.ts`) and the
  settings storage-key prefix (`juicio.settings.*`,
  `src/features/settings/adapter/settings-storage.ts`) both stay
  `juicio`-prefixed. Either is how the app finds data it already wrote;
  renaming either would orphan every existing install's on-device data for a
  change nothing in the product surfaces to a player.

## Accepted risks

- **Japanese pronunciation/memorability.** The standard katakana
  transliteration, ロレンツィーニ, is a six-mora loanword ending in the
  "-ツィーニ" cluster — longer and less naturally pronounced than either
  Fuka or Thresher. No negative meaning or homophone collision was found;
  the risk is usability and memorability, not connotation.
- **Existing non-competing uses of the name.** "Lorenzini" is already an
  Italian apparel brand (a shirtmaker trading since 1920) and names at least
  two unrelated apps found in web search — an Italian logistics/terminal
  notification app and a restaurant-ordering app — plus assorted equestrian
  and clothing use. No poker, card-game, or gambling product using the name
  was found in either case, but the general commercial namespace is more
  crowded than Fuka's was.
- **Domain and handle status is mixed, not clear.** `lorenzini.com` is
  registered and in active use (a family site) and `lorenzini.it` hosts the
  apparel brand; `lorenzini.app` and `lorenzini.io` returned no hits either
  way, which is inconclusive rather than confirmed availability. The bare
  `lorenzini` handle on GitHub, npm, and X was not confirmed taken, but was
  also not confirmed available — only longer handles incorporating the name
  were found in use.
- **No formal trademark register was queried.** As with Fuka, no
  USPTO/EUIPO/WIPO/J-PlatPat search was performed — only a web search, which
  surfaced no live trademark dispute for "Lorenzini" in Class 9 (software) or
  Class 41 (entertainment). A conflicting registered mark could still exist
  that this search did not surface.

## Consequences

`app.json`'s `expo.name` and `app.config.ts`'s local fallback both resolve to
`Lorenzini`; every identifier and storage name listed above is unchanged.
README.md and AGENTS.md's project-overview line now introduce the product as
Lorenzini, naming `juicio` as the codename in the same sentence, matching the
direction the rest of this repository already keeps calling it by.
`docs/decisions/2026-09-05-name-the-app-fuka.md` is marked `superseded` and
points here.
