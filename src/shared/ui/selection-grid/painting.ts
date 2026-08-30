/**
 * the paint gesture's whole rule set for a generic selection grid, kept
 * free of React, gesture-handler, and layout entirely: `selection-grid.tsx`
 * calls straight into this module from its `Gesture.Pan()` callbacks, so
 * the rules themselves are testable with no gesture, no render, and no
 * measured layout involved.
 *
 * a paint drag has one mode, decided once, from the cell it starts on:
 * touching a selected cell paints *deselect*, touching an unselected one
 * paints *select*. every further cell the drag crosses takes that mode's
 * state — never a per-cell toggle, which would flicker a cell on and off
 * as a finger wobbles back and forth across a boundary.
 */

export type PaintMode = 'select' | 'deselect';

export type BeginPaintResult<Key extends string> = {
  readonly mode: PaintMode;
  readonly selected: ReadonlySet<Key>;
};

export type ContinuePaintResult<Key extends string> = {
  readonly selected: ReadonlySet<Key>;
  /**
   * whether this crossing actually changed `key`'s state. `false` for a
   * cell already sitting in the paint's target state — the caller reads
   * this to decide whether a `dragTick` haptic is owed for the crossing,
   * per docs/conventions/haptics.md: a crossing that changes nothing fires
   * no haptic either.
   */
  readonly changed: boolean;
};

/**
 * the touch that starts a paint drag. `key`'s own current membership in
 * `selected` decides the whole drag's mode — there is no independent
 * "paint on" or "paint off" gesture, only "paint whichever `key` was not
 * already" — and this function both decides that mode and applies it to
 * the touched cell in one step, so a caller never has to apply `mode` to
 * the first cell separately from every cell after it.
 */
export function beginPaint<Key extends string>(
  selected: ReadonlySet<Key>,
  key: Key,
): BeginPaintResult<Key> {
  const mode: PaintMode = selected.has(key) ? 'deselect' : 'select';
  const next = new Set(selected);

  if (mode === 'select') {
    next.add(key);
  } else {
    next.delete(key);
  }

  return { mode, selected: next };
}

/**
 * one further cell a paint drag has moved into. sets `key` to `mode`'s
 * target state and reports whether that cell's membership actually
 * changed — a cell already at the target state (the drag re-entering a
 * cell it already painted this same drag, or wobbling across a cell
 * boundary) is reported unchanged rather than toggled a second time, which
 * is what keeps a wobbling finger from flickering a cell on and off. when
 * nothing changed, `selected` is returned by the same reference it was
 * given, so a caller can skip a re-render by comparing identity rather
 * than reading `changed` — either is a correct way to detect a no-op.
 */
export function continuePaint<Key extends string>(
  selected: ReadonlySet<Key>,
  key: Key,
  mode: PaintMode,
): ContinuePaintResult<Key> {
  const alreadyAtTarget = mode === 'select' ? selected.has(key) : !selected.has(key);

  if (alreadyAtTarget) {
    return { selected, changed: false };
  }

  const next = new Set(selected);

  if (mode === 'select') {
    next.add(key);
  } else {
    next.delete(key);
  }

  return { selected: next, changed: true };
}
