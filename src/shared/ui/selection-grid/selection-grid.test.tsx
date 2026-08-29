// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `segmented-tabs.test.tsx`'s own comment on
// why this side-effect import has to run before anything themed renders.
import '@/core/theme/unistyles';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` throws (`RNGestureHandlerModule.install is not
// a function`) the moment it tries to reach the native module Jest has no
// binary for.
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen } from '@testing-library/react-native';
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
