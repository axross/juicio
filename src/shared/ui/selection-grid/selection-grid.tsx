import type { ReactNode } from 'react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';

import { beginPaint, continuePaint } from './selection-grid-paint';
import type { PaintMode } from './selection-grid-paint';

export type SelectionGridProps<Key extends string> = {
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
  /** the accessible label for one cell, read by a screen reader alongside
   * its selected state. this component knows nothing about what a key
   * means, so it defaults to the key itself — a caller with a friendlier
   * per-cell name (a rank pair's own spoken form, say) can pass one; this
   * is the one addition beyond the brief's own prop shape, kept for
   * exactly the reason `renderCell` already exists for visuals: a
   * domain-free grid cannot know what its own keys mean. */
  getCellAccessibilityLabel?: (key: Key) => string;
  testID?: string;
};

type GridSize = { width: number; height: number };

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
 */
type GestureContext<Key extends string> = {
  columns: number;
  rows: number;
  gap: number;
  gridSize: GridSize | null;
  cellKeys: readonly Key[];
  selectedKeys: ReadonlySet<Key>;
  onSelectionChange: (next: ReadonlySet<Key>) => void;
};

/**
 * resolves a touch position, in the grid container's own local
 * coordinates, to the index of the cell it falls in — by arithmetic
 * against the container's measured size, never by giving each cell its
 * own gesture responder. at 13×13 (this project's hand-range grid, the
 * first caller) that would be 169 competing responders, which is exactly
 * the case a pan across a grid goes wrong: nothing this component's
 * `Gesture.Pan()` does depends on which cell's *own* touch area triggered
 * it, only on where the finger is within the grid as a whole.
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
  const { columns, rows, gap, gridSize, cellKeys } = context;

  if (!gridSize || x < 0 || y < 0 || x >= gridSize.width || y >= gridSize.height) {
    return null;
  }

  const cellWidth = (gridSize.width - gap * (columns - 1)) / columns;
  const cellHeight = (gridSize.height - gap * (rows - 1)) / rows;
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
 */
export function SelectionGrid<Key extends string>({
  columns,
  cellKeys,
  selectedKeys,
  onSelectionChange,
  renderCell,
  gap = 0,
  getCellAccessibilityLabel,
  testID,
}: SelectionGridProps<Key>) {
  const rows = cellKeys.length / columns;

  const [gridSize, setGridSize] = useState<GridSize | null>(null);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setGridSize({ width, height });
  }, []);

  const contextRef = useRef<GestureContext<Key>>({
    columns,
    rows,
    gap,
    gridSize,
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
      gridSize,
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
      // 13×13 grid's cells are small enough (~29pt on the hand-range grid
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

        triggerHaptic(mode === 'select' ? 'toggleOn' : 'toggleOff');
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
          triggerHaptic('dragTick');
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

  const cellSize =
    gridSize !== null
      ? {
          width: (gridSize.width - gap * (columns - 1)) / columns,
          height: (gridSize.height - gap * (rows - 1)) / rows,
        }
      : null;

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.grid(gap)} onLayout={handleLayout} testID={testID}>
        {cellKeys.map((key) => {
          const selected = selectedKeys.has(key);
          return (
            <View
              key={key}
              style={
                cellSize
                  ? styles.cellMeasured(cellSize.width, cellSize.height)
                  : styles.cellUnmeasured(columns)
              }
              accessible
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={getCellAccessibilityLabel ? getCellAccessibilityLabel(key) : key}
              testID={testID ? `${testID}-cell-${key}` : undefined}
            >
              {renderCell(key, selected)}
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create(() => ({
  grid: (gap: number) => ({
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap,
  }),
  // the caller's own measured, gap-exact cell size — see
  // `SelectionGrid`'s own body for why this and `cellUnmeasured` below
  // must agree with `resolveCellIndex`'s arithmetic.
  cellMeasured: (width: number, height: number) => ({
    width,
    height,
  }),
  // the one frame before `onLayout` first reports a size: an intrinsic
  // percentage approximation that ignores `gap` (there is no `calc()` in
  // a React Native style), corrected the instant a real measurement
  // arrives. per react-component-styling's fluid-and-responsive
  // guidance, this renders *something* sized rather than nothing while
  // waiting on the measurement.
  cellUnmeasured: (columns: number) => ({
    flexBasis: `${100 / columns}%`,
  }),
}));
