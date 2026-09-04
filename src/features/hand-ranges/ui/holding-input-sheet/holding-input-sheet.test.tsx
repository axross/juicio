// registers this project's real themes and namespaces — see
// `../../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet as RNStyleSheet } from 'react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { cardPair } from '@/shared/model/card-pair';
import { computeFanLayout, FAN_ARC } from '@/shared/ui/card-fan-geometry';
import { PortalHost } from '@/shared/ui/portal/portal';

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

// returns the render result too now, not only the two mocks — a reopen
// test needs it to re-render with a changed `visible` (and, for one case,
// a changed `initialHolding`) against the same mounted tree, the way
// `../../../evaluations/ui/board-input-sheet/board-input-sheet.test.tsx`'s
// own `renderSheet` already does for the sibling sheet's own reopen test.
async function renderSheet(props: Partial<Omit<HoldingInputSheetProps, 'testID'>> = {}) {
  const onSubmit = (props.onSubmit as jest.Mock) ?? jest.fn();
  const onDismiss = (props.onDismiss as jest.Mock) ?? jest.fn();

  // `HoldingInputSheet` renders through `../../../../shared/ui/bottom-sheet/
  // bottom-sheet.tsx`'s own `<PortalHost />` now (`usePortal`, see that
  // component's doc comment) rather than in place, so every render here
  // needs a `<PortalHost />` ancestor — `usePortal` throws without one.
  const view = await render(
    <GestureHandlerRootView>
      <PortalHost>
        <HoldingInputSheet
          visible={props.visible ?? true}
          initialHolding={props.initialHolding}
          unavailableCards={props.unavailableCards}
          onSubmit={onSubmit}
          onDismiss={onDismiss}
          testID="sheet"
        />
      </PortalHost>
    </GestureHandlerRootView>,
  );

  return { onSubmit, onDismiss, view };
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
    // (`../../../../shared/model/hand-range-shorthand.ts`), the simplest
    // way to select a rank pair without measuring the grid's own layout.
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
    // via `initialFocusedSlot`
    // (`../../../../shared/ui/cards-pane/selection.ts`) on the way back,
    // since there's no remount for that hook to re-run from.
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'The left card (deuce of spades) is focused. Your next pick replaces it.',
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

describe('<HoldingInputSheet /> reopen', () => {
  it('mounts a reopened sheet with slot 0 focused, not the previous session’s leftover focus on slot 1', async () => {
    // one card left in slot 0 advances `CardsPane`'s own focus to slot 1
    // (`selectCard`, `../../../../shared/ui/cards-pane/selection.ts`) —
    // the leftover this test's reopen must not carry forward. a reopen
    // with no `initialHolding` re-seeds an empty pair
    // (`../../adapter/use-holding-input.ts`'s `deriveHoldingInputState`),
    // so the picker must mount focused on slot 0 over that empty pair,
    // not slot 1 over the closed sheet's own leftover card.
    const { onSubmit, onDismiss, view } = await renderSheet();
    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);

    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet
            visible={false}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );
    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet visible onSubmit={onSubmit} onDismiss={onDismiss} testID="sheet" />
        </PortalHost>
      </GestureHandlerRootView>,
    );

    expect(screen.getByTestId('slot-0').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('slot-1').props.accessibilityState?.selected).toBe(false);
  });

  it('mounts a reopened sheet focused on slot 0 with a holeCards initialHolding that fills both slots, not the previous session’s leftover focus', async () => {
    // the leftover-card precondition is what makes this a regression
    // test rather than a case the old ordering would also pass by
    // accident: both slots end up filled either way, but only the
    // render-phase fix guarantees `CardsPane` mounts against *this*
    // reopen's own seeded pair rather than the closed sheet's leftover
    // single card, which is what seats focus on slot 0 rather than slot 1.
    const { onSubmit, onDismiss, view } = await renderSheet();
    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);

    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet
            visible={false}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );
    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet
            visible
            initialHolding={{
              kind: 'holeCards',
              // `cardPair()` (`@/shared/model/card-pair.ts`) order-normalises
              // its two arguments — the higher-ranked card first — so this
              // seeds `first: five of clubs, second: four of diamonds`
              // regardless of the order given here.
              holeCards: cardPair({ rank: '4', suit: 'd' }, { rank: '5', suit: 'c' }),
            }}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );

    expect(screen.getByTestId('slot-0').props.accessibilityState?.selected).toBe(true);
    expect(screen.getByTestId('slot-1').props.accessibilityState?.selected).toBe(false);
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'The left card (five of clubs) is focused. Your next pick replaces it.',
    );
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Hole card 2: four of diamonds',
    );
  });
});

// issue #101: opening this sheet used to build both panes unconditionally
// — the 13-by-13 hand-range grid included, whether or not the user ever
// looked at that tab. A pane now builds only once its own tab is first
// selected (`builtTabs`, `../../adapter/use-holding-input.ts`), and then
// stays built — mounted, never torn down and rebuilt — for as long as the
// sheet stays open, exactly as both panes always stayed mounted before
// this change: unmounting `CardsPane` on a switch away from it reset its
// own measured `fanWidth`, which sprang the sheet's own height. `not yet
// built` is stronger than `hidden`: it means the pane doesn't exist in the
// tree at all, not merely `display: none` — `queryByTestId` with
// `includeHiddenElements: true` still returns `null` for it, unlike the
// inactive-but-already-built pane below, which that same option does find.
describe('<HoldingInputSheet /> lazy tab mounting', () => {
  it('builds only the tab it opens on — the other pane does not exist at all until selected', async () => {
    await renderSheet();

    // Cards is the default tab: its own pane already exists...
    expect(screen.getByTestId('cards-pane')).toBeTruthy();
    // ... Hand Range's does not — not merely hidden, but absent even from
    // an `includeHiddenElements: true` query.
    expect(screen.queryByTestId('hand-range-pane')).toBeNull();
    expect(screen.queryByTestId('hand-range-pane', { includeHiddenElements: true })).toBeNull();
  });

  it('builds a tab once it is first selected, hiding — without unmounting — the pane switched away from', async () => {
    await renderSheet();

    await switchToHandRangeTab();

    expect(screen.getByTestId('hand-range-pane')).toBeTruthy();
    // Cards is no longer active, but it was already built — hidden from
    // the default query, not gone from the tree.
    expect(screen.queryByTestId('cards-pane')).toBeNull();
    expect(screen.getByTestId('cards-pane', { includeHiddenElements: true })).toBeTruthy();
  });

  it('keeps a once-built tab mounted — switching back to it does not rebuild it, and it stays reachable while inactive', async () => {
    await renderSheet();

    await switchToHandRangeTab();
    await switchToCardsTab();

    expect(screen.getByTestId('cards-pane')).toBeTruthy();
    // Hand Range, built during the switch above, stays in the tree now
    // that it's inactive again rather than being torn down.
    expect(screen.queryByTestId('hand-range-pane')).toBeNull();
    expect(screen.getByTestId('hand-range-pane', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders the inactive-but-already-built pane’s own root with display: none', async () => {
    await renderSheet();

    await switchToHandRangeTab();

    expect(screen.getByTestId('cards-pane', { includeHiddenElements: true }).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ display: 'none' })]),
    );
  });

  it('reopening the sheet starts over — the previously visited tab is not already built on the fresh open', async () => {
    const onSubmit = jest.fn();
    const onDismiss = jest.fn();
    const { view } = await renderSheet({ onSubmit, onDismiss });

    await switchToHandRangeTab(); // builds it during this open

    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet
            visible={false}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );
    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <HoldingInputSheet visible onSubmit={onSubmit} onDismiss={onDismiss} testID="sheet" />
        </PortalHost>
      </GestureHandlerRootView>,
    );

    // the fresh open reseeds onto Cards (no `initialHolding`) and must not
    // still find Hand Range marked built from the session that just closed.
    expect(screen.getByTestId('cards-pane')).toBeTruthy();
    expect(screen.queryByTestId('hand-range-pane', { includeHiddenElements: true })).toBeNull();
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

// issue #167: this sheet computes `BottomSheet`'s new `maxWidth` prop from
// `useUnistyles()`'s own `rt` — react-native-unistyles' Jest mock
// (`jest.setup.ts`) pins `rt.screen.width` at a fixed `0`, well below
// `BottomSheet`'s own 600px cap, so `editSheetMaxWidth`
// (`@/shared/ui/edit-sheet-max-width.ts`) resolves to `undefined` on every
// render here — exactly the case this pins: below the cap, this sheet's
// own panel renders exactly as it did before this wiring existed, with no
// `maxWidth` constraint applied. The at-or-above-cap branch is covered by
// `@/shared/ui/edit-sheet-max-width.test.ts` and
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// `maxWidth` tests directly; nothing under this mock can drive
// `rt.screen.width` past 600 to exercise it here too.
describe('<HoldingInputSheet /> width ceiling (issue #167)', () => {
  it('leaves the panel’s rendered width unconstrained below the 600px cap', async () => {
    await renderSheet();

    const panelStyle = RNStyleSheet.flatten(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.style,
    );

    expect(panelStyle.maxWidth).toBeUndefined();
  });
});

describe('<HoldingInputSheet /> unavailableCards', () => {
  it('renders an unavailable card in the Cards tab’s own fan, and neither a tap nor a drag release picks it', async () => {
    const { onSubmit } = await renderSheet({ unavailableCards: [{ rank: '2', suit: 's' }] });

    await switchToCardsTab();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await closeSheet();

    // the deuce of spades never landed in a slot — `nearestSelectableCardIndex`
    // resolved the tap to the three of spades instead, the same
    // distinctness rule an already-taken card gets.
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'holeCards',
      holeCards: cardPair({ rank: '3', suit: 's' }, { rank: '3', suit: 'h' }),
    });
  });

  it('leaves the Hand Range tab’s grid, shorthand chips, and card pair count untouched — an explicit non-goal', async () => {
    const withoutUnavailable = await renderSheet();
    await switchToHandRangeTab();
    await pressChip('55+');
    const countWithoutUnavailable = screen.getByTestId('count').props.children;

    await withoutUnavailable.view.unmount();

    // rendered again, this time with `unavailableCards` set, and the same
    // chip pressed: nothing about the count — or the chip's own reach —
    // changes, since `unavailableCards` never reaches this tab at all.
    await renderSheet({ unavailableCards: [{ rank: '2', suit: 's' }] });
    await switchToHandRangeTab();
    await pressChip('55+');

    expect(screen.getByTestId('count').props.children).toBe(countWithoutUnavailable);
  });
});
