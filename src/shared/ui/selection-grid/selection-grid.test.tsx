// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` throws (`RNGestureHandlerModule.install is not
// a function`) the moment it tries to reach the native module Jest has no
// binary for.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';

import { SelectionGrid } from './selection-grid';

// `Gesture.Pan()`'s callbacks are worklets by default once Reanimated is
// installed, and importing `react-native-gesture-handler` reaches into
// `react-native-worklets`' native module the moment
// `GestureHandlerRootView` initialises — even though this component never
// imports Reanimated itself (its gesture runs on the JS thread, per
// `selection-grid.tsx`'s doc comment on `.runOnJS(true)`). `require()`
// inside the factory, as the library's Jest guide shows, not a same-file
// `import`: `react-native-worklets/src/mock.ts` type-checks as its own
// project's source, not as a consumer's dependency, and fails this
// project's `tsc --noEmit` the moment anything here imports it directly
// instead of requiring it opaquely.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

// 2 columns × 2 rows, so a 100×100 measured grid gives each cell an exact
// 50×50 quadrant — 'a' top-left, 'b' top-right, 'c' bottom-left, 'd'
// bottom-right — with no fractional pixel to round a boundary case onto.
const CELL_KEYS = ['a', 'b', 'c', 'd'] as const;

function renderCell(key: string) {
  return <Text>{key}</Text>;
}

/**
 * renders the grid inside a `GestureHandlerRootView` (required for
 * `react-native-gesture-handler`'s native module mock to initialise — see
 * the `jestSetup` import above), then measures it at a round 100×100 by
 * hand: no layout engine runs under Jest, so `onLayout` never fires on its
 * own, and `resolveCellIndex` can resolve nothing until it does (see that
 * function's doc comment in `selection-grid.tsx`).
 */
async function renderGrid({
  selectedKeys = new Set<string>(),
  onSelectionChange = jest.fn(),
}: {
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: jest.Mock;
} = {}) {
  await render(
    <GestureHandlerRootView>
      <SelectionGrid
        columns={2}
        cellKeys={CELL_KEYS}
        selectedKeys={selectedKeys}
        onSelectionChange={onSelectionChange}
        renderCell={renderCell}
        testID="grid"
      />
    </GestureHandlerRootView>,
  );

  await fireEvent(screen.getByTestId('grid'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 100, height: 100 } },
  });

  return onSelectionChange;
}

/**
 * a tap: touch down and lift with no meaningful movement, at `(x, y)`.
 * wrapped in `act()` — unlike `fireEvent`, `fireGestureHandler` isn't
 * itself `act()`-aware (`../cards-pane/cards-pane.test.tsx`'s own matching
 * comment), and `SelectionGrid` holds real state of its own (`lastChange`)
 * that a bare call would update outside any `act()` boundary.
 */
async function fireTap(x: number, y: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('grid'), [
      { state: State.BEGAN, x, y },
      { state: State.END, x, y },
    ]);
  });
}

describe('<SelectionGrid />', () => {
  it("renders every cell through the caller's renderCell", async () => {
    await renderGrid();

    for (const key of CELL_KEYS) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it("drives each cell's accessibilityState.selected from selectedKeys", async () => {
    await renderGrid({ selectedKeys: new Set(['b']) });

    expect(screen.getByTestId('cell-a').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByTestId('cell-b').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('selects an unselected cell on a tap, reporting toggleOn', async () => {
    const onSelectionChange = await renderGrid();

    await fireTap(10, 10); // inside cell 'a', x:[0,50) y:[0,50)

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a']));
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
  });

  it('deselects an already-selected cell on a tap, reporting toggleOff', async () => {
    const onSelectionChange = await renderGrid({ selectedKeys: new Set(['a']) });

    await fireTap(10, 10);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOff);
  });

  it('paints every further cell a drag crosses into the same mode, reporting dragTick', async () => {
    const onSelectionChange = await renderGrid();

    // wrapped in `act()` — see `fireTap`'s own doc comment above.
    await act(async () => {
      fireGestureHandler(getByGestureTestId('grid'), [
        { state: State.BEGAN, x: 10, y: 10 }, // cell 'a'
        { state: State.ACTIVE, x: 10, y: 10 },
        { state: State.ACTIVE, x: 60, y: 10 }, // crosses into cell 'b'
        { state: State.END, x: 60, y: 10 },
      ]);
    });

    expect(onSelectionChange).toHaveBeenNthCalledWith(1, new Set(['a']));
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, new Set(['a', 'b']));
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.ToggleOn);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragTick);
  });

  // `flex: 1` (`styles.cell`) sizes a cell from the row's own layout, not
  // from a measurement this component makes — so the very first frame is
  // already the same style a later `onLayout` firing would produce. this is
  // the one part of this file a real layout engine actually resolves for
  // us (RNTL fires no layout of its own, so nothing here proves the
  // resulting *pixels* — see this file's closing comment — but the style
  // driving that layout is identical before and after `onLayout`).
  it('renders a cell at its final style before any onLayout measurement arrives, not a wrong-size fallback that a later measurement corrects', async () => {
    await render(
      <GestureHandlerRootView>
        <SelectionGrid
          columns={2}
          cellKeys={CELL_KEYS}
          selectedKeys={new Set<string>()}
          onSelectionChange={jest.fn()}
          renderCell={renderCell}
          testID="grid"
        />
      </GestureHandlerRootView>,
    );

    const beforeLayout = screen.getByTestId('cell-a').props.style;

    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 5000 } },
    });
    const afterLayout = screen.getByTestId('cell-a').props.style;

    expect(beforeLayout).toEqual(afterLayout);
    expect(beforeLayout).toEqual([{ flex: 1 }, { aspectRatio: 1 }]);
  });

  // a container whose height is determined by its own children
  // (`flexWrap: 'wrap'`) can't honestly report a height of its own — see
  // `selection-grid.tsx`'s `GestureContext` doc comment — so a measured
  // height must never feed back into cell sizing. cell height comes from
  // `aspectRatio` applied to flex's own computed width, structurally never
  // from a measured height at all — this pins that a bogus measured height
  // (RNTL fires no real layout engine, so nothing here proves real
  // on-device geometry — see this file's closing comment) still leaves the
  // cell's style untouched, rather than merely producing the right numeric
  // answer despite reading it.
  it('never lets a measured height reach cell style, however implausible the measured height is', async () => {
    await renderGrid();
    const restingStyle = screen.getByTestId('cell-a').props.style;

    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 5000 } },
    });
    const firstStyle = screen.getByTestId('cell-a').props.style;

    // same width, a different wrong height — pins that measured height
    // isn't an input to style at all, not merely that one bad value is
    // tolerated.
    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 1 } },
    });
    const secondStyle = screen.getByTestId('cell-a').props.style;

    expect(firstStyle).toEqual(restingStyle);
    expect(secondStyle).toEqual(restingStyle);
  });
});

// pins the fix
// [decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md](../../../../docs/decisions/2026-09-05-render-the-selection-grids-rows-as-structural-containers.md)
// covers: RNTL runs no layout engine (see this file's closing comment), so
// nothing here can prove a real container's measured width in pixels; what
// it proves is that the grid's column count is structural — rendered as
// `rows` explicit row containers, each with exactly `columns` cells —
// rather than left to `flexWrap` to decide from a rounded width.
describe('13-column row grouping', () => {
  const WIDE_COLUMNS = 13;
  const WIDE_ROWS = 3;
  const WIDE_CELL_KEYS = Array.from(
    { length: WIDE_COLUMNS * WIDE_ROWS },
    (_, index) => `k${index}`,
  );

  it('renders every row with exactly `columns` cells, never wrapping a column into the next row', async () => {
    await render(
      <GestureHandlerRootView>
        <SelectionGrid
          columns={WIDE_COLUMNS}
          cellKeys={WIDE_CELL_KEYS}
          selectedKeys={new Set<string>()}
          onSelectionChange={jest.fn()}
          renderCell={renderCell}
          testID="wide-grid"
        />
      </GestureHandlerRootView>,
    );

    for (let rowIndex = 0; rowIndex < WIDE_ROWS; rowIndex += 1) {
      const row = screen.getByTestId(`row-${rowIndex}`);
      expect(within(row).getAllByRole('button')).toHaveLength(WIDE_COLUMNS);
    }
  });
});

// hit-test coverage: the rendered cell pitch and `resolveCellIndex`'s own
// hit-test arithmetic have to agree. `selection-grid.tsx`'s
// `computeCellWidth` is the only formula for a cell's width anywhere in
// this file — rendering computes none of its own (flex does, natively, at
// paint time — see `SelectionGrid`'s render body) — so there is nothing
// left for it to drift from. that also means this test has no rendered
// pitch to read off a cell's own style: RNTL runs no layout engine (see
// this file's closing comment), so a flex-sized cell's style carries no
// `width` to read at all. the pitch below is `computeCellWidth`'s
// formula, replicated by hand rather than imported — deliberately, since
// `resolveCellIndex` is the only remaining reader of that formula and this
// test exists to check it resolves touches the way a real flex layout
// would, not to assert the formula equals itself. `346` and `1.833` are
// this project's real rank-pair-grid dimensions
// (`../hand-range-pane/hand-range-pane.tsx`'s `GRID_CELL_SIZE`/`GRID_GAP`), not
// round test numbers, so this exercises the actual non-integer pitch the
// real grid renders.
describe('hit test agrees with the rendered pitch at 13 columns', () => {
  const REAL_COLUMNS = 13;
  const REAL_ROWS = 3;
  const REAL_GRID_WIDTH = 346;
  const REAL_GAP = 1.833;
  const REAL_CELL_KEYS = Array.from(
    { length: REAL_COLUMNS * REAL_ROWS },
    (_, index) => `r${index}`,
  );

  it("resolves a touch at the centre of the first, a middle, and the last cell of the grid's last row to that exact cell", async () => {
    const onSelectionChange = jest.fn();
    await render(
      <GestureHandlerRootView>
        <SelectionGrid
          columns={REAL_COLUMNS}
          cellKeys={REAL_CELL_KEYS}
          selectedKeys={new Set<string>()}
          onSelectionChange={onSelectionChange}
          renderCell={renderCell}
          gap={REAL_GAP}
          testID="real-grid"
        />
      </GestureHandlerRootView>,
    );

    await fireEvent(screen.getByTestId('real-grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: REAL_GRID_WIDTH, height: 1000 } },
    });

    // `computeCellWidth`'s own formula, replicated here — see this
    // describe block's own comment for why there's no rendered style to
    // read it off instead.
    const cellWidth = (REAL_GRID_WIDTH - REAL_GAP * (REAL_COLUMNS - 1)) / REAL_COLUMNS;
    const pitch = cellWidth + REAL_GAP;

    function centreOf(row: number, column: number) {
      return { x: column * pitch + cellWidth / 2, y: row * pitch + cellWidth / 2 };
    }

    const cases = [
      { row: 0, column: 0 },
      { row: 1, column: 6 },
      { row: REAL_ROWS - 1, column: REAL_COLUMNS - 1 },
    ] as const;

    for (const { row, column } of cases) {
      onSelectionChange.mockClear();
      const { x, y } = centreOf(row, column);
      const expectedKey = REAL_CELL_KEYS[row * REAL_COLUMNS + column];

      // wrapped in `act()` — see `fireTap`'s own doc comment above.
      await act(async () => {
        fireGestureHandler(getByGestureTestId('real-grid'), [
          { state: State.BEGAN, x, y },
          { state: State.END, x, y },
        ]);
      });

      expect(onSelectionChange).toHaveBeenCalledWith(new Set([expectedKey]));
    }
  });

  // `resolveCellIndex`'s own doc comment in `selection-grid.tsx`: a touch
  // inside the gap between two cells resolves to the cell *before* the
  // gap, not the one after.
  it('resolves a touch inside the gap between two cells to the preceding cell, not the following one', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <GestureHandlerRootView>
        <SelectionGrid
          columns={REAL_COLUMNS}
          cellKeys={REAL_CELL_KEYS}
          selectedKeys={new Set<string>()}
          onSelectionChange={onSelectionChange}
          renderCell={renderCell}
          gap={REAL_GAP}
          testID="real-grid"
        />
      </GestureHandlerRootView>,
    );

    await fireEvent(screen.getByTestId('real-grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: REAL_GRID_WIDTH, height: 1000 } },
    });

    const cellWidth = (REAL_GRID_WIDTH - REAL_GAP * (REAL_COLUMNS - 1)) / REAL_COLUMNS;
    const pitch = cellWidth + REAL_GAP;

    // midpoint of the horizontal gap between column 5 and column 6, on row 1.
    const row = 1;
    const column = 5;
    const gapMidX = column * pitch + cellWidth + REAL_GAP / 2;
    const rowCentreY = row * pitch + cellWidth / 2;
    const expectedHorizontalKey = REAL_CELL_KEYS[row * REAL_COLUMNS + column];

    await act(async () => {
      fireGestureHandler(getByGestureTestId('real-grid'), [
        { state: State.BEGAN, x: gapMidX, y: rowCentreY },
        { state: State.END, x: gapMidX, y: rowCentreY },
      ]);
    });

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([expectedHorizontalKey]));

    // midpoint of the vertical gap between row 0 and row 1, on column 3.
    onSelectionChange.mockClear();
    const verticalColumn = 3;
    const columnCentreX = verticalColumn * pitch + cellWidth / 2;
    const gapMidY = cellWidth + REAL_GAP / 2;
    const expectedVerticalKey = REAL_CELL_KEYS[verticalColumn];

    await act(async () => {
      fireGestureHandler(getByGestureTestId('real-grid'), [
        { state: State.BEGAN, x: columnCentreX, y: gapMidY },
        { state: State.END, x: columnCentreX, y: gapMidY },
      ]);
    });

    expect(onSelectionChange).toHaveBeenCalledWith(new Set([expectedVerticalKey]));
  });
});

// what this file doesn't, and can't, reach: `fireGestureHandler` injects
// handler *state transitions* directly (BEGAN/ACTIVE/END, with whatever
// x/y the test supplies) — it doesn't run this project's actual
// arithmetic twice to prove `resolveCellIndex` agrees with what a real
// finger crossing a real 13×13 grid at real device pixel coordinates
// would resolve to. that arithmetic is what `painting.ts` is deliberately
// kept free of (it only ever receives a `Key`, never an x/y) —
// `resolveCellIndex` is tested here only indirectly, through the
// coordinates each case above chose by hand. it also can't prove real
// on-device gesture *recognition* — how many pixels of travel Android or
// iOS actually reports before this component's `Gesture.Pan()`
// activates, or whether `minDistance(0)` reads as intended against a real
// touchscreen's own debouncing — which stays a manual device check.
