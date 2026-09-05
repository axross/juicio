// registers this project's real themes and namespaces — see
// `../../../../shared/ui/segmented-tabs/segmented-tabs.test.tsx` for why
// this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';

import { fireEvent, render, screen } from '@testing-library/react-native';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { Card } from '@/shared/model/card';

import { BOARD_SLOT_COUNT, type Board as BoardType } from '../../model/board';
import { Board } from './board';

// this component now renders `PlayingCard` for a filled slot, which
// imports `react-native-reanimated` (its own entrance-animation shared
// values) — and that reaches into `react-native-worklets`' native module on
// import, same reason `../../../../shared/ui/cards-pane/cards-pane.test.tsx`
// and `../../../../shared/ui/playing-card/playing-card.test.tsx` both need
// this mock.
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

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const KING_CLUBS: Card = { rank: 'K', suit: 'c' };
const QUEEN_HEARTS: Card = { rank: 'Q', suit: 'h' };

const EMPTY_BOARD: BoardType = [];

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

async function renderBoard(cards: BoardType = EMPTY_BOARD, onEditRequest: jest.Mock = jest.fn()) {
  await render(<Board cards={cards} onEditRequest={onEditRequest} testID="board" />);
  return onEditRequest;
}

describe('<Board />', () => {
  it('renders one slot per community card', async () => {
    await renderBoard();

    expect(screen.getAllByTestId(/^slot-\d$/)).toHaveLength(BOARD_SLOT_COUNT);
  });

  it('gives each slot its own label naming its position and that it holds no card', async () => {
    await renderBoard();

    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1 is not selected',
    );
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5 is not selected',
    );
  });

  it('exposes each slot as a button rather than collapsing the row into one element', async () => {
    // `accessible={true}` would collapse every descendant into one
    // element, making five separate controls unreachable.
    await renderBoard();

    expect(screen.getByTestId('board').props.accessible).toBeFalsy();
    for (const slot of screen.getAllByTestId(/^slot-\d$/)) {
      expect(slot.props.accessibilityRole).toBe('button');
    }
  });

  it('still summarises the row, through a role that collapses nothing', async () => {
    // `accessibilityRole="summary"` + `accessibilityLabel` is how the row
    // keeps its one-line answer to "what is this" without swallowing the
    // five buttons the way `accessible` did — the same construction
    // `@/shared/ui/cards-pane/cards-pane.tsx`'s slots row uses.
    await renderBoard();

    expect(screen.getByTestId('board').props.accessibilityRole).toBe('summary');
    expect(screen.getByTestId('board').props.accessibilityLabel).toBe('Board, no cards yet');
  });

  it('reports the pressed slot, so the sheet can open focused on it', async () => {
    const onEditRequest = await renderBoard();

    await fireEvent.press(screen.getByTestId('slot-3'));

    expect(onEditRequest).toHaveBeenCalledTimes(1);
    expect(onEditRequest).toHaveBeenCalledWith(3);
  });

  it('fires the primaryAction haptic on a slot press, the same event + New Player fires', async () => {
    await renderBoard();

    await fireEvent.press(screen.getByTestId('slot-0'));

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  // the pressed state itself (a slot fades while a finger is
  // down on it) has no test here, and cannot have one: `Pressable` keeps
  // its press state internally, driven by the native touch responder, and
  // neither `fireEvent.press` nor a synthetic `pressIn` reaches it — the
  // rendered slot resolves to its resting style throughout, verified
  // against this suite rather than assumed. that leaves the fade to a
  // manual device check, which is also
  // the only thing that can judge whether so subtle a signal reads at all.
  // what is asserted instead is what actually carries "this is pressable"
  // to a screen reader: the button role above.
});

describe('<Board /> a populated board', () => {
  it('renders a PlayingCard in each filled slot and keeps the dashed outline for the rest', async () => {
    await renderBoard([ACE_SPADES, KING_CLUBS, QUEEN_HEARTS]);

    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1: ace of spades',
    );
    expect(screen.getByTestId('slot-1').props.accessibilityLabel).toBe(
      'Board card 2: king of clubs',
    );
    expect(screen.getByTestId('slot-2').props.accessibilityLabel).toBe(
      'Board card 3: queen of hearts',
    );
    // the two slots past the flop keep the empty label — a part-filled
    // board's own remaining slots stay dashed and unlabelled by any card.
    expect(screen.getByTestId('slot-3').props.accessibilityLabel).toBe(
      'Board card 4 is not selected',
    );
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5 is not selected',
    );
  });

  it('renders every one of the five cards on a full board, in dealing order', async () => {
    const fullBoard: BoardType = [
      ACE_SPADES,
      KING_CLUBS,
      QUEEN_HEARTS,
      { rank: 'T', suit: 'd' },
      { rank: '9', suit: 's' },
    ];

    await renderBoard(fullBoard);

    expect(screen.getByTestId('slot-3').props.accessibilityLabel).toBe(
      'Board card 4: ten of diamonds',
    );
    expect(screen.getByTestId('slot-4').props.accessibilityLabel).toBe(
      'Board card 5: nine of spades',
    );
  });

  it('summarises the row with a populated label, distinct from the empty-board one', async () => {
    await renderBoard([ACE_SPADES, KING_CLUBS]);

    expect(screen.getByTestId('board').props.accessibilityRole).toBe('summary');
    expect(screen.getByTestId('board').props.accessibilityLabel).toBe(
      'Board: ace of spades, king of clubs',
    );
  });

  it('still opens the board input sheet from a filled slot, reporting the same slot index', async () => {
    const onEditRequest = await renderBoard([ACE_SPADES]);

    await fireEvent.press(screen.getByTestId('slot-0'));

    expect(onEditRequest).toHaveBeenCalledWith(0);
  });
});

describe('<Board /> an empty board again', () => {
  it('returns to five dashed slots and the empty summary once cards is empty again', async () => {
    // the same component, rendered fresh with an empty board — the shape
    // a board submitted empty (`resolveBoardOutcome`) or the store's own
    // starting state (`../../adapter/use-board.ts`) both produce.
    await renderBoard(EMPTY_BOARD);

    expect(screen.getByTestId('board').props.accessibilityLabel).toBe('Board, no cards yet');
    expect(screen.getByTestId('slot-0').props.accessibilityLabel).toBe(
      'Board card 1 is not selected',
    );
  });
});
