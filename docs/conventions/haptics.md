# Haptics

This project's own rule for haptic feedback: that every touch interaction
gives it, the fixed event-to-platform mapping every caller shares, why the
Android side goes through `performAndroidHapticsAsync` rather than
`Vibrator`, and the three places neither platform's own guidance settles
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
| `primaryAction` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Confirm` | Pressing Analyze's `+ New Player` button ([`empty-state.tsx`](../../src/shared/ui/empty-state/empty-state.tsx)). |
| `secondaryAction` | `impactAsync(ImpactFeedbackStyle.Light)` | `Virtual_Key` | Pressing the nav bar's back affordance ([`nav-bar.tsx`](../../src/core/navigation/nav-bar.tsx)), or the native-job demo's Cancel button. |
| `selectionChange` | `selectionAsync()` | `Segment_Tick` | Switching tabs ([`tab-bar-item.tsx`](../../src/core/navigation/tab-bar-item.tsx)), or picking a Settings radio option ([`radio-row.tsx`](../../src/features/settings/ui/radio-row.tsx)) — including re-selecting the one already active, since the feedback confirms the touch registered rather than that anything changed. |
| `dragTick` | `selectionAsync()` | `Segment_Frequent_Tick` | Dragging across the rank-pair grid's 13×13 cells and crossing into a new rank pair, and dragging across the card/range input sheet's fanned card picker and crossing into a new card ([specs/hand-ranges.md](../specs/hand-ranges.md)). |
| `toggleOn` | `impactAsync(ImpactFeedbackStyle.Light)` | `Toggle_On` | Selecting a rank-pair grid cell, filling or overwriting a card/range input sheet preview slot, and pressing a hand-range shorthand chip that selects every one of its own rank pairs ([specs/hand-ranges.md](../specs/hand-ranges.md)) — this app still has no boolean switch control; Settings' Theme row is a radio, not a toggle. |
| `toggleOff` | `impactAsync(ImpactFeedbackStyle.Light)` | `Toggle_Off` | Deselecting a rank-pair grid cell, clearing a card/range input sheet preview slot by tapping its own focused, filled slot again, and pressing a hand-range shorthand chip that deselects every one of its own rank pairs ([specs/hand-ranges.md](../specs/hand-ranges.md)). |
| `dragStart` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Drag_Start` | Picking up a player or history row's swipe-to-delete gesture ([specs/equity-analysis.md](../specs/equity-analysis.md), [specs/calculation-history.md](../specs/calculation-history.md)). Anticipated: no row exists yet to swipe. |
| `dragEnd` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_End` | Releasing that same swipe once it settles into a dismissal state. Anticipated, for the same reason as `dragStart`. |
| `sheetOpen` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_Start` | Presenting the card/range input sheet ([specs/hand-ranges.md](../specs/hand-ranges.md)) or the not-yet-built Equity Breakdown sheet ([specs/equity-analysis.md](../specs/equity-analysis.md)) — `src/shared/ui/bottom-sheet/bottom-sheet.tsx` fires this on every hidden-to-visible transition, so any caller of that shared component gets it for free. |
| `sheetClose` | `impactAsync(ImpactFeedbackStyle.Light)` | `Gesture_End` | Dismissing that same sheet — `bottom-sheet.tsx` fires this once a drag, a flick, a backdrop tap, or a handle tap commits the close. |
| `success` | `notificationAsync(NotificationFeedbackType.Success)` | `Confirm` | A calculation reaching the Calculated state ([specs/equity-analysis.md](../specs/equity-analysis.md)). Anticipated: the equity engine does not exist yet. |
| `error` | `notificationAsync(NotificationFeedbackType.Error)` | `Reject` | A calculation started from Analyze failing to complete. Anticipated, for the same reason as `success`. |
| `longPress` | `impactAsync(ImpactFeedbackStyle.Medium)` | `Long_Press` | Long-pressing a row to reveal an action outside its normal tap target. Anticipated: no surface in this app defines a long-press interaction yet. |

Five rows — `dragStart`, `dragEnd`, `success`, `error`, `longPress` — are
still marked "Anticipated": each names the specific surface that has not
been built yet, rather than counting them again here where the count would
only go stale the next time one gains a caller.
`src/core/haptics/haptics.test.ts` still asserts all thirteen rows of the
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

## Three Places Neither Platform Answers

Neither Apple's Human Interface Guidelines nor Android's
`HapticFeedbackConstants` settle everything this project needs. The three
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
   the user just took (a delete, say) that succeeded exactly as asked. No
   caller needs this yet. This document defers the decision rather than
   inventing one; whichever event a future destructive action uses should be
   decided, and this table updated, at the point a caller actually needs it.
3. **`SCROLL_LIMIT` and `DRAG_CROSSING`.** Both exist in Android's own
   `HapticFeedbackConstants`, but `expo-haptics`'s `AndroidHaptics` does not
   expose either one. Recorded here so a future reader who goes looking for
   them in `AndroidHaptics` does not conclude they were simply missed from
   the table above.

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
