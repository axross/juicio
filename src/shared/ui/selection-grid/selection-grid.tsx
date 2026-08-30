import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { PixelRatio, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { beginPaint, continuePaint } from './selection-grid-paint';
import type { PaintMode } from './selection-grid-paint';

/**
 * everything a paint gesture's callbacks need that can change between the
 * gesture's own start and its end — columns, gap, the cell list, the
 * caller's current selection, and the caller's callback. read through a
 * ref rather than closed over directly, because the gesture object itself
 * is built once (see `pan` below) and must not be rebuilt mid-drag: a
 * `Gesture.Pan()` recreated while a finger is still down would tear down
 * and reattach the native handler, which the caller's own re-renders
 * (`onSelectionChange` firing on every cell the drag crosses) would
 * otherwise trigger continuously through this very drag.
 *
 * `gridWidth` carries only the container's measured **width** — never its
 * height. The container's height is determined by its own children (the
 * grid renders `rows` explicit row `View`s stacked in a column — see
 * `SelectionGrid`'s own render body and its doc comment on why an earlier
 * `flexWrap: 'wrap'` version of this component could not hold the column
 * count structural), so treating a measured height as an input to sizing is
 * circular: sizing the cells taller grows the container, which reports a
 * taller measured height, which grows the cells again. Every height below —
 * a cell's own and the grid's as a whole — is instead *derived* from the
 * measured width via `cellAspectRatio`, matching `cellSize`'s own
 * computation in `SelectionGrid`'s body and `cellMeasured` below; see that
 * prop's own doc comment.
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
 * floors a computed cell width to the device's own pixel grid — deliberately
 * `Math.floor`, never `Math.round`. React Native's own `PixelRatio` exposes
 * only `roundToNearestPixel` (`Math.round(value * PixelRatio.get()) /
 * PixelRatio.get()`, confirmed against this project's installed
 * `react-native@0.86.3` — no floor variant exists), and rounding to
 * *nearest* can still round up: that is exactly how 13 cells' summed width
 * came to exceed the grid's own measured container width on a real device
 * and reflow to 12 per row (see this file's own `SelectionGrid` doc comment
 * for that bug). Flooring is the only rounding direction that can never
 * overflow the container this value was measured against.
 */
function floorToPixelGrid(value: number): number {
  const pixelRatio = PixelRatio.get();
  return Math.floor(value * pixelRatio) / pixelRatio;
}

/**
 * the one place a cell's own width is computed from the grid's measured
 * width — read by both `SelectionGrid`'s own render body (`cellSize` below)
 * and `resolveCellIndex`, so a touch's hit test can never resolve against a
 * pitch other than the one actually drawn. floored to the device pixel grid
 * via `floorToPixelGrid` above, for the same reason `SelectionGrid`'s own
 * cells are: two formulas computing "the same" fractional width from
 * floating-point division are not guaranteed to agree bit-for-bit, and at
 * 13 columns even a sub-pixel disagreement compounds across the row (see
 * this file's own report for the real-device numbers this was measured
 * against).
 */
function computeCellWidth(gridWidth: number, gap: number, columns: number): number {
  const raw = (gridWidth - gap * (columns - 1)) / columns;
  return floorToPixelGrid(raw);
}

/**
 * resolves a touch position, in the grid container's own local
 * coordinates, to the index of the cell it falls in — by arithmetic
 * against the container's measured **width**, never by giving each cell
 * its own gesture responder. at 13×13 (this project's rank-pair grid, the
 * first caller) that would be 169 competing responders, which is exactly
 * the case a pan across a grid goes wrong: nothing this component's
 * `Gesture.Pan()` does depends on which cell's *own* touch area triggered
 * it, only on where the finger is within the grid as a whole.
 *
 * cell height, and the grid's own overall height, are both derived from
 * the measured width via `cellAspectRatio` — never from a measured height
 * (see `GestureContext`'s own doc comment for why) — so this agrees with
 * `cellMeasured` below by construction rather than by coincidence. the cell
 * width itself comes from `computeCellWidth` above, the same call
 * `SelectionGrid`'s own render body makes, rather than a second inline
 * formula that could drift from it.
 *
 * a position landing inside the gap between two cells still resolves to
 * one of them — the arithmetic below folds each gap into the cell that
 * follows it — rather than to no cell; a domain-free primitive has no
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
 * nothing about rank pairs or any other domain concept, only a caller-
 * supplied list of string keys and how to render one. `selection-grid-
 * paint.ts` owns the paint gesture's whole rule set (what a touch decides,
 * what a further crossing does, when a crossing is silent); this component
 * owns turning a `Gesture.Pan()` into calls against that module.
 *
 * the whole grid is one gesture surface, resolved by
 * `resolveCellIndex` against a single `onLayout` measurement — never a
 * responder per cell (see that function's own doc comment). the gesture's
 * callbacks run on the **JS thread**
 * (`.runOnJS(true)` below), not as Reanimated worklets: nothing here needs
 * to follow the finger visually frame-by-frame the way a drag that
 * animates a shared value would (`../bottom-sheet/bottom-sheet.tsx` is
 * that case, and does use worklets) — this component only ever flips
 * discrete cell state, cheap enough to decide on the JS thread even at
 * 13×13, and doing so lets the selection stay a plain `Set<Key>` rather
 * than needing it to survive a worklet's serialization boundary.
 *
 * **its root child element is the `View` inside `GestureDetector`, not
 * `GestureDetector` itself.** `GestureDetector` renders no native view of
 * its own — it requires exactly one child and passes everything through —
 * so it is not a "root child element"
 * docs/conventions/component-contracts.md's props-inheritance rule could
 * mean anything against; `ComponentProps<typeof View>` below, and the rest
 * spread onto that same `View`, both target the element a caller actually
 * sees, not the gesture wrapper around it.
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
  renderCell: (key: Key, selected: boolean) => ReactNode;
  gap?: number;
  /** a cell's width ÷ height. defaults to `1` (square) — this primitive
   * knows nothing about any caller's domain, so it cannot assume a square
   * cell on its own; a caller whose cells are not square (none exist yet)
   * would pass its own ratio here rather than this component guessing at
   * one. see `resolveCellIndex` and `cellUnmeasured` below for the two
   * other places this ratio has to agree with. */
  cellAspectRatio?: number;
  /** the accessible label for one cell, read by a screen reader alongside
   * its selected state. this component knows nothing about what a key
   * means, so it defaults to the key itself — a caller with a friendlier
   * per-cell name (a rank pair's own spoken form, say) can pass one; this
   * is the one addition beyond the brief's own prop shape, kept for
   * exactly the reason `renderCell` already exists for visuals: a
   * domain-free grid cannot know what its own keys mean. */
  getCellAccessibilityLabel?: (key: Key) => string;
  testID?: string;
}) {
  const rows = cellKeys.length / columns;

  // width only — see `GestureContext`'s own doc comment for why the
  // container's measured height must never feed back into sizing. skipping
  // the update when the width has not changed matters now specifically
  // because height is no longer read from this state at all: without the
  // guard, a layout pass that reports the same width every time (which a
  // correctly-sized grid does, once settled) would still re-render on every
  // one of them.
  const [gridWidth, setGridWidth] = useState<number | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    setGridWidth((current) => (current === width ? current : width));
  }, []);

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
  // and strictly before any gesture callback could possibly fire (a touch
  // event never arrives mid-render), so `contextRef.current` is exactly as
  // fresh as it would have been written in the render body directly.
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
  // `selectedKeys` once, at the drag's own start, rather than re-read from
  // the ref on every crossing — the caller's `onSelectionChange` fires
  // mid-drag, and waiting for that update to round-trip back through
  // props before trusting it would be racing the caller's own render),
  // and the last cell index touched, so re-entering the same cell without
  // crossing out of it first does not re-run `continuePaint` for nothing.
  const paintModeRef = useRef<PaintMode | null>(null);
  const workingSelectionRef = useRef<ReadonlySet<Key>>(selectedKeys);
  const lastCellIndexRef = useRef<number | null>(null);

  // built once (`useMemo` with an empty own-values dependency list, see the
  // comment at its end) rather than on every render: everything the
  // callbacks below need beyond their own event comes from `contextRef`,
  // `paintModeRef`, `workingSelectionRef`, and `lastCellIndexRef` — all read
  // as `.current`, never captured by value — so this gesture never needs
  // rebuilding for a prop or state change to be seen. see `GestureContext`'s
  // own doc comment for why rebuilding it mid-drag would be wrong, not
  // merely wasteful.
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      // no minimum travel before the gesture starts tracking movement — a
      // 13×13 grid's cells are small enough (~29pt on the rank-pair grid
      // this component was built for) that the default activation
      // distance would swallow the first cell boundary a drag crosses.
      .minDistance(0)
      // `react-hooks/refs` flags every callback below for closing over a
      // ref, since it cannot statically prove a callback *built* during
      // render only ever *runs* later, once an actual touch arrives — but
      // that is exactly the gesture-callback contract react-native-
      // gesture-handler and Reanimated both rely on, and reading
      // `contextRef.current` fresh at call time (never captured by value)
      // is this file's whole reason for a ref in the first place — see
      // `GestureContext`'s own doc comment. there is no rewrite that keeps
      // this gesture built once (required — see the comment above) and
      // also satisfies a rule assuming every ref read might happen
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
    // gesture recognition is unreachable from RNTL regardless of this —
    // see `selection-grid.test.tsx`'s own note — but that testing module
    // simulates a discrete BEGAN→END event stream at a known x/y directly
    // against a gesture found by this id, which is how that file proves a
    // tap actually paints a cell without a real gesture recognizer.
    if (testID) {
      gesture.withTestId(testID);
    }

    return gesture;
  }, [testID]);

  // height derived from the measured width via `cellAspectRatio`, never
  // from a measured height — see `GestureContext`'s own doc comment. the
  // width itself comes from `computeCellWidth`, the same call
  // `resolveCellIndex` makes, so a rendered cell's own boundary and the
  // gesture's hit test against it can never drift apart — see that
  // function's own doc comment for the real-device bug this guards.
  const measuredCellWidth = gridWidth !== null ? computeCellWidth(gridWidth, gap, columns) : null;
  const cellSize =
    measuredCellWidth !== null
      ? { width: measuredCellWidth, height: measuredCellWidth / cellAspectRatio }
      : null;

  return (
    <GestureDetector gesture={pan}>
      {/* the rest spread goes *before* this component's own explicit props
       * here, the opposite order from this project's other components:
       * `onLayout={handleLayout}` is load-bearing wiring this component's
       * own gesture-to-touch resolution depends on (see `handleLayout`'s
       * own definition above), not a default a caller may reasonably
       * replace, so it — and `testID` — must win over anything `props`
       * carries rather than be silently overridden by it. `style` is still
       * pulled out and merged last, after this component's own layout
       * styles, so a caller extending it does not wipe out the grid/gap
       * layout the cells below depend on. */}
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
              return (
                <View
                  key={key}
                  // measured: the gap-exact cell size, computed by the same
                  // `computeCellWidth` `resolveCellIndex` calls, so the drawn
                  // pitch and the hit test cannot drift apart.
                  //
                  // unmeasured (the one frame before `onLayout` first reports
                  // a width): an intrinsic percentage that ignores `gap`
                  // (there is no `calc()` in a React Native style), corrected
                  // the instant a real measurement arrives. `aspectRatio` is
                  // what keeps that frame from stretching to fill its row's
                  // height — a row `View` leaves `alignItems: 'stretch'` at
                  // its default, so a cell with no height of its own would
                  // stretch to whatever height the row is given, `onLayout`
                  // would report *that* height back, and sizing the next
                  // frame's cells from it would grow the row further on every
                  // pass. That runaway is the bug this prop exists to
                  // prevent, and it was found on a real device.
                  style={
                    cellSize
                      ? { width: cellSize.width, height: cellSize.height }
                      : { flexBasis: `${100 / columns}%`, aspectRatio: cellAspectRatio }
                  }
                  accessible
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    getCellAccessibilityLabel ? getCellAccessibilityLabel(key) : key
                  }
                  testID={testID ? `cell-${key}` : undefined}
                >
                  {renderCell(key, selected)}
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
// so there is no theme dependency here for Unistyles to track, and
// docs/decisions/2026-08-29-ban-dynamic-function-styles.md forbids the
// dynamic-function form the measured values used to take. Every
// caller-supplied or measured value below is applied at the call site
// with array syntax instead, exactly as that record prescribes.
const styles = StyleSheet.create({
  // a column of `rows` explicit row `View`s (below), stacked with the same
  // `gap` a row uses between its own cells — replacing an earlier
  // `flexDirection: 'row'` + `flexWrap: 'wrap'` single-container version,
  // which let the column count reflow: `flexWrap` decides where a row
  // breaks from the measured widths it is given, and React Native rounds
  // that width to the device pixel grid independently per child — when the
  // rounding went up, 13 cells' summed width exceeded the container's own
  // measured width by a fraction and the thirteenth cell wrapped to a
  // fourteenth row (found on a real device: row 1 read `AA` through `A3s`,
  // twelve cells, with `A2s` starting row 2). Rendering `rows` explicit row
  // containers makes the column count structural instead — nothing here
  // ever decides to wrap a row, so no rounding direction can produce one.
  //
  // `gap` is the caller's own prop, applied at the call site rather than
  // held here, per the decision record above.
  grid: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
  },
});
