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

import { computeFanLayout, FAN_ARC } from '@/shared/ui/card-fan-geometry';
import { PortalHost } from '@/shared/ui/portal/portal';

import { BoardDismissReason } from '../../model/board';
import { BoardInputSheet } from './board-input-sheet';

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

const FAN_CONTENT_WIDTH = FAN_ARC.frameWidth + 2;
const LAYOUT = computeFanLayout(FAN_CONTENT_WIDTH);
// ascending rank order (2..A) — index 0 is the deuce, index 12 the ace.
const TWO_X = LAYOUT.cards[0].centerX;
const THREE_X = LAYOUT.cards[1].centerX;
const FOUR_X = LAYOUT.cards[2].centerX;

async function renderSheet({ focusedSlot = 0 }: { focusedSlot?: number } = {}) {
  const onSubmit = jest.fn();
  const onDismiss = jest.fn();

  // `BoardInputSheet` renders through `BottomSheet`'s own `<PortalHost />`
  // (`usePortal`), so every render here needs a `<PortalHost />` ancestor —
  // `usePortal` throws without one. `render` is synchronous at the RNTL
  // version this project pins; the `await` matches every other suite here
  // (docs/conventions/testing.md).
  const view = await render(
    <GestureHandlerRootView>
      <PortalHost>
        <BoardInputSheet
          visible
          focusedSlot={focusedSlot}
          onSubmit={onSubmit}
          onDismiss={onDismiss}
          testID="sheet"
        />
      </PortalHost>
    </GestureHandlerRootView>,
  );

  return { onSubmit, onDismiss, view };
}

/** commits a dismissal via the backdrop, one of the sheet's three ways to
 * close — this sheet draws no confirm button, per option 1A. */
async function closeSheet() {
  await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
}

/** commits a dismissal via the handle tap — the path `e2e/flows/SCN-013.yaml`
 * actually exercises. wrapped in `act()` the same way `fireArcTap` is:
 * firing the gesture directly, outside RNTL's own `fireEvent`, does not
 * otherwise flush the resulting state update. */
async function closeSheetViaHandleTap() {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('tap'), [{ state: State.BEGAN }, { state: State.END }]);
  });
}

/** measures the picker's own fan, so a subsequent `fireArcTap` can resolve
 * a touch to a card — see `cards-pane.test.tsx`'s own `renderPane`. */
async function measureFan() {
  await fireEvent(screen.getByTestId('fan'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: FAN_CONTENT_WIDTH, height: 400 } },
  });
}

/** taps a fan card in the given suit's arc — see `cards-pane.test.tsx`'s
 * own `fireArcTap` for why this needs `act()`. */
async function fireArcTap(suit: string, x: number) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(`arc-${suit}`), [
      { state: State.BEGAN, x, y: 40 },
      { state: State.END, x, y: 40 },
    ]);
  });
}

function focusedSlotIndex(): number {
  const slots = screen.getAllByTestId(/^slot-\d$/);
  return slots.findIndex((slot) => slot.props.accessibilityState?.selected === true);
}

describe('<BoardInputSheet /> layout', () => {
  it('shows five preview slots and no tab row — option 1A', async () => {
    await renderSheet();

    expect(screen.getAllByTestId(/^slot-\d$/)).toHaveLength(5);
    // the design draws a `Hand Range` / `Hand` tab row above these slots;
    // it is deliberately dropped, so `BottomSheet`'s own `header` slot is
    // never rendered and the slots sit directly under the handle.
    expect(screen.queryByTestId('header', { includeHiddenElements: true })).toBeNull();
    expect(screen.queryByTestId('tabs', { includeHiddenElements: true })).toBeNull();
  });

  it('names itself and its handle for the board rather than for a player', async () => {
    await renderSheet();

    expect(
      screen.getByTestId('panel', { includeHiddenElements: true }).props.accessibilityLabel,
    ).toBe("Enter the board's community cards");
    expect(screen.getByTestId('handle').props.accessibilityLabel).toBe('Dismiss board card input');
  });

  it('labels every slot by its board position, and summarises the row while all five are empty', async () => {
    await renderSheet();

    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1 is not selected',
    );
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5 is not selected',
    );
    expect(screen.getByTestId('slots').props.accessibilityLabel).toBe(
      'No board cards are selected',
    );
  });
});

describe('<BoardInputSheet /> focus', () => {
  it('carries the focus ring on exactly one slot', async () => {
    await renderSheet({ focusedSlot: 0 });

    expect(screen.getAllByTestId('ring')).toHaveLength(1);
    expect(
      screen.getAllByTestId(/^slot-\d$/).filter((slot) => slot.props.accessibilityState?.selected),
    ).toHaveLength(1);
  });

  it('opens on the first slot whichever slot was pressed, while the board is empty', async () => {
    // every slot past the first empty one clamps back onto it, so on an
    // empty board every one of the five opens the sheet focused on slot 1.
    await renderSheet({ focusedSlot: 4 });

    expect(focusedSlotIndex()).toBe(0);
  });

  it('opens on the pressed slot once the board has cards up to it', async () => {
    await renderSheet({ focusedSlot: 2 });
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);

    // two picks from slot 0 leave focus on slot 2, the first empty one —
    // which is also where a press on slot 2 would have opened it.
    expect(focusedSlotIndex()).toBe(2);
  });

  it('moves focus one slot right on a pick, and stays on the last slot once it is reached', async () => {
    await renderSheet();
    await measureFan();

    await fireArcTap('s', TWO_X);
    expect(focusedSlotIndex()).toBe(1);

    await fireArcTap('h', THREE_X);
    expect(focusedSlotIndex()).toBe(2);

    await fireArcTap('d', FOUR_X);
    await fireArcTap('c', TWO_X);
    await fireArcTap('s', THREE_X);
    expect(focusedSlotIndex()).toBe(4);

    // a sixth pick on a full board replaces the river rather than wrapping
    // back to the flop's first card, and focus stays where it is.
    await fireArcTap('h', FOUR_X);
    expect(focusedSlotIndex()).toBe(4);
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5 (four of hearts) is focused. Your next pick replaces it.',
    );
  });

  it('moves focus to a tapped slot, clamped so it never lands past the first empty one', async () => {
    await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);

    await fireEvent.press(screen.getByTestId('slot-4'));

    // one card on the board makes slot 1 the first empty one, so a tap on
    // slot 4 lands there rather than leaving slots 1 to 3 skippable.
    expect(focusedSlotIndex()).toBe(1);
  });

  it('clears the focused slot on a second tap, shifts the cards behind it left, and follows them', async () => {
    await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);

    await fireEvent.press(screen.getByTestId('slot-0')); // focus the first card
    await fireEvent.press(screen.getByTestId('slot-0')); // tap it again to clear

    // the deuce of spades is gone and the three of hearts has moved into
    // slot 0 behind it, leaving no gap. focus moves off slot 0 with it, to
    // slot 1 — the first empty one — because the three of hearts now sits
    // where the cleared deuce was, and a pick aimed at slot 0 would
    // destroy it rather than replace the card the user actually cleared.
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1: three of hearts',
    );
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Board card 2 is not selected',
    );
    expect(focusedSlotIndex()).toBe(1);
  });

  it('leaves the next pick after a clear extending the board rather than overwriting the shifted card', async () => {
    // the same guarantee from the user's side of the sheet: three cards
    // in, clearing the first leaves two, and the next pick makes three
    // again rather than silently replacing the card the shift moved down.
    const { onSubmit } = await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await fireArcTap('d', FOUR_X);

    await fireEvent.press(screen.getByTestId('slot-0'));
    await fireEvent.press(screen.getByTestId('slot-0')); // clears the deuce of spades
    await fireArcTap('c', TWO_X);

    await closeSheet();

    expect(onSubmit).toHaveBeenCalledWith([
      { rank: '3', suit: 'h' },
      { rank: '4', suit: 'd' },
      { rank: '2', suit: 'c' },
    ]);
  });

  it('reopens focused on the first slot after a previous edit, not on that edit’s leftovers', async () => {
    // the ordering `../../adapter/use-board-input.ts` exists for: the
    // picker derives its initial focus from the slots it mounts against,
    // so a reset that landed after the mount would leave focus at slot 2
    // over a board this reopen has just emptied — and the next pick would
    // then land there, leaving slots 1 and 2 empty behind it.
    const { view } = await renderSheet({ focusedSlot: 0 });
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    expect(focusedSlotIndex()).toBe(2);

    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <BoardInputSheet
            visible={false}
            focusedSlot={0}
            onSubmit={jest.fn()}
            onDismiss={jest.fn()}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );
    await view.rerender(
      <GestureHandlerRootView>
        <PortalHost>
          <BoardInputSheet
            visible
            focusedSlot={2}
            onSubmit={jest.fn()}
            onDismiss={jest.fn()}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>,
    );

    expect(focusedSlotIndex()).toBe(0);
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1 is not selected',
    );
  });
});

describe('<BoardInputSheet /> the fan', () => {
  it('skips a card already on the board, resolving a touch at its position to the next one', async () => {
    // `nearestSelectableCardIndex` (`@/shared/ui/card-fan-geometry`) skips
    // a taken card, so a touch back at the deuce's own position resolves
    // onto the three instead — the distinctness rule, exercised through
    // this sheet's actual touch path.
    await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);

    await fireArcTap('s', TWO_X);

    // two picks leave focus on slot 3, so slot 2 reads its filled,
    // unfocused label — the three of spades, not the deuce a touch back at
    // the deuce's own position would otherwise have resolved to again.
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Board card 2: three of spades',
    );
  });
});

describe('<BoardInputSheet /> outcome', () => {
  it('submits an empty board when nothing was picked', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await closeSheet();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith([]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses IncompleteBoard at one card', async () => {
    const { onSubmit, onDismiss } = await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);

    await closeSheet();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(BoardDismissReason.IncompleteBoard);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('dismisses IncompleteBoard at two cards', async () => {
    const { onSubmit, onDismiss } = await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);

    await closeSheet();

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith(BoardDismissReason.IncompleteBoard);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a flop at three cards, in the order they were picked', async () => {
    const { onSubmit, onDismiss } = await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await fireArcTap('d', FOUR_X);

    await closeSheet();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
      { rank: '4', suit: 'd' },
    ]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('reports exactly one outcome per close via the handle tap too, not only the backdrop', async () => {
    const { onSubmit, onDismiss } = await renderSheet();

    await closeSheetViaHandleTap();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('reports exactly one outcome per close across a close, a reopen, and a second close', async () => {
    // the one sequence a stale-closure double-fire would surface in:
    // `handleRequestClose` captures `slots`, and this sheet's state is
    // reset on reopen (`../../adapter/use-board-input.ts`), so a second
    // close still reading the first close's captured slots — or firing
    // twice for one dismissal — shows up here and in no single-close test.
    const onSubmit = jest.fn();
    const onDismiss = jest.fn();
    const tree = (visible: boolean) => (
      <GestureHandlerRootView>
        <PortalHost>
          <BoardInputSheet
            visible={visible}
            focusedSlot={0}
            onSubmit={onSubmit}
            onDismiss={onDismiss}
            testID="sheet"
          />
        </PortalHost>
      </GestureHandlerRootView>
    );

    const view = await render(tree(true));
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireArcTap('h', THREE_X);
    await fireArcTap('d', FOUR_X);
    await closeSheet();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenLastCalledWith([
      { rank: '2', suit: 's' },
      { rank: '3', suit: 'h' },
      { rank: '4', suit: 'd' },
    ]);

    await view.rerender(tree(false));
    await view.rerender(tree(true));
    await closeSheet();

    // the second close carries the reopened sheet's own state — an empty
    // board — rather than the flop the first close submitted, and adds
    // exactly one call rather than two.
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith([]);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('never calls either callback while nothing has closed the sheet', async () => {
    const { onSubmit, onDismiss } = await renderSheet();
    await measureFan();
    await fireArcTap('s', TWO_X);
    await fireEvent.press(screen.getByTestId('slot-0'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
