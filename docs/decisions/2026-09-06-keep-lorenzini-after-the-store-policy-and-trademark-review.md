---
status: accepted
---

# Keep Lorenzini After The Store Policy And Trademark Review

## Context

`docs/decisions/2026-09-06-name-the-app-lorenzini.md` (accepted) set the
display name to Lorenzini, but it was written from a lighter search before a
deeper collision check on the name had run. That deeper check followed,
alongside a review of what the App Store's and Google Play's own policies
say about a listed name, and of what enabling in-app purchases on either
store requires. The maintainer (`@axross`) then asked whether the collisions
the deeper check turned up would block distribution on either store or block
adding in-app purchases later, and — finding that they would not — chose to
keep the name rather than search for a replacement.

## Decision

The display name stays **Lorenzini**. Japanese-language copy follows the
rendering rule `docs/operations/store-listing.md` states. The in-app display
name itself is unchanged from the 2026-09-06 decision: Latin-script
"Lorenzini" in both the English and Japanese locales, set in `app.json`'s
`expo.name` field and `app.config.ts`'s matching local fallback.

## Alternatives considered

- **Fuka**, the name accepted before Lorenzini, and **Thresher**, the
  runner-up rejected for a live United States Class 9 trademark conflict.
  Both are unaffected by this review; see
  `2026-09-05-name-the-app-fuka.md` and `2026-09-06-name-the-app-lorenzini.md`
  for the reasoning that set each aside.
- **The 2026-09-05 backup pool of 58 candidates**, kept here as the starting
  point for any future rename. Cleared, in order of fit: Lorenzini, Hirame,
  Shiome, Mikiri, Oleaje, Fukami, Nereus, Cardumen, then Lamna, Alopias,
  Squalus, Wobbegong, Pilotfish, Lateral Line, and Isana. Blocked, each for
  an existing product or brand already using it: Triton (the established
  Triton Poker Series), Augur (an Ethereum prediction-market app), Sightline
  (Sightline Payments, a casino and sports-betting payments processor),
  Barracuda (Barracuda Networks, and a casino's own poker room), Uzu
  (PlayUZU, a licensed online casino), Shinkai (SHINKAI POKER, a browser
  hold'em site), Pecera (La Pecera Póker, a poker club and academy), Atalaya
  (La Atalaya, the Jehovah's Witnesses' magazine), and Fishfinder (already
  the term for table-selection software in online poker).

## Accepted risks

Corrected against what the 2026-09-06 record stated from its lighter search:

- **A live trademark registration exists that the earlier record's search
  did not surface**, in a class unrelated to software.
  `docs/operations/store-listing.md` records the registration's details, the
  reasoning why it does not ordinarily reach this app, and the
  complaint-handling procedure.
- **Plain-word search results are dominated by surnames and the shirt
  brand, not the organ the name refers to.** No poker, card-game, or
  gambling product using the name was found.
- **Handles and domains are mixed, not uniformly available.** The bare
  `lorenzini` handle is taken on GitHub, X, Instagram, and TikTok, and free
  on npm. `lorenzini.app`, `lorenzini.io`, `lorenzini.jp`, `lorenzini.poker`,
  `getlorenzini.com`, and `lorenzinipoker.com` were all unregistered as of
  2026-09-06.
- **No trademark register was queried directly**, in this review any more
  than in the earlier one — only web search, which surfaced the one
  registration noted above and nothing else in a software- or
  entertainment-adjacent class.
- **App Store Connect's own availability of the name remains unverified**
  until an app record is actually created there.
- **The earlier record's katakana claim was wrong.** The corrected
  rendering, and the reasoning behind it, is stated in
  `docs/operations/store-listing.md`.

## Consequences

This record supersedes `2026-09-06-name-the-app-lorenzini.md`, which is
marked `superseded` and points here. `docs/operations/store-listing.md`
holds the operational facts this decision rests on — the store policies, the
complaint procedure, the in-app-purchase prerequisites, and the Japanese
rendering rule — rather than restating them here. Nothing in the app, its
configuration, or its identifiers changes.
