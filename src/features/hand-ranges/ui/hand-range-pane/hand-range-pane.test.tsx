// registers this project's real themes and namespaces — see
// `../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx`'s own
// comment on why this side-effect import has to run before anything
// themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock: without it, mounting a
// `GestureHandlerRootView` (needed for `SelectionGrid`'s own gesture)
// throws — see `../../../shared/ui/selection-grid/selection-grid.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { triggerHaptic } from '@/core/haptics/haptics';

import { rankPairKey } from '../../model/rank-pair';
import { HandRangePane } from './hand-range-pane';

// see `../../../shared/ui/selection-grid/selection-grid.test.tsx`'s own
// comment on why this has to be a lazy `require()` inside the mock
// factory, not a same-file `import`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));

jest.mock('@/core/haptics/haptics');

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

async function renderPane(
  selectedRankPairs: ReadonlySet<string> = new Set(),
  onSelectionChange: jest.Mock = jest.fn(),
) {
  await render(
    <GestureHandlerRootView>
      <HandRangePane
        selectedRankPairs={selectedRankPairs}
        onSelectionChange={onSelectionChange}
        testID="pane"
      />
    </GestureHandlerRootView>,
  );

  // the grid needs a measured layout before its own gesture can resolve a
  // touch to a cell — see `selection-grid.test.tsx`'s own `renderGrid`.
  await fireEvent(screen.getByTestId('pane-grid'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
  });

  return onSelectionChange;
}

describe('<HandRangePane />', () => {
  it("renders the three shorthand chips' own labels", async () => {
    await renderPane();

    expect(screen.getByText('A2s+')).toBeTruthy();
    expect(screen.getByText('55+')).toBeTruthy();
    expect(screen.getByText('98s-54s')).toBeTruthy();
  });

  // the drawn chip is 37pt tall, under the 44×44 touch-target floor — see
  // `./hand-range-pane.tsx`'s own `CHIP_TOUCH_EXPANSION`, the same fix
  // `../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s handle already
  // applies to itself.
  it('expands each chip’s own touch target to the 44pt floor without resizing it', async () => {
    await renderPane();

    expect(screen.getByTestId('pane-chip-55+').props.hitSlop).toEqual({ top: 3.5, bottom: 3.5 });
  });

  it('renders the current selection’s own card pair count', async () => {
    await renderPane(new Set(['AA', 'AKs'])); // 6 + 4 = 10

    expect(screen.getByTestId('pane-count').props.children).toBe('10 Combos');
  });

  it('pressing a chip with any of its own rank pairs unselected selects all of them, firing toggleOn', async () => {
    const onSelectionChange = await renderPane(new Set(['22']));

    await fireEvent.press(screen.getByTestId('pane-chip-55+'));

    const next = onSelectionChange.mock.calls[0][0] as ReadonlySet<string>;
    // 55+ is every pocket pair 55 up to AA — the pre-existing 22 selection
    // (below 55) survives the union.
    expect(next.has('22')).toBe(true);
    expect(next.has('55')).toBe(true);
    expect(next.has('AA')).toBe(true);
    expect(next.has('44')).toBe(false);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOn');
  });

  it('pressing a chip whose own rank pairs are all already selected deselects all of them, firing toggleOff', async () => {
    let current = new Set<string>(['22']);
    const onSelectionChange = jest.fn((next: ReadonlySet<string>) => {
      current = new Set(next);
    });
    await render(
      <GestureHandlerRootView>
        <HandRangePane
          selectedRankPairs={current}
          onSelectionChange={onSelectionChange}
          testID="pane"
        />
      </GestureHandlerRootView>,
    );
    await fireEvent(screen.getByTestId('pane-grid'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
    });

    // select every pocket pair from 55 up first.
    await fireEvent.press(screen.getByTestId('pane-chip-55+'));
    await render(
      <GestureHandlerRootView>
        <HandRangePane
          selectedRankPairs={current}
          onSelectionChange={onSelectionChange}
          testID="pane"
        />
      </GestureHandlerRootView>,
    );
    mockedTriggerHaptic.mockClear();

    // pressing the same chip again, now that every one of its own rank
    // pairs is selected, clears exactly those — the pre-existing `22`
    // (outside 55+'s own set) is untouched.
    await fireEvent.press(screen.getByTestId('pane-chip-55+'));

    expect(current.has('22')).toBe(true);
    expect(current.has('55')).toBe(false);
    expect(current.has('AA')).toBe(false);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith('toggleOff');
  });

  it('two chips pressed in turn union together rather than each replacing the last', async () => {
    let current = new Set<string>();
    const onSelectionChange = jest.fn((next: ReadonlySet<string>) => {
      current = new Set(next);
    });
    await render(
      <GestureHandlerRootView>
        <HandRangePane
          selectedRankPairs={current}
          onSelectionChange={onSelectionChange}
          testID="pane"
        />
      </GestureHandlerRootView>,
    );

    await fireEvent.press(screen.getByTestId('pane-chip-A2s+'));
    expect(current.has('AKs')).toBe(true); // A2s+'s own suited-ace run

    // re-render with the chip's own result as the new selection, the way
    // a real controlled caller would.
    await render(
      <GestureHandlerRootView>
        <HandRangePane
          selectedRankPairs={current}
          onSelectionChange={onSelectionChange}
          testID="pane"
        />
      </GestureHandlerRootView>,
    );
    await fireEvent.press(screen.getByTestId('pane-chip-55+'));

    // both shorthands' own selections survive together.
    expect(current.has('AKs')).toBe(true);
    expect(current.has('AA')).toBe(true);
  });

  it("taps the grid's top-left cell (AA) and reports it selected, through SelectionGrid's own gesture", async () => {
    const onSelectionChange = await renderPane();

    fireGestureHandler(getByGestureTestId('pane-grid'), [
      { state: State.BEGAN, x: 5, y: 5 },
      { state: State.END, x: 5, y: 5 },
    ]);

    expect(onSelectionChange).toHaveBeenCalledWith(
      new Set([
        rankPairKey({ highRank: 'A', lowRank: 'A', suitedness: 'offsuit', isPocket: true }),
      ]),
    );
  });

  it('gives a grid cell an accessibility label naming its own rank pair', async () => {
    await renderPane();

    expect(screen.getByTestId('pane-grid-cell-AA').props.accessibilityLabel).toBe('Rank pair AA');
  });
});
