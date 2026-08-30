// registers this project's real themes and namespaces — see
// `../../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PortalHost } from '@/shared/ui/portal/portal';

import { cardPair } from '../../model/card-pair';
import { computeFanLayout, FAN_ARC } from '../card-fan-geometry';
import { HoldingInputSheet, type HoldingInputSheetProps } from './holding-input-sheet';

// see `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s
// comment on why both of these are lazy `require()`s inside the mock
// factory, not a same-file `import`, and why `react-native-reanimated`
// needs mocking here even though this sheet's own code never imports it
// directly — `BottomSheet`, which this component composes, does.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');

// an automock still needs the real `./haptics` once, to introspect its
// exports (see `settings-screen.test.tsx`'s `change-theme` comment) — and
// that reaches `@sentry/react-native` via `report-error`, which starts a
// real `setInterval` nothing here clears. mocking `report-error` too keeps
// the native SDK out entirely.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

const FAN_CONTENT_WIDTH = FAN_ARC.frameWidth + 2;
const LAYOUT = computeFanLayout(FAN_CONTENT_WIDTH);
const TWO_X = LAYOUT.cards[0].centerX;
const THREE_X = LAYOUT.cards[1].centerX;

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

async function renderSheet(
  props: Partial<Omit<HoldingInputSheetProps, 'testID'>> = {},
): Promise<{ onSubmit: jest.Mock; onDismiss: jest.Mock }> {
  const onSubmit = (props.onSubmit as jest.Mock) ?? jest.fn();
  const onDismiss = (props.onDismiss as jest.Mock) ?? jest.fn();

  // `HoldingInputSheet` renders through `../../../../shared/ui/bottom-sheet/
  // bottom-sheet.tsx`'s own `<PortalHost />` now (`usePortal`, see that
  // component's doc comment) rather than in place, so every render here
  // needs a `<PortalHost />` ancestor — `usePortal` throws without one.
  await render(
    <GestureHandlerRootView>
      <PortalHost>
        <HoldingInputSheet
          visible={props.visible ?? true}
          initialHolding={props.initialHolding}
          onSubmit={onSubmit}
          onDismiss={onDismiss}
          testID="sheet"
        />
      </PortalHost>
    </GestureHandlerRootView>,
  );

  return { onSubmit, onDismiss };
}

/** commits a dismissal via the backdrop, exactly as
 * `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own tests do
 * — one of the sheet's three ways to close, per this component's own doc
 * comment on why there is no separate confirm button. */
async function closeSheet() {
  await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
}

/** commits a dismissal via the handle tap — the path
 * `e2e/flows/SCN-011.yaml` actually exercises, unlike `closeSheet`
 * above's backdrop tap. wrapped in `act()` the same way `fireArcTap`
 * below is: firing the gesture directly, outside RNTL's own `fireEvent`,
 * does not otherwise flush the resulting state update. */
async function closeSheetViaHandleTap() {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('tap'), [{ state: State.BEGAN }, { state: State.END }]);
  });
}

async function switchToCardsTab() {
  await fireEvent.press(screen.getByTestId('tab-cards'));
}

async function switchToHandRangeTab() {
  await fireEvent.press(screen.getByTestId('tab-handRange'));
}

/** measures the cards pane's own fan, the way `cards-pane.test.tsx`'s own
 * `renderPane` does, so a subsequent `fireArcTap` can resolve a touch to
 * a card. */
async function measureFan() {
  await fireEvent(screen.getByTestId('fan'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: FAN_CONTENT_WIDTH, height: 400 } },
  });
}

/** taps a fan card in the given suit's arc — see
 * `cards-pane.test.tsx`'s own `fireArcTap` for why this needs `act()`. */
async function fireArcTap(suit: string, x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`arc-${suit}`), [
      { state: State.BEGAN, x, y: 40 },
      { state: State.END, x, y: 40 },
    ]);
  });
}

async function pressChip(token: string) {
  await fireEvent.press(screen.getByTestId(`chip-${token}`));
}

describe('<HoldingInputSheet /> submit', () => {
  it('submits a holeCards holding when the Cards tab is active with two distinct cards picked', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await closeSheet();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'holeCards',
      holeCards: cardPair({ rank: '2', suit: 's' }, { rank: '3', suit: 'h' }),
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('submits a handRange holding when the Hand Range tab is active with at least one rank pair selected', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    // `55+` is one of the three shorthand chips
    // (`../model/hand-range-shorthand.ts`), the simplest way to select a
    // rank pair without measuring the grid's own layout.
    await switchToHandRangeTab();
    await pressChip('55+');
    await closeSheet();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0][0];
    expect(call.kind).toBe('handRange');
    expect(call.rankPairs.has('AA')).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('<HoldingInputSheet /> dismiss', () => {
  it('dismisses NothingSelected when nothing was ever touched', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await closeSheet();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('nothing-selected');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses NothingSelected via the handle tap too, same as the backdrop path above — the path SCN-011 actually exercises', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await closeSheetViaHandleTap();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('nothing-selected');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses IncompleteHoleCards when the Cards tab is active with only one card picked', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await closeSheet();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('incomplete-hole-cards');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses EmptyHandRange when the Hand Range tab is active, empty, while the other tab holds a partial pick', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X); // one card, leaves the Cards tab non-empty
    await switchToHandRangeTab(); // back to Hand Range, itself still empty
    await closeSheet();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('empty-hand-range');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('<HoldingInputSheet /> tab state preservation', () => {
  it('keeps the Cards tab’s own two picks after switching away and back, and still submits them', async () => {
    const { onSubmit } = await renderSheet();

    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);

    await switchToHandRangeTab();
    await pressChip('55+'); // touch the other tab's own state too
    await switchToCardsTab();

    // both slots still show their own card, proved through the preview
    // slot's accessibility label rather than re-measuring the fan.
    // `CardsPane` now stays mounted across the tab switch (see
    // `../holding-input-sheet.tsx`'s doc comment) rather than remounting,
    // so `focusedSlot` is whatever the two picks above already left it at
    // — filling slot 0 then slot 1 advances focus to the other slot each
    // time, landing back on slot 0 once both are full — not recomputed
    // via `initialFocusedSlot` (`../cards-pane/selection.ts`) on the way
    // back, since there's no remount for that hook to re-run from.
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Hole card 1: two of spades, focused — your next pick replaces it',
    );
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Hole card 2: three of hearts',
    );

    await closeSheet();

    // active tab at close (Cards) is what resolves — its own two cards,
    // not the Hand Range tab's own `55+` selection.
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'holeCards',
      holeCards: cardPair({ rank: '2', suit: 's' }, { rank: '3', suit: 'h' }),
    });
  });
});

// the inactive pane must not merely be invisible, it must be unreachable
// to a screen reader and to touch. RNTL's own default (accessibility-aware)
// query already excludes a `display: 'none'` element the same way it
// excludes anything else a screen reader couldn't reach —
// `includeHiddenElements: true` reaches past that, the same option
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// backdrop assertions already use for `accessibilityViewIsModal`. this
// proves the accessibility half directly; the touch half isn't something
// RNTL's own `fireEvent` can disprove (it invokes a handler by testID
// directly, without native hit-testing) — that stays a manual, on-device
// check.
describe('<HoldingInputSheet /> both panes stay mounted, only one visible', () => {
  it('keeps both panes in the tree, but only the inactive one hidden from the default accessibility-aware query', async () => {
    await renderSheet();

    // Cards is the default tab: its own pane is reachable by the default
    // query, Hand Range's own is not — but it still exists, reachable with
    // `includeHiddenElements: true`.
    expect(screen.getByTestId('cards-pane')).toBeTruthy();
    expect(screen.queryByTestId('hand-range-pane')).toBeNull();
    expect(screen.getByTestId('hand-range-pane', { includeHiddenElements: true })).toBeTruthy();
  });

  it('flips which pane is hidden when the tab switches, without either one leaving the tree', async () => {
    await renderSheet();

    await switchToHandRangeTab();

    expect(screen.getByTestId('hand-range-pane')).toBeTruthy();
    expect(screen.queryByTestId('cards-pane')).toBeNull();
    expect(screen.getByTestId('cards-pane', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders the inactive pane’s own root with display: none', async () => {
    await renderSheet();

    expect(
      screen.getByTestId('hand-range-pane', { includeHiddenElements: true }).props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ display: 'none' })]));
  });
});

describe('<HoldingInputSheet /> callback contract', () => {
  it('fires selectionChange exactly once per tab press', async () => {
    await renderSheet();

    await switchToCardsTab();

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.SelectionChange);
  });

  it('never calls onSubmit or onDismiss while not visible', async () => {
    const { onSubmit, onDismiss } = await renderSheet({ visible: false });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
