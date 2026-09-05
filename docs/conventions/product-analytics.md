# Product Analytics

This project's own rules for tracking product usage with Amplitude
(issue #211): the one wrapper a change MUST go through, the event- and
property-naming convention that wrapper enforces, how the on-device opt-out
preference works, and what a new call site MUST test. It does not cover
Amplitude's own dashboard, project setup, or data-deletion tooling — only
what this codebase does before an event ever leaves the device.

## One Wrapper Owns the Vendor SDK

A change MUST reach Amplitude only through
[`src/core/instrumentation/analytics.ts`](../../src/core/instrumentation/analytics.ts),
and MUST NOT import `@amplitude/analytics-react-native` from anywhere else —
the same rule this project's error tracker already follows for
`@sentry/react-native` (see
[`sentry.ts`](../../src/core/instrumentation/sentry.ts)). That module owns
three exports a call site actually uses:

- `trackEvent(name, properties)` — reports a product event. Typed against
  the closed `Events` map declared in that file, so a call site can only
  name an event this document already lists, with exactly that event's own
  payload shape.
- `identifyUserProperty(name, value)` — sets an ongoing profile attribute
  (`Language`, `Theme` today), typed against the closed `UserProperties` map
  in the same file.
- `setAnalyticsEnabled(enabled)` — the on-device preference's one write path
  into this module; see [The On-Device Preference](#the-on-device-preference)
  below. A call site never calls this directly.

`initAnalytics()` is called exactly once, from
[`analytics-boot.ts`](../../src/core/instrumentation/analytics-boot.ts),
imported for its side effect from `src/main.ts` — mirroring
[`sentry-boot.ts`](../../src/core/instrumentation/sentry-boot.ts) exactly.
Both `trackEvent` and `identifyUserProperty` are silent no-ops whenever no
`EXPO_PUBLIC_AMPLITUDE_API_KEY` is configured or the on-device preference is
off; neither throws into its caller, and neither ever blocks the interaction
that triggered it — a plain checkout or a local development build with
neither variable set keeps sending nothing, the same way this project's
Sentry integration already behaves with no DSN configured.

## Event Names Are Title Case, `[Noun] [Past-tense Verb]`

A change MUST name an event in Title Case, in `[Noun] [Past-tense Verb]`
order — `Session Started`, `Screen Viewed`, `Board Confirmed`, `Player
Added`, `Player Removed`, `Equity Breakdown Viewed` — per
[Amplitude's own Data Planning Playbook](https://amplitude.com/docs/data/data-planning-playbook),
**not** this project's installed `software-instrumentation` skill's generic
lowercase, space-separated default. The maintainer's own choice (issue #211):
Amplitude's playbook states plainly that casing is significant to it —
`Song Played` and `song played` are two distinct events on the vendor's own
side — so this project picks one scheme for every event it ever sends,
rather than leaving a future event to guess which convention applies. A
change MUST NOT add a near-duplicate event differing from an existing one
only in casing.

## Property Keys Are Title Case With Spaces, Converted at the Wrapper Boundary

A call site MUST spell a property key in ordinary, idiomatic camelCase
(`screenName`, `method`) — never with a space in it. `trackEvent` and
`identifyUserProperty` are what convert every key to its Title Case wire
form (`Screen Name`, `Method`) before it ever reaches the SDK, in the one
place this conversion happens
(`toWireKey`/`toWireProperties` in `analytics.ts`). This mirrors the same
convention's own property-naming examples (`Item Type`, `Payment Type`), and
keeps a call site from ever having to write an object key as a quoted
string with a literal space in it.

## Property Values: The Label the Person Saw, or a Closed Internal Token

A property's **value** MUST be one of two things, chosen per value, not per
event:

- **The exact user-facing label the person actually saw**, when the value
  has one — a screen's own fixed name (`Screen Name`: `Analyze`, `History`,
  `Hand Range Preset`, `Settings`, `Feedback`, `Language`, `Theme`,
  `Analytics`, from
  [`screen-name.ts`](../../src/core/navigation/screen-name.ts)), or a
  language's own display name (`Language`: `English (United States)`,
  `日本語`). Each of these is deliberately **this project's own fixed label,
  not a live-translated string** — `screen-name.ts`'s own doc comment,
  and `change-theme.ts`'s and `change-language.ts`'s own
  `*_ANALYTICS_LABELS` tables, explain why: an analytics dimension MUST NOT
  fragment into two dashboard values for the same underlying thing depending
  on which language the reporting device happens to be set to. `Theme`
  (`System`, `Light`, `Dark`) follows the identical reasoning, even though no
  event property named it as an example directly.
- **A short, closed, lowercase `snake_case` token**, when the value is a
  purely internal category with no user-facing label of its own — `Method`
  (`Player Added`'s own property) is `hole_cards` | `range`, this project's
  own internal distinction that never appears as visible copy anywhere in
  the app.

A change adding a new event or property MUST decide, explicitly, which of
these two a new value is, rather than defaulting to whichever is easiest to
write at the call site.

## The Event Catalogue

| Event | Fires when | Properties |
| --- | --- | --- |
| `Session Started` | Once per app launch, after every persisted setting — the analytics preference included — has already been applied (`src/app/_layout.tsx`'s own `ready`-gated effect). | none |
| `Screen Viewed` | On navigating to a recognized top-level screen, from one router-level subscription (`use-track-screen-views.ts`), not from each screen individually. | `screenName` |
| `Board Confirmed` | The board input sheet's Confirm action. | none |
| `Player Added` | A player added to the Analyze players list, from either tab of the card/range input sheet. Never fires for an edit of an existing player. | `method` (`hole_cards` \| `range`) |
| `Player Removed` | A player removed from the Analyze players list, via its row's swipe-to-delete gesture or its accessibility delete action. Guarded against a no-op removal (an `id` no longer in the list) the same way `replacePlayerHolding` already guards a no-op edit — see [`use-players.ts`](../../src/features/evaluations/adapter/use-players.ts). | none |
| `Equity Breakdown Viewed` | A hand-range player row's own detail press opening the Equity Breakdown sheet. Never fires for a hole-cards row, which has no such affordance. | none |

`Language` and `Theme` are **user properties**, not events — see
[User Properties, Not Events, For Ongoing Settings](#user-properties-not-events-for-ongoing-settings)
below.

## `Screen Viewed` Fires From One Router-Level Hook

A change MUST fire `Screen Viewed` from
[`use-track-screen-views.ts`](../../src/core/navigation/use-track-screen-views.ts),
mounted once from the root layout, rather than adding a call to each screen
component individually — the same shape the reference design this plan
investigated (`axross/cunnpe`) uses for its own screen tracking, chosen so a
future screen is covered by already being added to
[`screen-name.ts`](../../src/core/navigation/screen-name.ts)'s pathname
table, without a second call site to remember. A pathname that map doesn't
recognize is skipped entirely, never tracked as `screenName: undefined`.

## User Properties, Not Events, For Ongoing Settings

A change MUST record a setting that describes who the person currently is —
not something that happened — as a user property (`identifyUserProperty`),
never as its own tracked event. `Language` and `Theme` are this project's
two: each changes rarely, describes an ongoing state rather than a
one-off occurrence, and would add no value sliced by time the way a real
event does. Both are set at the exact point the setting already changes
today (`change-language.ts`, `change-theme.ts`), not from a new call site
invented for analytics alone.

## The On-Device Preference

A person's analytics preference persists on-device, in `AsyncStorage`,
alongside the existing language and theme preferences — see
[`analytics-preference.ts`](../../src/features/settings/model/analytics-preference.ts)
and
[`settings-storage.ts`](../../src/features/settings/adapter/settings-storage.ts).
It defaults to **on**. Settings' `About` section carries a disclosure row,
`Analytics`, beneath `Feedback`, that opens a child screen holding the one
switch that turns it off and back on
([`analytics-screen.tsx`](../../src/features/settings/ui/analytics-screen.tsx)).
Turning it off stops every further event in the same running session
immediately, with no app restart; turning it back on resumes sending, the
same way.

The preference lives in `src/features/settings/` — a features-layer
module — but the gate it controls lives in `analytics.ts`, under `core/`.
`core/` MUST NOT import a features-layer module
([`directory-structure.md`](./directory-structure.md)'s one-way import
direction), so the dependency runs the other way: `analytics.ts` exposes a
plain `setAnalyticsEnabled(enabled)` setter, and
[`use-analytics-preference.ts`](../../src/features/settings/adapter/use-analytics-preference.ts)
is the one place, in `features/settings/adapter/`, that calls it — pushing
the value into `core/` rather than having `core/` reach up into a feature to
read it. This mirrors `apply-theme-instruction.ts`'s own adapter-pushes-
into-a-lower-layer shape, just in the opposite direction: that module pushes
into a vendor runtime `core/theme/` wraps, and this one pushes into a plain
gate `core/instrumentation/` exposes for exactly this purpose.

## What This Change Deliberately Does Not Track

A change MUST NOT instrument a screen or a result that is still a
placeholder — today's example is the preset editor's own field-less stub
(see [specs/hand-ranges.md](../specs/hand-ranges.md)'s "The Preset Editor"),
which `screen-name.ts` leaves out of its map for exactly this reason — since
measuring a placeholder only reports how often a form idle behind a chevron
was seen, not real usage. A change MUST NOT identify a person by any
personal or persistent cross-app identifier: this project has no accounts or
sign-in, and every event stays anonymous (device-scoped). A change MUST NOT
turn on any of Amplitude's own default autocapture beyond `Session Started`
and `Screen Viewed` above — `initAnalytics()` passes `autocapture: false` and
`trackingSessionEvents: false` explicitly, so a session or a screen view is
never reported twice, once by this project's own call and once by the SDK's
own default instrumentation.

## Testing a New Call Site

A change adding a new tracked event or user property MUST assert the exact
event name (including its exact Title Case spelling) and payload — or the
exact user property name and value — at its own call site, mocking
`@/core/instrumentation/analytics` the same way an existing call site's test
already does (e.g.
[`use-players.test.ts`](../../src/features/evaluations/adapter/use-players.test.ts),
[`analyze-screen.test.tsx`](../../src/features/evaluations/ui/analyze-screen/analyze-screen.test.tsx)).
`analytics.ts` itself carries its own test
([`analytics.test.ts`](../../src/core/instrumentation/analytics.test.ts)),
mocking `@amplitude/analytics-react-native` directly, covering the API-key
and preference gates and the camelCase-to-Title-Case key conversion — a call
site's own test does not need to re-prove any of that, only that it called
`trackEvent`/`identifyUserProperty` with the right name and payload.
