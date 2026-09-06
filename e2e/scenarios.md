# E2E scenario catalog

This file is the source of truth for which user journeys the end-to-end
suite is expected to cover. Each scenario has a stable identifier
(`SCN-NNN`) that never changes once assigned, even if the scenario's
description is edited later.

A scenario is considered covered when a Maestro flow file named
`e2e/flows/<id>.yaml` exists (for example, `SCN-001` is covered by
`e2e/flows/SCN-001.yaml`). `e2e/check-scenario-coverage.mjs` enforces this
and fails the build if a catalogued scenario has no matching flow.

To add a scenario: append a new `## SCN-NNN: <title>` section below, then
add its flow file under `e2e/flows/`.

## SCN-001: App launches and shows the Analyze tab

Launching the app lands on the Analyze tab, active, without crashing. Its
identifier is stable for the life of the project — the phase that built the
four-tab shell changed what it asserts (it used to assert the placeholder
`Juicio` home screen, now deleted) rather than retiring it.

## SCN-002: Moving between all four tabs shows each one's content

Tapping History, Presets, and Settings in turn, then back to Analyze, shows
each tab's own nav-bar title and content, and marks the tapped tab active.

## SCN-003: Switching the language to 日本語 and back

From Settings, opening the `Language` child screen and selecting `日本語`
changes the visible strings — the tab labels, the Settings screen's own
section headings, and the `Language` screen's own nav-bar title — to
Japanese without a reload. Selecting `English (United States)` again changes
them back. `Language` and `Theme` moved onto their own child screens in
issue #76; this scenario's identifier is stable for the life of the
project — it now reaches the same selection through that screen rather than
a radio row on Settings itself.

## SCN-004: Switching the theme to Light

From Settings, opening the `Theme` child screen and selecting `Light` marks
that row selected immediately. Moved onto that child screen in issue #76,
same as SCN-003 above.

## SCN-005: Relaunching after switching the language persists the choice

After selecting `日本語` on the `Language` child screen, force-quitting and
relaunching the app opens it in Japanese, with no visible flash of English.

## SCN-006: Relaunching after switching the theme persists the choice

After selecting `Light` on the `Theme` child screen, force-quitting and
relaunching the app opens it with `Light` still selected.

## SCN-007: Tapping Feedback and returning

From Settings, tapping the `About` section's `Feedback` row opens the
Feedback screen, showing its own nav bar. Tapping its back affordance
returns to Settings without crashing.

## SCN-008: Opening the Preset editor from the Presets tab's new-preset action, and returning

From the Presets tab's empty state, tapping the persistent `+ New Preset`
floating action button opens the Preset editor route in create mode,
showing its own nav bar titled `New Preset`. Tapping its back affordance
returns to the Presets tab, still showing its own empty state, unaffected.
The native job demo this identifier originally exercised was removed
outright by issue #176, which replaced the whole Presets tab with the real
Preset list screen — this scenario's identifier is stable for the life of
the project, the same way SCN-001's own precedent already allows; it now
proves the new screen's own create-entry-point and editor-stub navigation
rather than the retired demo. SCN-020 below covers that screen's other own
journey, browsing and filtering the list itself.

## SCN-009: Switching the theme through a same-theme transition

On the `Theme` child screen, pressing `Light`, then `System`, then `Dark`,
then `System` in that order moves the radio to each tapped row in turn.
Whichever colour scheme the device's OS is in, one of the two `System`
presses in this sequence resolves to the same theme as the option selected
just before it — `System` after `Light` while the OS is light, or `System`
after `Dark` while it's dark — so this flow catches the same-theme-transition
regression (#20) without depending on the device's OS setting either way.
Issue #76 extends that same fix across two screens, sharing one store rather
than a single screen's own local state, so this flow also returns to
Settings afterward and confirms its `Theme` row shows the same `System`
value the child screen ended on.

## SCN-010: Cold-launching with the selected theme differing from the device colour scheme

With the device's own colour scheme set to Light, selecting `Dark` on the
`Theme` child screen marks that row selected. Force-quitting and
relaunching — the device left on its own Light scheme throughout — keeps
`Dark` selected and every tab still reachable, reproducing the exact launch
ordering issue #68 was filed against.

This scenario proves that the theme selection survives the relaunch and that
the tab bar stays reachable afterward; it does not, and cannot, assert the
tab bar's rendered colour — Maestro has no colour-assertion command in this
suite's vocabulary. The defect's actual symptom (the tab bar's background
painted in the wrong theme's colour) is confirmed by the maintainer's own
device check, not by this flow.

## SCN-011: Opening the card/range input sheet from + New Player and dismissing it

From the Analyze tab's empty state, tapping the persistent `+ New Player`
floating action button opens the card/range input sheet, showing its two
tabs, `Cards` (selected by default) and `Hand Range`. Tapping the
`Hand Range` tab switches to it. Tapping the sheet's drag handle dismisses
it, returning to the Analyze tab's empty state without crashing. Not
covered here, because Maestro cannot assert on either: the haptic feedback
each of these touches fires, and a drag-based dismissal (only a tap on the
handle is exercised, not a drag past the sheet's own dismiss threshold).

## SCN-012: Feedback's Send validates on press and reports unavailable from a development build

From the Feedback screen (SCN-007 covers reaching it), Send starts pressable
with the Message field still empty — it is never disabled, per the
high-fidelity-ui-design skill's disabled-vs-validate-on-press rule — and
tapping it in that state shows an
inline `A message is required.` error under the Message field rather than
sending anything. Typing a message and tapping Send again shows the
`unavailable` message rather than completing: a development build carries no
`EXPO_PUBLIC_SENTRY_DSN` by default, so `Sentry.getClient()` returns
`undefined` and `canSendUserFeedback()` reports `false` deterministically —
see `src/core/instrumentation/user-feedback.ts` and
docs/specs/settings.md. This scenario cannot reach the completion state,
which needs a real Sentry client, and does not attempt to.

## SCN-013: Picking board cards from a board slot and dismissing the sheet

From the Analyze tab, tapping one of the board's five slots opens the board
input sheet, showing its own five preview slots and the fanned card picker
directly beneath the drag handle — no tab row and no heading, both of which
would ride the sheet's header chrome, so the flow asserts that chrome never
renders. Tapping three cards in the fan fills the first three preview slots
in turn. Tapping the sheet's drag handle dismisses it, returning to the
Analyze tab with the board still showing five empty slots, since nothing
yet reads what the sheet submits. Not covered here, because Maestro cannot
assert on any of them: the haptic feedback each of these touches fires, the
fade a board slot shows while a finger is down on it, and which preview
slot carries the focus ring. The absence of a confirm button is not covered
either, for a different reason — the sheet draws none, so there is no id or
copy for an `assertNotVisible` to name.

## SCN-014: Adding a player from the empty state, then swiping the row away

From the Analyze tab's empty state, tapping the persistent `+ New Player`
floating action button opens the card/range input sheet (SCN-011 covers the
sheet's own tabs and its handle-tap dismissal), switching to `Hand Range`
and tapping the `55+` shorthand chip selects a range. Tapping the sheet's
drag handle submits it, replacing the empty state with the players list: a
row showing the `Player 1` label and its own card-pair-count subtitle. The
FAB stays visible, floating above the list the same way it floated above
the empty state. Swiping that row left past the design's own commit offset
deletes it without a further tap, returning the screen to the empty state,
still with the FAB floating above it. Not covered here, because Maestro
cannot assert on either: the haptic feedback the swipe and the delete both
fire, and the row's own accessibility-action deletion path (SCN-014
exercises the gesture, not the alternative it exists alongside).

## SCN-015: Editing a player's holding by tapping its row preview

From the Analyze tab's empty state (SCN-014 covers reaching it), adding a
hand-range player the same way SCN-014 does. Tapping that row's own preview
— not the rest of the row — reopens the card/range input sheet, this time
on the `Hand Range` tab with the `55+` selection already showing (this
scenario's own proof that the sheet reseeds from the player being edited,
rather than opening blank). Tapping the `A2s+` shorthand chip changes the
selection, and tapping the sheet's drag handle submits it: the row still
reads `Player 1` — the same player, its number and position unchanged —
with its subtitle's own card-pair count now reflecting the new selection.
Not covered here, because Maestro cannot assert on it: the haptic feedback
the preview tap fires, and the row's own accessibility-action edit path
(SCN-015 exercises the tap, not the alternative it exists alongside).

## SCN-016: A player's own hole cards lock out of the board sheet, and a discarded board reports itself

From the Analyze tab's empty state, tapping the persistent `+ New Player`
floating action button opens the card/range input sheet on its default
`Cards` tab (SCN-011 covers the sheet's own tabs); tapping the spades and
hearts arcs fills both hole-card
slots, and tapping the sheet's drag handle submits it, replacing the empty
state with the players list's own `Player 1` row (SCN-014 covers this same
add-a-player shape). Tapping one of the board's five slots then opens the
board input sheet: its own fan now renders at least one card in the
unavailable state — dimmed, slashed, and carrying an accessibility label
ending `unavailable` (issue #99) — proving the player's own hole cards are
excluded from the board's picker. Tapping the clubs arc once fills the
board sheet's own first preview slot, and tapping the drag handle at that
one-card count dismisses the sheet rather than submitting: the Analyze
board still reads `Board card 1 is not selected` afterward — the previously
empty board, left untouched — and the Analyze toast appears, reading the
board's own `IncompleteBoard` message.

This flow never learns which of the fan's thirteen spades or thirteen
hearts cards the player actually ends up holding — neither card carries a
testID of its own, and the fan's own touch handling resolves geometrically
rather than by hit-testing an individual card (see
docs/specs/hand-ranges.md's "Known accessibility gap in the fan") — so it
asserts only that _some_ card in the board sheet's fan reads unavailable,
never which one. That is still a real proof at this point in the flow,
not a weaker stand-in for one: the board was never submitted before this
sheet opened, so the one player just added is the only source of an
unavailable card the board's picker could possibly have, and the assertion
would fail if the exclusion were broken or absent. Not covered at all,
because Maestro cannot assert on any of it: the haptic feedback every touch
in this flow fires, and the toast's own self-clearing timer and
tap-to-dismiss, neither of which this flow waits around to exercise.

## SCN-017: Opening a hand-range row's Equity Breakdown sheet from its detail press, and dismissing it

From the Analyze tab's empty state, adding a hand-range player the same way
SCN-014 does, then a second hand-range player the same way — pressing the
persistent `+ New Player` floating action button again, still floating
above the one-player list — a settled
equity result is a precondition of this scenario's own detail press, and
issue #103's own gating in `src/features/evaluations/ui/player-row/
player-row.tsx` only wires up `onDetailPress` once a result exists for that
player, which evaluation never produces for a lone player (evaluation
requires 2-3 players, `MIN_SUPPORTED_PLAYERS`/`MAX_SUPPORTED_PLAYERS` in
`src/features/evaluations/adapter/use-equity-evaluation.ts`). Tapping
Player 1's own detail region — the row except its own preview, which
SCN-015 already covers as the edit path — opens the Equity Breakdown
sheet: a heading reading `Equity Breakdown`, the chart canvas beneath it,
and — since Player 1's own range is `55+`, pocket pairs only — a `Pocket
pairs` group heading below the chart all render; this flow asserts nothing
about `Suited`/`Offsuit`, since Player 1's own range has neither. Tapping
the sheet's drag handle dismisses it, returning to
the Analyze tab with the row still reading `Player 1`, unchanged — this
sheet reports only its own dismissal, and edits nothing about the player it
showed. Not covered here, because Maestro cannot assert on any of them: the
haptic feedback the detail press and the handle tap both fire, the sheet's
own header repeating the row's preview, label, subtitle, and result figure
(identical to what SCN-014 and SCN-015 already assert the row itself
renders), and the bar chart's own bars and colours — `bar-chart.tsx`'s own
primitive draws those on a Skia canvas Maestro has no element tree into.

**Not yet confirmed end-to-end.** This scenario's flow file was corrected
to this two-player precondition without being run — no session that lacks
`modules/espada-engine`'s built native binaries can produce or observe a
real, settled equity result (`docs/operations/native-module-artifacts.md`;
no session dispatches `espada-engine-artifacts.yaml` on its own), and
Maestro does not run in this project's CI either, the same standing
constraint SCN-010's own device-only caveat above records for a different
reason. Whoever next has both a device/simulator and the built binaries
should run this flow and confirm it actually passes, watching in
particular for whether Player 1's result has settled by the time the
`detail` tap fires — this flow family has no established wait/assertion
idiom for a pending async result yet, so the flow file does not invent
one.

## SCN-018: Long-pressing and dragging a player row to reorder the list

From the Analyze tab's empty state, adding a hand-range player the same way
SCN-014 does, then a second hand-range player the same way — pressing the
persistent `+ New Player` floating action button again, still floating
above the one-player list (`docs/specs/equity-analysis.md`'s "The Players
Section" — the same sheet, reached the way it always is once the list
already holds a player). `Player 1` renders above `Player 2`, the two
players' own submission order. **As of issue #226, a long press does not
lift a row while the calculation for the current players is actively
running**, so this flow waits for the progress bar to disappear
(`docs/specs/equity-analysis.md`'s "Calculating" state) before attempting
the drag below — with two players present the whole time, the gating
condition this scenario would otherwise race is the calculation, not the
player count. Long-pressing `Player 1`'s own row, then dragging it down
past `Player 2`'s own row's midpoint, reorders the list live: `Player 2`
now renders above `Player 1`. Both rows still read their own original
numbers afterward — `docs/specs/equity-analysis.md`'s own point that a
player's number stays tied to that player's identity, not to where the
list currently seats them, holds across a reorder exactly as it already
does across a deletion.

**This flow's own drag step is not a confirmed pass, on a device or
anywhere else, for a reason more specific than Maestro simply not running
in this project's CI.** `src/features/evaluations/ui/player-row/
player-row.tsx`'s own reorder gesture only ever activates once a touch has
stayed within a small radius for `./reorder.ts`'s own
`LONG_PRESS_MIN_DURATION_MS` (500ms) — `react-native-gesture-handler`'s own
native long-press gate, the same one issue #153's own plan chose over a
hand-composed `Gesture.LongPress()` (`player-row.tsx`'s own doc comment).
Maestro's `swipe` command, as of the version this project pins, has no
parameter that holds a touch in place before moving it — its own
[documented parameters](https://docs.maestro.dev/reference/commands-available/swipe)
are `start`/`end`, `direction`, `from`, `duration`, and
`waitToSettleTimeoutMs`, none of which delay the movement itself past the
gesture's own first frame; a combined "long-press, then drag" primitive is
an open feature request against Maestro itself
([mobile-dev-inc/maestro#1203](https://github.com/mobile-dev-inc/maestro/issues/1203)),
not something this project's own flow failed to find. `duration: 1500`
above is this flow's own best effort — a slower swipe moves less far in the
critical first 500ms than a fast one would — but nothing in Maestro's own
documented behaviour promises that it is slow enough to stay inside
whatever radius the native recognizer enforces on a given device.
Whoever next has a device or simulator should run this flow and record
whether the drag step actually reorders the two rows, or instead scrolls
past them (`GestureDetector`'s own composed gesture failing to claim a
touch that moves too far, too fast, falls through to the surrounding
`ScrollView`) — either outcome settles this open question for the next
session, and neither is assumed here.

## SCN-019: Dismissing the Equity Breakdown sheet by dragging its content area

Reaches the Equity Breakdown sheet the same way SCN-017 does — a two-player
precondition SCN-017's own flow file explains — but dismisses it
differently: dragging the sheet's own content area (the chart itself, which
carries no gesture or `Pressable` of its own) rather than tapping the
handle. This is the scenario issue #196 exists to prove: a sheet whose
content has nothing else to claim a drag can still be dragged closed from
anywhere inside it, not only from its 7pt handle.

**Inherits SCN-017's own "not yet confirmed end-to-end" caveat up through
opening the sheet** — a settled equity result needs
`modules/espada-engine`'s built native binaries, which no session that
produced this flow has, and Maestro does not run in this project's CI
either. The drag-dismiss step itself is new territory this project's e2e
suite has not exercised before: every other sheet dismissal this catalog
covers (SCN-011, SCN-013, SCN-016, SCN-017) uses a handle tap, and the one
existing `swipe`-driven drag (SCN-014's own swipe-to-delete) drives a
different gesture on a different surface. Whoever next has both a device or
simulator and the built binaries should run this flow and confirm the
swipe actually clears `DISMISS_DISTANCE_RATIO`
(`src/shared/ui/bottom-sheet/bottom-sheet.tsx`) rather than merely
asserting it does from Maestro's own default swipe behaviour.

**As of issue #234, the chart this flow drags from sits inside a scrolling
body**, not a plain `View` — but the drag still starts at the moment the
sheet has just opened, scrolled to its own top, which is exactly the case
`src/shared/ui/bottom-sheet/bottom-sheet.tsx`'s own content-drag gate
(`docs/decisions/2026-09-05-gate-bottom-sheet-content-drag-on-scroll-position.md`)
leaves behaving as an unconditional drag. This flow does not exercise a
drag that starts already scrolled away from the top; that handoff is the
same still-unconfirmed case that decision record's own Consequence section
names.

## SCN-020: Browsing and filtering the Preset list

From the Presets tab, with at least two saved presets differing in their
own `position` tag — created here through the real Preset editor (issue
#177), one at a time, the same way SCN-022 creates its own — tapping the
`Position` filter chip opens that axis's own value-picker sheet
(`docs/specs/hand-ranges.md`'s "The Preset List"). Selecting one value
narrows the list to the presets carrying it, showing that value as a
removable pill in the row beneath the filter chips. Removing that pill
restores the full list, and the pill row itself disappears once nothing is
applied.

## SCN-021: Browsing grouped History entries, then swiping them away to the empty state

Starting from an empty History (this flow's own `launchApp: clearState: true`
— see its own flow file for why), adding a hand-range player the same way
SCN-014 does, then a second the same way SCN-017 does: reaching two players
starts an evaluation (`MIN_SUPPORTED_PLAYERS`), and issue #178's own save
path saves a History Entry the instant that evaluation settles, with no
explicit save action of the player's own. Adding a third player
(`MAX_SUPPORTED_PLAYERS`) re-triggers evaluation over all three and saves a
second, distinct History Entry once that settles. Switching to the History
tab shows both entries grouped under one `Today` date heading and one board
group — neither calculation ever touched the board, so both fall under the
same no-board group, which History renders the same way as any other
(`docs/specs/calculation-history.md`). Swiping the more recently calculated
row away — past the design's own commit offset, the same gesture SCN-014
already exercises on Analyze's own player rows, reused here via
`src/features/evaluations/ui/player-row/dismissal.ts`'s own exported
thresholds — leaves the other entry and the History tab itself visible, not
yet the empty state; swiping that remaining row away the same way reaches
the empty state, unchanged from what SCN-002 already shows for a History tab
that has never held anything. Not covered here, because Maestro cannot
assert on either: the haptic feedback the swipe and the delete both fire,
and the row's own accessibility-action deletion path (this scenario
exercises the gesture, not the alternative it exists alongside, the same
carve-out SCN-014 already takes for Analyze's own rows).

**Not yet confirmed end-to-end**, inheriting SCN-017's own standing
caveat: no session that lacks `modules/espada-engine`'s built native
binaries can produce or observe a real, settled equity result
(`docs/operations/native-module-artifacts.md`), and Maestro does not run in
this project's CI either. This flow also assumes the two-player evaluation
has already settled and saved its own History Entry by the time the third
player is added — this flow family still has no established
wait/assertion idiom for a pending async result, the same gap SCN-017's own
flow file records. Whoever next has both a device or simulator and the
built binaries should run this flow and confirm it actually passes, and in
particular whether the History Entry's own `id` really lands on `1` and
then `2` as this flow's own row-testID assertions assume — `clearState:
true` is new territory for this catalog (every existing flow that needs a
clean starting point instead relaunches without it, or passes `clearState:
false` to deliberately keep prior state — see SCN-005/SCN-006/SCN-010), and
no session that produced this flow could run Maestro to confirm it clears
`expo-sqlite`'s own on-disk database file the way it's assumed to here.

## SCN-022: Creating a new Preset end to end

From an empty Presets tab, pressing the "new preset" FAB opens the editor
in create mode (`docs/specs/hand-ranges.md`'s "The Preset Editor", issue
#177). Typing a name, selecting the `55+` shorthand chip (any non-empty
hand range satisfies the editor's own validation — this flow doesn't need
the rank-pair grid's own drag gesture to reach one), and toggling one
`Position` tag chip on, then pressing Save, persists the preset
(`createPreset`, `src/features/presets/adapter/preset-storage.ts`) and
returns to the Preset list, which now shows the new preset by name and no
longer renders its own empty state — issue #177's own fix to
`usePresetList` (`src/features/presets/adapter/use-preset-list.ts`) is
what makes the list reload without a remount here, the same reload
SCN-020 above now depends on to see its own two presets.

## SCN-023: Editing an existing Preset's fields and saving the change

Creates one preset the same way SCN-022 does, then reopens it by tapping
its row (`src/features/presets/ui/preset-row/preset-row.tsx`, which
carries no testID of its own — this flow targets it by its visible name
text, the way every preset row this catalog reaches has to). The editor
opens in edit mode, titled `Edit Preset`, with the `Name` field already
carrying the saved name — `usePresetEditorFields`'s own pre-fill from the
fetched preset (`src/features/presets/adapter/use-preset-editor-fields.ts`).
Replacing the name and toggling on a second `Position` tag value, then
saving, returns to the list showing the updated name in place of the old
one.

**`eraseText` is new territory for this catalog** — every existing flow
that types into a field types into one that starts empty (SCN-012's own
`inputText`, say); this is the first flow that has to clear a field's own
already-populated text first, which it does with a character count larger
than the field could ever hold rather than any more targeted selection
Maestro might offer.

## SCN-024: The Equity Breakdown sheet's strength-band legend renders all four items with well-formed counts

Reaches the Equity Breakdown sheet the same way SCN-017 does — adding a
hand-range player with the `55+` range, then a second hand-range player with
the `A2s+` range (the second player is required for the same reason SCN-017's
own flow file records: a settled equity result is a precondition of Player
1's own `detail` region wiring up at all), then tapping Player 1's own detail
region. Once the sheet is visible, this flow asserts that all four
strength-band legend items — Trash, Marginal, Value, and Nuts
(`legend-trash`, `legend-marginal`, `legend-value`, `legend-nuts`, each with
its own `label` and `count` child, added by #255) — are visible, and that
each one's own count text matches `^\d+ combos$`: a non-negative integer
followed by the fixed, untranslated `combos` unit string this project's
i18n resource uses (`handRanges:cardPairCount` — always plural, since no
singular form exists in either locale resource). It does not assert the
specific numeric value of any band, or that the four counts sum to a fixed
total: the live equity computation behind those numbers depends on the
native `espada-engine`, which cannot be produced or verified without a
device or emulator and the module's built binaries.

**Not yet confirmed end-to-end.** This flow was written without being
run, for the same reason SCN-017's own flow was: no session that lacks
`modules/espada-engine`'s built native binaries can produce or observe a
real, settled equity result (`docs/operations/native-module-artifacts.md`),
and Maestro does not run in this project's CI either. Whoever next has both
a device or simulator and the built binaries should run this flow and
confirm it actually passes, watching in particular for the same
pending-result race SCN-017's own flow file already records this flow
family has no established wait/assertion idiom for.

## SCN-025: The Equity Breakdown sheet's Blocker Score section renders entries with well-formed figures

Reaches the Equity Breakdown sheet the same way SCN-024 does — a first
hand-range player with the `55+` range (every rank pair in it a pocket
pair), a second hand-range player with the `A2s+` range (again the
precondition SCN-017's own flow file records: a settled result is what
wires up Player 1's own `detail` region at all), then tapping Player 1's
own detail region. No board cards are dealt, so this reaches the sheet
preflop — suits carry no board-driven asymmetry there, so every one of
Player 1's own pocket pairs is expected to collapse into a single
rank-pair-labelled row rather than splitting (docs/specs/
equity-breakdown.md's own "preflop... rank pairs collapse almost
entirely"), though this flow does not assert that collapse directly, for
the same reason it does not assert an exact figure below.

Once the sheet is visible, this flow asserts the Blocker Score section
itself (`blocker-score`) is visible, its own heading text reads `Blocker
Score`, its column head names the one opponent this two-player table has
(`Player 2`), its `Pocket pairs` group heading is visible (`55+` is
pocket-pairs-only, so this is the only group heading the section can
possibly draw), and that `row-AA-rankPair` — the pocket pair the grid's
own top-left cell and this range's own top end both name — is visible with
a `number` child matching `^[+-]\d+\.\d$`: an explicit sign, one integer
digit, one decimal digit, never a bare unsigned number. It does not assert
the figure's own exact value, for the same reason SCN-024's own legend
counts are not asserted exactly — the live figure depends on the native
`espada-engine`, which cannot be produced or verified without a device or
emulator and the module's built binaries.

**Not yet confirmed end-to-end**, for the identical reason SCN-024 above
gives — no session here has `modules/espada-engine`'s built native
binaries, and Maestro does not run in this project's CI. Whoever next has
both a device or simulator and the built binaries should run this flow,
confirm `row-AA-rankPair` actually renders (rather than, say, every pocket
pair splitting for a reason this plan did not anticipate), and watch for
the same pending-result race SCN-017's own flow file already records.
