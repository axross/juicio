// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../evaluations/ui/player-row/
// player-row.test.tsx`'s own matching comment.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — this row's own
// `history`/`handRanges` copy needs real resources to resolve against.
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { motionSizeTimingConfig } from '@/core/motion/tokens';
import type { Card } from '@/shared/model/card';

import type { HistoryEntry } from '../../model/history-entry';
import { HistoryEntryRow } from './history-entry-row';

// mirrors `../../../evaluations/ui/player-row/player-row.test.tsx`'s own
// identical mocks and their own doc comments.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

const ACE_HEARTS: Card = { rank: 'A', suit: 'h' };
const TEN_HEARTS: Card = { rank: 'T', suit: 'h' };

const HOLE_CARDS_ENTRY: HistoryEntry = {
  id: 'entry-1',
  calculatedAt: 1000,
  board: [],
  players: [
    {
      holding: { kind: 'holeCards', holeCards: { first: ACE_HEARTS, second: TEN_HEARTS } },
      result: { win: 0.6, tie: 0.02, equity: 0.61 },
      name: 'Player 1',
    },
  ],
};

const HAND_RANGE_ENTRY: HistoryEntry = {
  id: 'entry-2',
  calculatedAt: 2000,
  board: [],
  players: [
    {
      holding: { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) },
      result: { win: 0.55, tie: 0.02, equity: 0.56 },
      name: 'Player 2',
    },
  ],
};

async function renderRow(entry: HistoryEntry, onDelete: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <HistoryEntryRow entry={entry} onDelete={onDelete} testID="row" />
    </GestureHandlerRootView>,
  );
  return { onDelete };
}

/** mirrors `player-row.test.tsx`'s own `fireSwipe` exactly — same
 * bare-`BEGAN`→`END` shape, for the same reason: `resolveSwipeRelease` is
 * evaluated directly from the event's own start/end translation, not from
 * an `onUpdate`-accumulated value. */
function fireSwipe(translationX: number) {
  fireGestureHandler(getByGestureTestId('swipe'), [
    { state: State.BEGAN, x: 0, y: 0 },
    { state: State.END, translationX },
  ]);
}

describe('<HistoryEntryRow /> — exact holding', () => {
  it("renders the saved player's own name as the label and 'Hole cards' as the subtitle", async () => {
    await renderRow(HOLE_CARDS_ENTRY);

    expect(screen.getByTestId('label').props.children).toBe('Player 1');
    expect(screen.getByTestId('subtitle').props.children).toBe('Hole cards');
  });

  it('carries an accessibility label naming the player and the two spoken cards', async () => {
    await renderRow(HOLE_CARDS_ENTRY);

    expect(screen.getByTestId('content').props.accessibilityLabel).toBe(
      'Player 1: ace of hearts and ten of hearts.',
    );
  });
});

describe('<HistoryEntryRow /> — hand range', () => {
  it("renders the saved player's own name as the label and the card-pair count as the subtitle", async () => {
    await renderRow(HAND_RANGE_ENTRY);

    expect(screen.getByTestId('label').props.children).toBe('Player 2');
    // AA (6) + AKs (4) = 10 card pairs.
    expect(screen.getByTestId('subtitle').props.children).toBe('10 combos');
  });

  it('carries an accessibility label naming the player and the combo count', async () => {
    await renderRow(HAND_RANGE_ENTRY);

    expect(screen.getByTestId('content').props.accessibilityLabel).toBe('Player 2: 10 combos.');
  });
});

describe('<HistoryEntryRow /> renders only the first player of a multi-player entry', () => {
  it('ignores every player after entry.players[0]', async () => {
    const twoPlayerEntry: HistoryEntry = {
      ...HAND_RANGE_ENTRY,
      players: [...HAND_RANGE_ENTRY.players, HOLE_CARDS_ENTRY.players[0]],
    };

    await renderRow(twoPlayerEntry);

    expect(screen.getByTestId('label').props.children).toBe('Player 2');
  });
});

describe('<HistoryEntryRow /> swipe', () => {
  it('fires dragStart once the gesture begins', async () => {
    await renderRow(HOLE_CARDS_ENTRY);

    act(() => {
      fireGestureHandler(getByGestureTestId('swipe'), [{ state: State.BEGAN, x: 0, y: 0 }]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragStart);
  });

  it('springs back to rest, firing dragEnd, on a short release', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    act(() => {
      fireSwipe(-20);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it('rests revealed, without deleting, on a release past the reveal threshold but short of the commit threshold', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    act(() => {
      fireSwipe(-150);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it("commits the deletion with the entry's own id, firing dragEnd, once carried past the commit threshold", async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    act(() => {
      fireSwipe(-300);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('entry-1');
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });
});

describe('<HistoryEntryRow /> the committed-delete height collapse', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collapses rowHeight through withTiming, against motionSizeTimingConfig — never a spring', async () => {
    const withTimingSpy = jest.spyOn(reanimatedMock, 'withTiming');
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    act(() => {
      fireSwipe(-300);
    });

    expect(withTimingSpy).toHaveBeenCalledWith(0, motionSizeTimingConfig, expect.any(Function));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('<HistoryEntryRow /> the revealed delete panel', () => {
  it('deletes the entry when tapped, and is hidden from a screen reader', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    expect(screen.getByTestId('bin').props.accessible).toBe(false);

    await fireEvent.press(screen.getByTestId('bin'));

    expect(onDelete).toHaveBeenCalledWith('entry-1');
  });
});

describe('<HistoryEntryRow /> the delete accessibility action', () => {
  it('deletes the entry without the gesture, and fires no haptic of its own', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(onDelete).toHaveBeenCalledWith('entry-1');
    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });

  it('ignores any other action name', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('<HistoryEntryRow /> tapping the row', () => {
  it('does nothing — no callback this component takes fires on a stationary press', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_ENTRY);

    await fireEvent.press(screen.getByTestId('content'));

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });
});
