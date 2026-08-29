// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` throws (`RNGestureHandlerModule.install is not
// a function`) the moment it tries to reach the native module Jest has no
// binary for.
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { triggerHaptic } from '@/core/haptics/haptics';

import { SelectionGrid } from './selection-grid';

// `Gesture.Pan()`'s callbacks are worklets by default once Reanimated is
// installed, and importing `react-native-gesture-handler` at all reaches
// into `react-native-worklets`' native module the moment
// `GestureHandlerRootView` initialises — even though this component never
// imports Reanimated itself (its own gesture runs on the JS thread, per
// `selection-grid.tsx`'s own doc comment on `.runOnJS(true)`). `require()`
// inside the factory, exactly as the library's own Jest testing guide
// shows, rather than a same-file `import`: `react-native-worklets/src/
// mock.ts` type-checks as its own project's source, not as a consumer's
// dependency, and fails this project's `tsc --noEmit` the moment anything
// here imports it directly instead of requiring it opaquely — see this
// run's own report. the eslint warning this trades for is addressed below
// rather than fought.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('@/core/haptics/haptics');

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
 * `react-native-gesture-handler`'s own native module mock to initialise —
 * see the `jestSetup` import above), then measures it at a round 100×100
 * by hand: no layout engine runs under Jest, so `onLayout` never fires on
 * its own, and `resolveCellIndex` can resolve nothing until it does (see
 * that function's own doc comment in `selection-grid.tsx`).
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

/** a tap: touch down and lift with no meaningful movement, at `(x, y)`. */
function fireTap(x: number, y: number) {
  fireGestureHandler(getByGestureTestId('grid'), [
    { state: State.BEGAN, x, y },
    { state: State.END, x, y },
  ]);
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

    expect(screen.getByTestId('grid-cell-a').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByTestId('grid-cell-b').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('selects an unselected cell on a tap, reporting toggleOn', async () => {
    const onSelectionChange = await renderGrid();

    fireTap(10, 10); // inside cell 'a', x:[0,50) y:[0,50)

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(['a']));
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOn');
  });

  it('deselects an already-selected cell on a tap, reporting toggleOff', async () => {
    const onSelectionChange = await renderGrid({ selectedKeys: new Set(['a']) });

    fireTap(10, 10);

    expect(onSelectionChange).toHaveBeenCalledTimes(1);
    expect(onSelectionChange).toHaveBeenCalledWith(new Set());
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOff');
  });

  it('paints every further cell a drag crosses into the same mode, reporting dragTick', async () => {
    const onSelectionChange = await renderGrid();

    fireGestureHandler(getByGestureTestId('grid'), [
      { state: State.BEGAN, x: 10, y: 10 }, // cell 'a'
      { state: State.ACTIVE, x: 10, y: 10 },
      { state: State.ACTIVE, x: 60, y: 10 }, // crosses into cell 'b'
      { state: State.END, x: 60, y: 10 },
    ]);

    expect(onSelectionChange).toHaveBeenNthCalledWith(1, new Set(['a']));
    expect(onSelectionChange).toHaveBeenNthCalledWith(2, new Set(['a', 'b']));
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOn');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('dragTick');
  });

  // regression coverage for the runaway-height bug found on a real device
  // (the rank-pair grid filling the screen with 13 enormously tall
  // columns): a container whose height is determined by its own children
  // (`flexWrap: 'wrap'`) cannot honestly report a height of its own — see
  // `selection-grid.tsx`'s `GestureContext` doc comment — so a
  // measured height must never feed back into cell sizing. RNTL runs no
  // layout engine, so these fire a synthetic `onLayout` with a width and a
  // *deliberately inconsistent* height and assert the arithmetic alone;
  // they cannot, and do not claim to, prove real on-device geometry — see
  // this file's own closing comment.
  it('derives cell height from the measured width, never the deliberately inconsistent measured height', async () => {
    await renderGrid();

    // 2 columns, gap 0: cellWidth = 399 / 2 = 199.5. `cellAspectRatio`
    // defaults to 1 (square), so height must equal that same 199.5 — the
    // pre-fix code instead divided the bogus 5000 height by the 2 rows,
    // producing a 2500-tall cell, which is exactly this bug.
    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 5000 } },
    });

    expect(screen.getByTestId('grid-cell-a').props.style).toEqual({
      width: 199.5,
      height: 199.5,
    });
  });

  it('produces an identical cell size for the same width regardless of what height is measured', async () => {
    await renderGrid();

    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 5000 } },
    });
    const firstStyle = screen.getByTestId('grid-cell-a').props.style;

    // same width, a different wrong height — pins that measured height is
    // not an input to sizing at all, not merely that one bad value is
    // tolerated.
    await fireEvent(screen.getByTestId('grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 399, height: 1 } },
    });
    const secondStyle = screen.getByTestId('grid-cell-a').props.style;

    expect(secondStyle).toEqual(firstStyle);
    expect(secondStyle).toEqual({ width: 199.5, height: 199.5 });
  });
});

// regression coverage for the wrap-at-12-columns bug found on a real
// device — row 1 of the 13×13 rank-pair grid read `AA` through `A3s`
// (twelve cells), with `A2s` starting row 2 — caused by `flexWrap`
// deciding a row's own break from each child's *rendered*, pixel-rounded
// width. RNTL runs no layout engine (see this file's own closing comment),
// so nothing here can prove a real container's measured width in pixels;
// what it can prove is that the grid's own column count is now structural
// — rendered as `rows` explicit row containers, each with exactly
// `columns` cells — rather than left to `flexWrap` to decide from a
// rounded width at all.
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
      const row = screen.getByTestId(`wide-grid-row-${rowIndex}`);
      expect(within(row).getAllByRole('button')).toHaveLength(WIDE_COLUMNS);
    }
  });
});

// what this file does not, and cannot, reach: `fireGestureHandler` injects
// handler *state transitions* directly (BEGAN/ACTIVE/END, with whatever
// x/y the test supplies) — it does not run this project's actual arithmetic
// twice to prove `resolveCellIndex` agrees with what a real finger crossing
// a real 13×13 grid at real device pixel coordinates would resolve to. that
// arithmetic itself is what `selection-grid-paint.ts` is deliberately kept
// free of (it only ever receives a `Key`, never an x/y) — `resolveCellIndex`
// is tested here only indirectly, through the coordinates each case above
// chose by hand. it also cannot prove real on-device gesture *recognition*
// — how many pixels of travel Android or iOS actually reports before this
// component's `Gesture.Pan()` activates, or whether `minDistance(0)` reads
// as intended against a real touchscreen's own debouncing — which stays a
// manual device check, same as the whole rest of this run's gesture work.
