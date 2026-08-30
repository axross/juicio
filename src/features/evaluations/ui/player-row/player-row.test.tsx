// registers this project's real themes against the mocked
// `StyleSheet.configure` — see `../../../../shared/ui/bottom-sheet/
// bottom-sheet.test.tsx`'s own matching comment.
import '@/core/theme/unistyles';
// registers this project's real i18next resources — this row's own
// `analyze`/`handRanges` copy, and `../../../../shared/ui/
// card-spoken-name.ts`'s accessibility labels, both need real resources to
// resolve against.
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `bottom-sheet.test.tsx`'s own matching comment.
import 'react-native-gesture-handler/jestSetup';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { GestureHandlerRootView, State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import type { Holding } from '@/features/hand-ranges/model/holding';

import type { Player } from '../../model/player';
import { PlayerRow } from './player-row';

// this component (via `../../../../shared/ui/playing-card/playing-card.tsx`
// and its own `useSharedValue`/`useAnimatedStyle`) reaches into
// `react-native-worklets`' native module on import, and its committed-delete
// path drives a real `withSpring` — mocking the whole of
// `react-native-reanimated` with its own Jest mock (not only
// `react-native-worklets`) is what lets that spring's completion callback
// resolve synchronously here, the same reason
// `bottom-sheet.test.tsx`'s own matching comment gives for `commitClose`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
// an automock still needs the real `./haptics` once, to introspect its
// exports — see `bottom-sheet.test.tsx`'s own matching comment — and that
// reaches `@sentry/react-native` via `report-error`, which starts a real
// `setInterval` nothing here clears.
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

const mockedTriggerHaptic = jest.mocked(triggerHaptic);

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
});

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
};

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) };

const HOLE_CARDS_PLAYER: Player = { id: 'player-1', holding: HOLE_CARDS_HOLDING };
const HAND_RANGE_PLAYER: Player = { id: 'player-2', holding: HAND_RANGE_HOLDING };

async function renderRow(player: Player, onDelete: jest.Mock = jest.fn()) {
  await render(
    <GestureHandlerRootView>
      <PlayerRow player={player} onDelete={onDelete} testID="row" />
    </GestureHandlerRootView>,
  );
  return onDelete;
}

/** a swipe drag: touch down and lift with `translationX` — a bare
 * `BEGAN`→`END` pair is enough, the same shape
 * `bottom-sheet.test.tsx`'s own `fireDrag` uses, and for the same reason:
 * `player-row.tsx`'s `onEnd` computes its own release decision from the
 * gesture's start and end translation directly, not by reading a shared
 * value `fireGestureHandler`'s synthesised `ACTIVE` step would otherwise
 * need to have carried forward first. */
function fireSwipe(translationX: number) {
  fireGestureHandler(getByGestureTestId('swipe'), [
    { state: State.BEGAN, x: 0, y: 0 },
    { state: State.END, translationX },
  ]);
}

describe('<PlayerRow /> — exact holding', () => {
  it("renders the two cards' notation as the label and 'Hole cards' as the subtitle", async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('label').props.children).toBe('A♡T♡');
    expect(screen.getByTestId('subtitle').props.children).toBe('Hole cards');
  });

  it('carries one accessibility label describing the holding, and a delete accessibility action', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    const content = screen.getByTestId('content');
    expect(content.props.accessibilityLabel).toBe('Player: ace of hearts and ten of hearts');
    expect(content.props.accessibilityActions).toEqual([
      { name: 'delete', label: 'Delete player' },
    ]);
  });
});

describe('<PlayerRow /> — hand range', () => {
  it("renders 'Custom' as the label and the card-pair count as the subtitle", async () => {
    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.getByTestId('label').props.children).toBe('Custom');
    // AA (6) + AKs (4) = 10 card pairs.
    expect(screen.getByTestId('subtitle').props.children).toBe('10 combos');
  });

  it('carries an accessibility label naming the range and its combo count', async () => {
    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.getByTestId('content').props.accessibilityLabel).toBe(
      'Player: custom hand range, 10 combos',
    );
  });
});

describe('<PlayerRow /> swipe', () => {
  it('fires dragStart once the gesture begins', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireGestureHandler(getByGestureTestId('swipe'), [{ state: State.BEGAN, x: 0, y: 0 }]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragStart);
  });

  it('springs back to rest, firing dragEnd, on a short release', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-20);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it('rests revealed, without deleting, on a release past the reveal threshold but short of the commit threshold', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-150);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it('commits the deletion, firing dragEnd, once carried past the commit threshold', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-300);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });
});

describe('<PlayerRow /> the revealed delete panel', () => {
  it('deletes the player when tapped', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    await fireEvent.press(screen.getByTestId('bin'));

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('is hidden from a screen reader', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('bin').props.accessible).toBe(false);
  });
});

describe('<PlayerRow /> the delete accessibility action', () => {
  it('deletes the player without the gesture, and fires no haptic of its own', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });

  it('ignores any other action name', async () => {
    const onDelete = await renderRow(HOLE_CARDS_PLAYER);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onDelete).not.toHaveBeenCalled();
  });
});
