/**
 * `player-row.tsx`'s own long-press-to-drag rule set, kept free of React,
 * gesture-handler, and Reanimated entirely — mirroring `./dismissal.ts`'s
 * own role for the swipe-to-delete gesture: the whole decision for one
 * small interaction, pulled out so it's testable with no gesture and no
 * render.
 *
 * unlike `dismissal.ts`'s own two measured offsets, nothing here is a
 * design-file measurement: no design-file frame draws a drag affordance
 * for this row at all — see
 * docs/decisions/2026-09-05-elevate-and-shadow-a-dragged-player-row.md for
 * why this project's own "Option A — elevate and shadow" is what it built,
 * the same status this project's own
 * `docs/conventions/design-system.md` already records for its Bottom
 * Sheet Scrim and Board Slot Pressed State entries.
 *
 * every function below takes `rowHeight` as a plain argument rather than
 * importing `../player-row-content/player-row-content`'s own `ROW_HEIGHT`
 * constant directly — that module's own import chain reaches
 * react-native-reanimated (through `../../../../shared/ui/hole-cards-preview/
 * hole-cards-preview.tsx` and `../../../../shared/ui/bottom-sheet/
 * bottom-sheet.tsx`), which has no native binary to load against the moment
 * anything imports it outside a component test's own RNTL/jest-expo
 * environment — exactly the environment this file's own tests
 * (`./reorder.test.ts`) deliberately avoid needing, per this doc comment's
 * opening claim of staying "free of React, gesture-handler, and Reanimated
 * entirely." `./player-row.tsx` already imports that constant for its own,
 * separate reasons (`rowHeight`'s starting value), and passes the same
 * value through to every call here.
 */

/**
 * Option A's own scale for the dragged row while held — reads as
 * physically lifted off the stack, the closest of the three options the
 * exhibit offered to a native iOS/Android drag-and-drop affordance. An
 * implementer's own choice, not a design measurement, the same status
 * `player-row.tsx`'s own `SWIPE_ACTIVATION_DISTANCE` and `MIN_DRAG_OFFSET`
 * already carry.
 */
export const DRAG_LIFT_SCALE = 1.02;

/**
 * how long a touch must hold still before it picks a row up. this
 * project's first long-press affordance, so there is no existing
 * precedent to match — the functional requirement is "the platform
 * default," which is exactly what `react-native-gesture-handler`'s own
 * `LongPressGestureHandler` already uses (`minDurationMs`, default 500)
 * when nothing overrides it. Read explicitly here, rather than left
 * unset, only because `Gesture.Pan()`'s own `activateAfterLongPress`
 * config requires an argument and carries no default of its own to fall
 * back to — this is that same platform default, reproduced, not a
 * different value chosen for this row.
 */
export const LONG_PRESS_MIN_DURATION_MS = 500;

/**
 * clamps a drag's own running vertical offset so a row already at the
 * list's top or bottom edge can't be dragged further past it — the
 * functional requirement that dragging the first row above the list, or
 * the last row below it, clamps at the list's own bounds rather than
 * travelling further with nowhere left to reorder into. `fromIndex` rows'
 * worth of room remain above this row, `rowCount - 1 - fromIndex` below
 * it — every row shares the same fixed `rowHeight`, so that room is
 * exact, not approximate.
 *
 * marked `'worklet'` for the same reason `player-row.tsx`'s own
 * `clampDragOffset` is: both callers of this function are `Gesture.Pan()`
 * worklets that never call `.runOnJS(true)`.
 */
export function clampReorderTranslateY(
  fromIndex: number,
  rowCount: number,
  rowHeight: number,
  translationY: number,
): number {
  'worklet';
  // `+ 0` at the end folds a `-0` result (from `-fromIndex * rowHeight`
  // when `fromIndex` is 0, i.e. `Math.max(-0, translationY)` with a
  // negative `translationY`) back to `+0` — `-0 + 0 === 0` in JS. The two
  // are numerically and visually identical as a `translateY`, but the
  // distinction is exactly what a first-row-can't-travel-upward assertion
  // would otherwise have to know to work around.
  return (
    Math.min(
      (rowCount - 1 - fromIndex) * rowHeight,
      Math.max(-fromIndex * rowHeight, translationY),
    ) + 0
  );
}

/**
 * the row index an already-clamped vertical offset currently resolves to.
 * `Math.round` is what turns a continuous offset into a discrete index
 * only once the drag has carried at least half a row's height past it —
 * so a drag released anywhere short of another row's own midpoint
 * resolves right back to `fromIndex` itself, the no-op the functional
 * requirements name explicitly ("a drag that never crosses another row's
 * midpoint... is a no-op").
 *
 * expects `translationY` already clamped by `clampReorderTranslateY`
 * above — every caller in this project calls that first, which is what
 * keeps the result in `[0, rowCount - 1]` without this function needing
 * `rowCount` of its own to clamp against a second time.
 *
 * `'worklet'` for the same reason `clampReorderTranslateY` above is.
 */
export function reorderIndexAt(fromIndex: number, rowHeight: number, translationY: number): number {
  'worklet';
  const rows = translationY / rowHeight;
  // `Math.round` alone breaks a negative `.5` tie toward zero (rounds
  // `-0.5` to `-0`, not `-1`), which would cross upward at exactly half a
  // row but not downward — rounding the magnitude and restoring the sign
  // instead keeps the two directions symmetric.
  const roundedRows = rows < 0 ? -Math.round(-rows) : Math.round(rows);
  return fromIndex + roundedRows;
}

/**
 * the row's own compensated visual offset while a live reorder is
 * committing rows around it mid-drag: the residual distance from the
 * clamped translation to the nearest whole row height. `reorderIndexAt`
 * above is what `player-row.tsx`'s own drag gesture calls, live, to move
 * this player in the store the instant the drag crosses another row's own
 * midpoint (the functional requirement that the other rows animate into
 * the vacated slot while the drag is still held, not only once it
 * releases) — but this row's own container also reflows onto its own new
 * slot the instant that happens, since the store's own new order is what
 * every row's position in `../player-list/player-list.tsx`'s stack
 * derives from. This offset is what keeps the dragged row visually pinned
 * to the finger's own continuous position regardless: it always sits in
 * `[-rowHeight / 2, rowHeight / 2]`, the fractional remainder past
 * whichever whole-row boundary `reorderIndexAt` most recently crossed,
 * exactly cancelling that same row's own instant reflow so the two never
 * compound into a visible double-move. `player-row.tsx`'s own doc comment
 * explains the other half of this: why the dragged row's own container
 * skips this project's usual `LinearTransition` for that same reflow,
 * which only the *other*, non-dragged rows animate into.
 *
 * `'worklet'` for the same reason the two functions above are.
 */
export function reorderVisualOffset(
  fromIndex: number,
  rowHeight: number,
  translationY: number,
): number {
  'worklet';
  return (
    translationY - (reorderIndexAt(fromIndex, rowHeight, translationY) - fromIndex) * rowHeight
  );
}
