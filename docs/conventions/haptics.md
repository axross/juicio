# Haptics

This project's own rule for haptic feedback: that every touch interaction
gives it, the fixed event-to-platform mapping every caller shares, why the
Android side goes through `performAndroidHapticsAsync` rather than
`Vibrator`, and the four places neither platform's own guidance settles
what this app does. It does not cover `src/core/haptics/`'s own
implementation mechanics — its types, its data-table structure, its
fire-and-forget contract — beyond what a caller needs to know to use it
correctly; read [`haptics.ts`](../../src/core/haptics/haptics.ts) for that.

## Every Touch Gives Feedback, Through One Module

A change MUST give haptic feedback for every touch interaction this app
renders. A caller MUST reach that feedback through
[`src/core/haptics/`](../../src/core/haptics/), naming one of the
`HapticEvent` names below, and MUST NOT call `expo-haptics` directly. Naming
an event rather than a platform constant is what keeps the mapping in one
place: a caller that reached for `expo-haptics.impactAsync` itself would
have to know, at every call site, which `ImpactFeedbackStyle` and which
`AndroidHaptics` member this project intends for that interaction — this
module is the one place that decision is made.

## The Event Table

| Event | iOS | Android (`AndroidHaptics`) | Example interaction |
| --- | --- | --- | --- |
| `primaryAction` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Confirm` | Pressing Analyze's `+ New Player` control — a persistent floating action button (issue #155, [`new-player-fab.tsx`](../../src/features/evaluations/ui/new-player-fab/new-player-fab.tsx)), which superseded the empty state's own pill and the players list's own trailing row issue #87 first built — and tapping an existing row's own preview to edit it (the maintainer's own on-device pass over PR #93, [`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)) — one of Analyze's five board slots ([`board.tsx`](../../src/features/evaluations/ui/board/board.tsx)) — or tapping the rest of a hand-range row to open its own Equity Breakdown sheet (issue #102, `player-row.tsx`'s own `handleDetailPress`). Every one of these opens a bottom sheet, and [Apple's Consistency Rule](#apples-consistency-rule) below is why they share one event rather than each picking its own. |
| `secondaryAction` | `impactAsync(ImpactFeedbackStyle.Light)` | `Virtual_Key` | Pressing the nav bar's back affordance ([`nav-bar.tsx`](../../src/core/navigation/nav-bar.tsx)), or removing one applied filter from the Preset list screen's own filter pill row ([`preset-filter-pill-row.tsx`](../../src/features/presets/ui/preset-filter-pill-row/preset-filter-pill-row.tsx), issue #176). |
| `selectionChange` | `selectionAsync()` | `Segment_Tick` | Switching tabs ([`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx)), or picking a Settings radio option ([`radio-row.tsx`](../../src/features/settings/ui/radio-row.tsx)) — including re-selecting the one already active, since the feedback confirms the touch registered rather than that anything changed. |
| `dragTick` | `selectionAsync()` | `Segment_Frequent_Tick` | Dragging across the rank-pair grid's 13×13 cells and crossing into a new rank pair, and dragging across the card/range input sheet's fanned card picker and crossing into a new card ([specs/hand-ranges.md](../specs/hand-ranges.md)). |
| `toggleOn` | `impactAsync(ImpactFeedbackStyle.Light)` | `Toggle_On` | Selecting a rank-pair grid cell, and filling or overwriting a card/range input sheet preview slot — this app still has no boolean switch control; Settings' Theme row is a radio, not a toggle. |
| `toggleOff` | `impactAsync(ImpactFeedbackStyle.Light)` | `Toggle_Off` | Deselecting a rank-pair grid cell, and clearing a card/range input sheet preview slot by tapping its own focused, filled slot again. |
| `dragStart` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Drag_Start` | Picking up a player or history row's swipe-to-delete gesture ([specs/equity-analysis.md](../specs/equity-analysis.md), [specs/calculation-history.md](../specs/calculation-history.md)) — built and shipped for the Analyze players list (issue #87, [`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)); still anticipated for History, which has no row to swipe yet. **Also fires for that same row's own long-press-to-drag reorder gesture** (issue #153): a second, independent gesture on the same row reusing this event rather than `longPress` below — `player-row.tsx`'s own `Gesture.Exclusive` guarantees the two gestures never activate at once, so this is never two overlapping pickups. |
| `dragEnd` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_End` | Releasing that same swipe once it settles into one of `player-row.tsx`'s own three outcomes (rests closed, rests revealed, or commits to delete) — the same shipped/anticipated split as `dragStart` above; `player-row.tsx` also reuses this event for a tap on the revealed delete panel, which concludes that same swipe interaction without a fresh release to fire from. The row's own accessibility action fires no haptic at all — it deletes without a swipe ever having started, so there is no gesture for this event to conclude. **Also fires once the long-press-to-drag reorder gesture above releases** (issue #153), for the same reason `dragStart` above does. |
| `sheetOpen` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_Start` | Presenting the card/range input sheet ([specs/hand-ranges.md](../specs/hand-ranges.md)) or the not-yet-built Equity Breakdown sheet ([specs/equity-analysis.md](../specs/equity-analysis.md)) — `src/shared/ui/bottom-sheet/bottom-sheet.tsx` fires this at the entrance spring's first arrival at the open position (or immediately, under reduce motion, where there is no animation to arrive), never on the frame the entrance is scheduled — so any caller of that shared component gets it for free. It used to wait for the entrance animation to report it has settled instead; that read as out of sync with the sheet's own visual landing, since a spring's real settle time runs roughly 1.5× its nominal duration (`src/core/motion/tokens.ts`'s own doc comment on `motionSpringConfig`) — the maintainer felt the gap on-device (issue #101) — so this now fires on the spring's first crossing of the open position, which its deliberate slight overshoot guarantees happens, rather than waiting for the tail of that overshoot to decay. |
| `sheetClose` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_End` | Dismissing that same sheet — `bottom-sheet.tsx` fires this once a drag, a flick, a backdrop tap, or a handle tap commits the close. |
| `success` | `notificationAsync(NotificationFeedbackType.Success)` | `Confirm` | A calculation reaching the Calculated state ([specs/equity-analysis.md](../specs/equity-analysis.md)). Anticipated: the equity engine does not exist yet. |
| `error` | `notificationAsync(NotificationFeedbackType.Error)` | `Reject` | A calculation started from Analyze failing to complete. Anticipated, for the same reason as `success`. |
| `longPress` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Long_Press` | Long-pressing a row to reveal an action outside its normal tap target. Anticipated: no surface in this app fires this specific event yet — the Analyze players list's own long-press-to-drag reorder gesture (issue #153, [`player-row.tsx`](../../src/features/evaluations/ui/player-row/player-row.tsx)) is a real long-press interaction, but deliberately reuses `dragStart`/`dragEnd` above instead of this event: what it reveals is a drag to reposition the row, not a static action outside its normal tap target the way this event's own example anticipates. |
| `bulkToggle` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Confirm` | Pressing a hand-range shorthand chip, in either direction — selecting every one of its own rank pairs, or clearing every one of them ([specs/hand-ranges.md](../specs/hand-ranges.md)). Deliberately distinct from `toggleOn`/`toggleOff`: a chip press can change up to twelve rank pairs at once, and the single rank-pair grid cell above it fires exactly those two events for the same two-state-switch shape, so a chip needed its own event to read as a heavier action rather than resolving to identical platform feedback as a one-cell tap. Both directions share this one event; see [Four Places Neither Platform Answers](#four-places-neither-platform-answers) below for why. |

Three rows — `success`, `error`, `longPress` — are still marked
"Anticipated": each names the specific surface that has not been built yet,
rather than counting them again here where the count would only go stale
the next time one gains a caller. `dragStart` and `dragEnd` dropped off this
list once the Analyze players list shipped a real caller for both (issue
#87) — each row above still names the one surface (History) where the same
event stays anticipated.
`src/core/haptics/haptics.test.ts` still asserts all fourteen rows of the
mapping table, since the module's own correctness does not depend on which
events already have a caller.

## Why `performAndroidHapticsAsync`, Not `Vibrator`

The Android column MUST go through `expo-haptics`'s `performAndroidHapticsAsync`,
never Android's older `Vibrator` API. `performAndroidHapticsAsync` needs no
`VIBRATE` permission, and it automatically honours both the per-view
`android:hapticFeedbackEnabled` flag and the system
`Settings.System.HAPTIC_FEEDBACK_ENABLED` toggle — a caller reaching for
`Vibrator` directly would bypass both, buzzing a device whose owner has
turned haptics off at the OS level.

## Haptics Is Never the Only Signal

A change MUST NOT make haptic feedback the only signal for a state change —
every interaction this app gives feedback for MUST stay fully usable with
haptics off. Both platforms let a user turn haptics off entirely, and iOS
silently disables the Taptic Engine on its own, with no event this app can
observe: under Low Power Mode, when the user has turned haptics off in
Settings, and during camera or dictation use. A caller that treated a
`triggerHaptic` call as doing anything beyond a supplementary nudge would be
relying on feedback that routinely does not fire.

A board slot's press is where this rule is load-bearing rather than
incidental. Its visible pressed state is a fade on an already-faint dashed
outline (see [design-system.md](./design-system.md)'s Board Slot Pressed
State), deliberately subtle and largely covered by the fingertip making it
— so a reader could reasonably conclude the haptic is what actually
confirms that touch. It is not, and must not become so: the sheet opening
is the real feedback, and the fade and the haptic are both supplementary to
it. A change MUST NOT remove or delay that sheet on the reasoning that the
fade and the haptic already report the press.

## Android's Restraint Principle

Strength MUST scale inversely with frequency: a very frequent event — a drag
tick crossing cells on a grid — gets the softest feedback this project uses
(`Segment_Frequent_Tick`), and a rare, consequential event — a submit — gets
a stronger one. Android's own guidance classifies "buzzy" feedback — anything
that reads as a rapid, continuous rattle rather than a single confirming tap
— as something to avoid outright for routine touch feedback: choose no
haptics over buzzy haptics. `dragTick`'s mapping is this project's
application of that principle, not an arbitrary softer choice among several
equally valid ones.

## Apple's Consistency Rule

A change MUST use the system patterns according to their documented
meanings, and MUST stay consistent about which event maps to which
interaction across the whole app — never give the same gesture a different
sensation on two different screens. A user learns to associate a sensation
with an outcome; a mapping that drifts between screens breaks that
association rather than reinforcing it.

## Four Places Neither Platform Answers

Neither Apple's Human Interface Guidelines nor Android's
`HapticFeedbackConstants` settle everything this project needs. The four
places below are this project's own call, not a platform rule, and are
recorded here plainly as that rather than attributed to either platform's
guidance:

1. **Sheet open and dismiss.** Neither platform documents a semantic
   constant for presenting or dismissing a modal or bottom sheet. This
   project uses `Gesture_Start`/`Gesture_End` on Android and a light impact
   on iOS — the closest documented meaning on each platform, chosen rather
   than derived.
2. **A destructive action.** Apple's `warning` and `error` notification
   types are documented for a *recoverable* issue and a failure,
   respectively — neither is a clean fit for confirming a destructive action
   the user just took (a delete, say) that succeeded exactly as asked.
   Deleting a player (issue #87, `player-row.tsx`) is this project's first
   caller, and it does not introduce a new event for the moment of deletion
   itself: it reuses `dragEnd`, already owed for the swipe settling into its
   commit outcome (or, for a tap on the revealed panel, standing in for the
   release that mechanism has no equivalent of) — one event covering "this
   swipe interaction concluded," whichever of the two ways it concluded.
   **The row's accessibility action is deliberately outside that** and fires
   nothing: it reaches the same deletion without a swipe at all, so there is
   no interaction for `dragEnd` to conclude, and the assistive technology
   invoking it gives its own feedback. A future destructive action
   that isn't reached through a swipe at all (a plain confirm-and-delete
   button, say) still has no event of its own decided for it; this
   document continues to defer that decision rather than invent one ahead
   of a caller that needs it.
3. **`SCROLL_LIMIT` and `DRAG_CROSSING`.** Both exist in Android's own
   `HapticFeedbackConstants`, but `expo-haptics`'s `AndroidHaptics` does not
   expose either one. Recorded here so a future reader who goes looking for
   them in `AndroidHaptics` does not conclude they were simply missed from
   the table above.
4. **A bulk selection change.** Neither platform documents a constant for
   "the user changed a group of items at once" — the gap `bulkToggle`
   fills. This project maps it to `impactAsync(ImpactFeedbackStyle.Medium)`
   on iOS (a heavier collision than `toggleOn`/`toggleOff`'s `Light`,
   without reaching `Heavy`, which this project uses nowhere) and
   `AndroidHaptics.Confirm` on Android (documented for "the confirmation or
   successful completion of a user interaction," which a chip press is;
   every other unused `AndroidHaptics` member would be used against its own
   documented meaning, which [Apple's Consistency
   Rule](#apples-consistency-rule) above forbids). `bulkToggle` deliberately
   shares `primaryAction`'s exact platform pair — the table already has
   events sharing a platform constant (`Confirm` for `primaryAction` and
   `success`, `Gesture_End` for `dragEnd` and `sheetClose`), and the two
   never appear on the same surface. Both a chip's select and its clear
   fire this same one event, rather than a `bulkToggleOn`/`bulkToggleOff`
   pair: chosen over keeping the two directions distinguishable, and open
   to revisiting at a device check.

## One Unverified Fact

`expo-haptics`'s own documentation states that `AndroidHaptics` member
availability "varies across Android API levels," but publishes no per-member
minimum-API table, and that claim was not independently confirmed against
Android's own source or device testing. `src/core/haptics/haptics.ts`
therefore treats every call as best-effort — the fire-and-forget contract
this module already needs for a missing vibrator motor covers a missing
platform constant the same way. A contributor bringing up a new Android API
level SHOULD spot-test the events this project actually calls on a real
device at that level, rather than trusting this document to name a floor it
does not have the evidence to name.

## The First Rejection Each Session Reaches Sentry

Every call still stays fire-and-forget and MUST NOT throw into its caller —
that contract is unchanged. What is no longer true everywhere is that a
rejection is *purely* silent: `triggerHaptic` reports the first rejection
each app session to Sentry (`reportError`, tagged with which `HapticEvent`
fired and which platform branch ran — Android's `performAndroidHapticsAsync`
path, or the iOS-column path everywhere else), and every rejection after
that first one stays exactly as silent as before this was added.

Once per session, not once per rejection, because this app gives haptic
feedback on every touch: a device where the platform call rejects on every
call would otherwise send one Sentry event per tap, flooding the project's
quota with duplicates of what is, on the two most likely devices, not a
defect at all — no vibration hardware, or haptics switched off at the OS
level. A single capture still catches what neither of those two can
explain: [One Unverified Fact](#one-unverified-fact) above, a specific
`AndroidHaptics` member unsupported at a specific API level, which would
otherwise stay invisible behind the blanket swallow forever.

## No In-App Haptics Toggle

This app has no Settings control for turning haptics off. Both platforms
already gate haptics at the OS level — the same toggles [Haptics Is Never
the Only Signal](#haptics-is-never-the-only-signal) above names — and
`performAndroidHapticsAsync` already honours Android's automatically per
[Why `performAndroidHapticsAsync`, Not `Vibrator`](#why-performandroidhapticsasync-not-vibrator)
above, so a second, app-level toggle would duplicate a control the user
already has rather than add one they lack.

## `expo-haptics` Is a Native Module

Adopting `expo-haptics` means a contributor running an older development
build MUST rerun `npm run android` or `npm run ios` before this project's
haptic calls will do anything on-device — see
[README.md](../../README.md) for those commands. **No CI job in this project
compiles the native project** (see [testing.md](./testing.md) and
[README.md](../../README.md)'s own Testing table), so nothing in CI catches
a native-side mistake in this adoption — a missing native module, a stale
autolinking entry — before a device does. Nothing in this project's
automated checks verifies that haptic feedback actually fires: that needs a
physical device and a fresh development build, and confirming it stays a
contributor's own manual step.
