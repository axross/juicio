import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { beginPaint, continuePaint } from './painting';
import type { PaintMode } from './painting';

/**
 * which of `painting.ts`'s two functions produced one cell's own most
 * recent flip — `'begin'` (the gesture's first cell, `.onBegin` below) or
 * `'continue'` (a further cell a drag crossed into, `.onUpdate` below).
 * `renderCell`'s own doc comment says what a caller does with this.
 */
export type PaintChangeCause = 'begin' | 'continue';

/**
 * everything a paint gesture's callbacks need that can change between the
 * gesture's start and end — columns, gap, the cell list, the caller's
 * current selection, and its callback. read through a ref rather than
 * closed over directly, because the gesture object is built once (see
 * `pan` below) and must not be rebuilt mid-drag: a `Gesture.Pan()`
 * recreated while a finger is still down would tear down and reattach the
 * native handler, which the caller's own re-renders (`onSelectionChange`
 * firing on every cell the drag crosses) would otherwise trigger
 * continuously through this very drag.
 *
 * `gridWidth` carries only the container's measured **width**, never its
 * height. the container's height is determined by its own children (the
 * grid renders `rows` explicit row `View`s stacked in a column, keeping
 * the column count structural — see
 * [decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md](../../../../docs/decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md)
 * for why), so a measured height feeding back into sizing would be circular: sizing
 * the cells taller grows the container, which reports a taller measured
 * height, which grows the cells again. every height below is instead
 * *derived* from the measured width via `cellAspectRatio`, matching the
 * `aspectRatio` every rendered cell carries in `SelectionGrid`'s body.
 */
type GestureContext<Key extends string> = {
  columns: number;
  rows: number;
  gap: number;
  gridWidth: number | null;
  cellAspectRatio: number;
  cellKeys: readonly Key[];
  selectedKeys: ReadonlySet<Key>;
  onSelectionChange: (next: ReadonlySet<Key>) => void;
};

/**
 * the width a cell in a flex row with `gap` actually renders at — flex
 * distributes the space *remaining after the gaps*, so a cell's own
 * `flexGrow`/`flexBasis: 0` (see `SelectionGrid`'s render body) resolves to
 * exactly this, with no measurement and no rounding of this file's own —
 * unfloored, deliberately: see
 * [decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md](../../../../docs/decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md)
 * for why. `resolveCellIndex` below is the only reader left: rendering
 * computes no value of its own to compare against (flex does), so there is
 * only one formula to keep in sync with what flex lays out, not two that
 * could drift.
 */
function computeCellWidth(gridWidth: number, gap: number, columns: number): number {
  return (gridWidth - gap * (columns - 1)) / columns;
}

/**
 * resolves a touch position, in the grid container's local coordinates,
 * to the index of the cell it falls in — by arithmetic against the
 * container's measured **width**, never by giving each cell its own
 * gesture responder. at 13×13 (this project's rank-pair grid, the first
 * caller) that would be 169 competing responders; nothing this
 * component's `Gesture.Pan()` does depends on which cell's own touch area
 * triggered it, only on where the finger is within the grid as a whole.
 *
 * cell height, and the grid's overall height, are both derived from the
 * measured width via `cellAspectRatio` — never from a measured height
 * (see `GestureContext`'s doc comment for why) — so this agrees with
 * what flex actually draws by construction, not coincidence: the cell
 * width comes from `computeCellWidth` above, the one formula for it left
 * in this file (see that function's own doc comment).
 *
 * a position landing inside the gap between two cells still resolves to
 * one of them — the arithmetic below folds each gap into the cell that
 * precedes it — rather than to no cell; a domain-free primitive has no
 * reason to carve out a dead zone between cells the way a design with a
 * deliberately wide gap might.
 */
function resolveCellIndex<Key extends string>(
  x: number,
  y: number,
  context: GestureContext<Key>,
): number | null {
  const { columns, rows, gap, gridWidth, cellAspectRatio, cellKeys } = context;

  if (gridWidth === null) {
    return null;
  }

  const cellWidth = computeCellWidth(gridWidth, gap, columns);
  const cellHeight = cellWidth / cellAspectRatio;
  const gridHeight = rows * cellHeight + gap * (rows - 1);

  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) {
    return null;
  }

  const column = Math.floor(x / (cellWidth + gap));
  const row = Math.floor(y / (cellHeight + gap));

  if (column < 0 || column >= columns || row < 0 || row >= rows) {
    return null;
  }

  const index = row * columns + column;
  return index < cellKeys.length ? index : null;
}

/**
 * a generic grid whose cells toggle on tap and paint on drag — it knows
 * nothing about rank pairs or any other domain concept, only a
 * caller-supplied list of string keys and how to render one.
 * `painting.ts` owns the paint gesture's whole rule set (what
 * a touch decides, what a further crossing does, when a crossing is
 * silent); this component owns turning a `Gesture.Pan()` into calls
 * against that module.
 *
 * the whole grid is one gesture surface, resolved by `resolveCellIndex`
 * against a single `onLayout` measurement — never a responder per cell
 * (see that function's doc comment). the gesture's callbacks run on the
 * **JS thread** (`.runOnJS(true)` below), not as Reanimated worklets:
 * nothing here needs to follow the finger visually frame-by-frame the way
 * a drag that animates a shared value would
 * (`../bottom-sheet/bottom-sheet.tsx` is that case) — this component only
 * flips discrete cell state, cheap enough to decide on the JS thread even
 * at 13×13, and doing so lets the selection stay a plain `Set<Key>`
 * rather than needing it to survive a worklet's serialization boundary.
 *
 * **its root child element is the `View` inside `GestureDetector`, not
 * `GestureDetector` itself.** `GestureDetector` renders no native view of
 * its own — it requires exactly one child and passes everything through
 * — so it isn't a "root child element" docs/conventions/
 * component-contracts.md's props-inheritance rule could mean anything
 * against; `ComponentProps<typeof View>` below, and the rest spread onto
 * that same `View`, both target the element a caller actually sees, not
 * the gesture wrapper around it.
 *
 * **carries a tap-versus-paint distinction for a caller that wants to
 * animate one and not the other** — a single tap fades, a painted run does
 * not, since easing every cell a drag crosses would leave a visible trail
 * lagging the finger. `lastChange` below
 * tracks which one cell most recently flipped and whether `beginPaint` or
 * `continuePaint` (`./painting.ts`) did it, and `renderCell`'s third
 * argument carries that to the one cell it applies to — every other cell
 * receives `null`, both before and after, so a memoized `renderCell`
 * result only re-renders the one cell actually implicated in a given
 * pointer move, not all of them (`../hand-range-pane/hand-range-pane.tsx`'s
 * `GridCell` is wrapped in `React.memo` for exactly this).
 */
export function SelectionGrid<Key extends string>({
  columns,
  cellKeys,
  selectedKeys,
  onSelectionChange,
  renderCell,
  gap = 0,
  cellAspectRatio = 1,
  getCellAccessibilityLabel,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  columns: number;
  /** row-major, length === columns * rows — the grid this component draws
   * has no partial last row. */
  cellKeys: readonly Key[];
  selectedKeys: ReadonlySet<Key>;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md; fires once per cell the drag
   * (or tap) actually changes, carrying the whole updated set rather than
   * a diff. */
  onSelectionChange: (next: ReadonlySet<Key>) => void;
  /**
   * `changeCause` is `null` on every render but one: the render right
   * after a cell's own `selected` flipped, on the one cell that flipped —
   * `'begin'` for the gesture's first cell (`beginPaint` below, whether
   * this gesture turns out to stay a tap or grows into a drag),
   * `'continue'` for every cell after it that a drag crosses
   * (`continuePaint`). a caller whose cell fades on a tap and snaps on a
   * paint crossing (`../hand-range-pane/hand-range-pane.tsx`'s `GridCell`)
   * reads this to tell the two apart — see this component's own doc
   * comment for why only the gesture's first cell can be told apart from a
   * continued paint at all.
   */
  renderCell: (key: Key, selected: boolean, changeCause: PaintChangeCause | null) => ReactNode;
  gap?: number;
  /** a cell's width ÷ height. defaults to `1` (square) — this primitive
   * knows nothing about any caller's domain, so it cannot assume a square
   * cell on its own; a caller whose cells are not square (none exist yet)
   * would pass its own ratio here rather than this component guessing at
   * one. see `resolveCellIndex` and the render body's `aspectRatio` below
   * for the two other places this ratio has to agree with. */
  cellAspectRatio?: number;
  /** the accessible label for one cell, read by a screen reader alongside
   * its selected state. this component knows nothing about what a key
   * means, so it defaults to the key itself — a caller with a friendlier
   * per-cell name (a rank pair's own spoken form, say) can pass one, kept
   * for the same reason `renderCell` exists for visuals: a domain-free
   * grid can't know what its own keys mean. */
  getCellAccessibilityLabel?: (key: Key) => string;
  testID?: string;
}) {
  const rows = cellKeys.length / columns;

  // width only — see `GestureContext`'s doc comment for why the
  // container's measured height must never feed back into sizing. skipping
  // the update when the width hasn't changed matters because height is
  // never read from this state: without the guard, a layout pass reporting
  // the same width every time (which a correctly-sized grid does, once
  // settled) would still re-render on every one of them.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setGridWidth((current) => (current === width ? current : width));
  }, []);

  // which cell most recently flipped, and why — `renderCell`'s own doc
  // comment. set from the same JS-thread gesture callbacks that already
  // call `onSelectionChange` below, in the same synchronous tick, so both
  // state updates land in one React commit rather than triggering two.
  const [lastChange, setLastChange] = useState<{ key: Key; cause: PaintChangeCause } | null>(null);

  const contextRef = useRef<GestureContext<Key>>({
    columns,
    rows,
    gap,
    gridWidth,
    cellAspectRatio,
    cellKeys,
    selectedKeys,
    onSelectionChange,
  });
  // synced in a layout effect, not written directly in the render body:
  // writing a ref during render is exactly what `react-hooks/refs` exists
  // to catch, and a layout effect is the correct fix here rather than a
  // suppression — it still runs synchronously after this render commits
  // and strictly before any gesture callback could fire (a touch event
  // never arrives mid-render), so `contextRef.current` is exactly as
  // fresh as if it had been written in the render body directly.
  useLayoutEffect(() => {
    contextRef.current = {
      columns,
      rows,
      gap,
      gridWidth,
      cellAspectRatio,
      cellKeys,
      selectedKeys,
      onSelectionChange,
    };
  });

  // the ongoing drag's own state: which paint mode it decided on touch
  // down, the working selection it has painted so far (seeded from
  // `selectedKeys` once, at the drag's start, rather than re-read from the
  // ref on every crossing — the caller's `onSelectionChange` fires
  // mid-drag, and waiting for that update to round-trip through props
  // before trusting it would race the caller's own render), and the last
  // cell index touched, so re-entering the same cell without crossing out
  // first doesn't re-run `continuePaint` for nothing.
  const paintModeRef = useRef<PaintMode | null>(null);
  const workingSelectionRef = useRef<ReadonlySet<Key>>(selectedKeys);
  const lastCellIndexRef = useRef<number | null>(null);

  // built once (`useMemo` with an empty dependency list, see the comment
  // at its end) rather than on every render: everything the callbacks
  // below need beyond their own event comes from `contextRef`,
  // `paintModeRef`, `workingSelectionRef`, and `lastCellIndexRef` — all
  // read as `.current`, never captured by value — so this gesture never
  // needs rebuilding for a prop or state change to be seen. see
  // `GestureContext`'s doc comment for why rebuilding it mid-drag would be
  // wrong, not merely wasteful.
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      // no minimum travel before the gesture starts tracking movement — a
      // 13×13 grid's cells are small enough (~29pt on the rank-pair grid
      // this component was built for) that the default activation
      // distance would swallow the first cell boundary a drag crosses.
      .minDistance(0)
      // `react-hooks/refs` flags every callback below for closing over a
      // ref, since it can't statically prove a callback *built* during
      // render only ever *runs* later, once a touch arrives — but that's
      // exactly the gesture-callback contract react-native-gesture-handler
      // and Reanimated both rely on, and reading `contextRef.current`
      // fresh at call time (never captured by value) is this file's whole
      // reason for a ref — see `GestureContext`'s doc comment. no rewrite
      // keeps this gesture built once (required, see the comment above)
      // and also satisfies a rule assuming every ref read might happen
      // synchronously during render.
      // eslint-disable-next-line react-hooks/refs
      .onBegin((event) => {
        const index = resolveCellIndex(event.x, event.y, contextRef.current);

        if (index === null) {
          paintModeRef.current = null;
          lastCellIndexRef.current = null;
          return;
        }

        const key = contextRef.current.cellKeys[index];
        const { mode, selected } = beginPaint(contextRef.current.selectedKeys, key);

        paintModeRef.current = mode;
        workingSelectionRef.current = selected;
        lastCellIndexRef.current = index;

        triggerHaptic(mode === 'select' ? HapticEvent.ToggleOn : HapticEvent.ToggleOff);
        setLastChange({ key, cause: 'begin' });
        contextRef.current.onSelectionChange(selected);
      })
      // eslint-disable-next-line react-hooks/refs -- see .onBegin's own comment above.
      .onUpdate((event) => {
        const mode = paintModeRef.current;
        if (mode === null) {
          return;
        }

        const index = resolveCellIndex(event.x, event.y, contextRef.current);
        if (index === null || index === lastCellIndexRef.current) {
          return;
        }
        lastCellIndexRef.current = index;

        const key = contextRef.current.cellKeys[index];
        const { selected, changed } = continuePaint(workingSelectionRef.current, key, mode);

        if (changed) {
          workingSelectionRef.current = selected;
          triggerHaptic(HapticEvent.DragTick);
          setLastChange({ key, cause: 'continue' });
          contextRef.current.onSelectionChange(selected);
        }
      })
      // eslint-disable-next-line react-hooks/refs -- see .onBegin's own comment above.
      .onFinalize(() => {
        paintModeRef.current = null;
        lastCellIndexRef.current = null;
      });

    // exposes this gesture to `getByGestureTestId`/`fireGestureHandler`
    // from `react-native-gesture-handler/jest-utils`. real on-device
    // gesture recognition is unreachable from RNTL regardless (see
    // `selection-grid.test.tsx`'s note) — but that testing module
    // simulates a discrete BEGAN→END event stream at a known x/y directly
    // against a gesture found by this id, which is how that file proves a
    // tap actually paints a cell without a real gesture recognizer.
    if (testID) {
      gesture.withTestId(testID);
    }

    return gesture;
  }, [testID]);

  return (
    <GestureDetector gesture={pan}>
      {/* the rest spread goes before this component's own explicit props
       * here, the opposite order from this project's other components:
       * `onLayout={handleLayout}` is load-bearing wiring this component's
       * gesture-to-touch resolution depends on (see `handleLayout` above),
       * not a default a caller may reasonably replace, so it — and
       * `testID` — must win over anything `props` carries. `style` is
       * still pulled out and merged last, after this component's layout
       * styles, so a caller extending it doesn't wipe the grid/gap layout
       * the cells below depend on. */}
      <View
        {...props}
        style={[styles.grid, { gap }, style]}
        onLayout={handleLayout}
        testID={testID}
      >
        {Array.from({ length: rows }, (_, rowIndex) => (
          <View
            key={rowIndex}
            style={[styles.row, { gap }]}
            testID={testID ? `row-${rowIndex}` : undefined}
          >
            {cellKeys.slice(rowIndex * columns, rowIndex * columns + columns).map((key) => {
              const selected = selectedKeys.has(key);
              const changeCause =
                lastChange !== null && lastChange.key === key ? lastChange.cause : null;
              return (
                <View
                  key={key}
                  // `flex: 1` (`styles.cell`) in a row with `gap` distributes
                  // the space remaining after the gaps evenly — exactly
                  // `computeCellWidth`'s formula above, with no measurement
                  // and no wrong-size first frame to correct, since flex's
                  // own arithmetic already accounts for `gap`. `aspectRatio`
                  // derives height from that width — never from the row's
                  // own height, which a row `View`'s default `alignItems:
                  // 'stretch'` would otherwise hand a flex-basis-0 cell,
                  // growing the row on every pass — see
                  // `selection-grid.test.tsx`'s own regression test for
                  // this.
                  style={[styles.cell, { aspectRatio: cellAspectRatio }]}
                  accessible
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    getCellAccessibilityLabel ? getCellAccessibilityLabel(key) : key
                  }
                  testID={testID ? `cell-${key}` : undefined}
                >
                  {renderCell(key, selected, changeCause)}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </GestureDetector>
  );
}

// a plain React Native stylesheet, not a Unistyles one: nothing this
// component draws is themed — it renders whatever `renderCell` returns —
// so there's no theme dependency for Unistyles to track, and
// docs/decisions/2026-08-29-ban-dynamic-function-styles.md forbids a
// dynamic-function form for the measured values below. every
// caller-supplied or measured value below is applied at the call site with
// array syntax instead, as that record prescribes.
const styles = StyleSheet.create({
  // a column of `rows` explicit row `View`s (below), stacked with the same
  // `gap` a row uses between its own cells, keeping the column count
  // structural: nothing here ever decides to wrap a row, so no rounding
  // direction can produce one — see
  // [decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md](../../../../docs/decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md)
  // for why.
  //
  // `gap` is the caller's own prop, applied at the call site rather than
  // held here, per the decision record above.
  grid: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
  },
  // `flexGrow: 1, flexBasis: 0` — every cell in a row claims an equal share
  // of the width left over after the row's own `gap`s, which is exactly
  // `computeCellWidth`'s formula. `aspectRatio` (applied at the call site,
  // caller-supplied) derives height from that width.
  cell: {
    flex: 1,
  },
});
