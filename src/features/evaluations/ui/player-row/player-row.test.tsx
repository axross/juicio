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
import { motionSizeTimingConfig } from '@/core/motion/tokens';
import type { Holding } from '@/features/hand-ranges/model/holding';
import type { EspadaEquityPlayerResult } from '@/modules/espada-engine/index';

import { useEquityEvaluationStore } from '../../adapter/use-equity-evaluation';
import type { Player } from '../../model/player';
import { ROW_HEIGHT } from '../player-row-content/player-row-content';
import { PlayerRow } from './player-row';

// this component (via `../../../../shared/ui/playing-card/playing-card.tsx`
// and its own `useSharedValue`/`useAnimatedStyle`) reaches into
// `react-native-worklets`' native module on import, and its committed-delete
// path drives a real `withTiming` (the row's own height collapse) and a real
// `withSpring` (the row's own horizontal exit) — mocking the whole of
// `react-native-reanimated` with its own Jest mock (not only
// `react-native-worklets`) is what lets both animations' completion
// callbacks resolve synchronously here, the same reason
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

// the same singleton `player-row.tsx`'s own import resolves to — see
// `bottom-sheet.test.tsx`'s own matching comment on why a plain
// `require()` reaches ordinary, spy-able properties where the real,
// compiled module's ESM-interop getters would refuse `jest.spyOn`.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const reanimatedMock: typeof import('react-native-reanimated') = require('react-native-reanimated');

beforeEach(() => {
  mockedTriggerHaptic.mockClear();
  // this row's own result now comes from `../../adapter/
  // use-equity-evaluation.ts` — reset it directly (bypassing the store's
  // own module-scope reaction entirely, since nothing here adds a player to
  // `usePlayersStore`) so a result set by one test never leaks into the
  // next. issue #103.
  useEquityEvaluationStore.setState({
    status: 'idle',
    progress: 0,
    results: {},
    impossibleSignal: 0,
  });
});

const HOLE_CARDS_HOLDING: Holding = {
  kind: 'holeCards',
  holeCards: { first: { rank: 'A', suit: 'h' }, second: { rank: 'T', suit: 'h' } },
};

const HAND_RANGE_HOLDING: Holding = { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) };

const HOLE_CARDS_PLAYER: Player = { id: 'player-1', number: 1, holding: HOLE_CARDS_HOLDING };
const HAND_RANGE_PLAYER: Player = { id: 'player-2', number: 2, holding: HAND_RANGE_HOLDING };

// `distribution` is present only because `EspadaEquityPlayerResult`
// requires it — this file's own tests read `win`/`tie`/`equity` off this
// fixture, never the distribution's own content, so an empty array stands
// in for it.
const RESULT: EspadaEquityPlayerResult = { win: 0.6, tie: 0.02, equity: 0.61, distribution: [] };

/** sets `player`'s own settled result directly on the store, the same way
 * a real settle would have — bypassing `startEquityJob` entirely, since
 * this row only ever reads the store, never drives it. */
function setResultFor(player: Player, result: EspadaEquityPlayerResult): void {
  useEquityEvaluationStore.setState((state) => ({
    status: 'calculated',
    results: { ...state.results, [player.id]: result },
  }));
}

async function renderRow(
  player: Player,
  onDelete: jest.Mock = jest.fn(),
  onEditRequested: jest.Mock = jest.fn(),
  onBreakdownRequested: jest.Mock = jest.fn(),
  onReorder: jest.Mock = jest.fn(),
  index = 0,
  rowCount = 2,
) {
  const view = await render(
    <GestureHandlerRootView>
      <PlayerRow
        player={player}
        index={index}
        rowCount={rowCount}
        onDelete={onDelete}
        onEditRequested={onEditRequested}
        onBreakdownRequested={onBreakdownRequested}
        onReorder={onReorder}
        testID="row"
      />
    </GestureHandlerRootView>,
  );
  // returned on top of the four callbacks every existing caller already
  // destructures — issue #163's own re-render test below is the one caller
  // that needs to hand this same tree a fresh set of props without
  // unmounting it first.
  return { onDelete, onEditRequested, onBreakdownRequested, onReorder, rerender: view.rerender };
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
  it("renders the player's own number as the label — never the holding's notation — and 'Hole cards' as the subtitle", async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('label').props.children).toBe('Player 1');
    expect(screen.getByTestId('subtitle').props.children).toBe('Hole cards');
  });

  it('renders no result figure and no chevron column at all while no result is available — the "no result" presentation (issue #103)', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.queryByTestId('result')).toBeNull();
    expect(screen.queryByTestId('chevron-column')).toBeNull();
  });

  it('renders its real result figure but no chevron, with the chevron column still reserved, once a result is available', async () => {
    setResultFor(HOLE_CARDS_PLAYER, RESULT);

    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('result').props.children).toBe('61%');
    expect(screen.getByTestId('chevron-column').children).toHaveLength(0);
  });

  it('carries one accessibility label naming the player and describing the holding, with a "not yet available" result phrase while no result is available, and edit/delete accessibility actions — and is not a button', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    const content = screen.getByTestId('content');
    expect(content.props.accessibilityLabel).toBe(
      'Player 1: ace of hearts and ten of hearts. Result not yet available.',
    );
    expect(content.props.accessibilityRole).toBeUndefined();
    expect(content.props.accessibilityActions).toEqual([
      { name: 'edit', label: 'Edit player' },
      { name: 'delete', label: 'Delete player' },
    ]);
  });

  it('carries its real result in the accessibility label once a result is available', async () => {
    setResultFor(HOLE_CARDS_PLAYER, RESULT);

    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('content').props.accessibilityLabel).toBe(
      'Player 1: ace of hearts and ten of hearts. Result 61%.',
    );
  });

  it('does not fire onBreakdownRequested when the detail region is pressed, with or without a result', async () => {
    const { onBreakdownRequested } = await renderRow(HOLE_CARDS_PLAYER);
    await fireEvent.press(screen.getByTestId('detail'));
    expect(onBreakdownRequested).not.toHaveBeenCalled();
  });
});

describe('<PlayerRow /> — hand range', () => {
  it("renders the player's own number as the label — never 'Custom' — and the card-pair count as the subtitle", async () => {
    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.getByTestId('label').props.children).toBe('Player 2');
    // AA (6) + AKs (4) = 10 card pairs.
    expect(screen.getByTestId('subtitle').props.children).toBe('10 combos');
  });

  it('renders no result figure and no chevron column at all while no result is available — the "no result" presentation (issue #103), superseding the old holding-kind-only logic', async () => {
    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.queryByTestId('result')).toBeNull();
    expect(screen.queryByTestId('chevron-column')).toBeNull();
  });

  it('renders its real result figure and the trailing chevron once a result is available', async () => {
    setResultFor(HAND_RANGE_PLAYER, RESULT);

    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.getByTestId('result').props.children).toBe('61%');
    expect(screen.getByTestId('chevron-column').children).toHaveLength(1);
  });

  it('carries an accessibility label naming the player, the range, and its combo count, with a "not yet available" result phrase while no result is available, and still announces itself as a button', async () => {
    await renderRow(HAND_RANGE_PLAYER);

    const content = screen.getByTestId('content');
    expect(content.props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result not yet available. Opens equity breakdown.',
    );
    expect(content.props.accessibilityRole).toBe('button');
  });

  it('carries its real result in the accessibility label once a result is available', async () => {
    setResultFor(HAND_RANGE_PLAYER, RESULT);

    await renderRow(HAND_RANGE_PLAYER);

    expect(screen.getByTestId('content').props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result 61%. Opens equity breakdown.',
    );
  });

  it('does not fire onBreakdownRequested when the detail region is pressed while no result is available', async () => {
    const { onBreakdownRequested } = await renderRow(HAND_RANGE_PLAYER);

    await fireEvent.press(screen.getByTestId('detail'));

    expect(onBreakdownRequested).not.toHaveBeenCalled();
  });

  it('fires onBreakdownRequested with no argument and the primaryAction haptic when the detail region is pressed, once a result is available', async () => {
    setResultFor(HAND_RANGE_PLAYER, RESULT);
    const { onBreakdownRequested } = await renderRow(HAND_RANGE_PLAYER);

    await fireEvent.press(screen.getByTestId('detail'));

    expect(onBreakdownRequested).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  it('never fires onEditRequested when the detail region is pressed', async () => {
    const { onEditRequested } = await renderRow(HAND_RANGE_PLAYER);

    await fireEvent.press(screen.getByTestId('detail'));

    expect(onEditRequested).not.toHaveBeenCalled();
  });
});

describe('<PlayerRow /> editing', () => {
  it('fires onEditRequested and the primaryAction haptic when the preview is tapped', async () => {
    const { onEditRequested } = await renderRow(HOLE_CARDS_PLAYER);

    await fireEvent.press(screen.getByTestId('preview'));

    expect(onEditRequested).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.PrimaryAction);
  });

  it('is hidden from a screen reader — the row’s own edit accessibility action offers the same outcome', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    expect(screen.getByTestId('preview').props.accessible).toBe(false);
  });

  it('fires onEditRequested through the row’s own edit accessibility action, with no haptic of its own', async () => {
    const { onEditRequested } = await renderRow(HOLE_CARDS_PLAYER);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'edit' },
    });

    expect(onEditRequested).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });

  it('never fires onDelete when the preview is tapped, and never fires onEditRequested when the bin is tapped', async () => {
    const { onDelete, onEditRequested } = await renderRow(HOLE_CARDS_PLAYER);

    await fireEvent.press(screen.getByTestId('preview'));
    expect(onDelete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('bin'));
    expect(onEditRequested).toHaveBeenCalledTimes(1); // unchanged from the tap above
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
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-20);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it('rests revealed, without deleting, on a release past the reveal threshold but short of the commit threshold', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-150);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });

  it('commits the deletion, firing dragEnd, once carried past the commit threshold', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-300);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
  });
});

// covers the defect the maintainer's own on-device pass over PR #93 found:
// the row's own height collapse used to run on `motionSpringConfig` (a
// spring, tuned to overshoot slightly), which overshoots past its `0`
// target and rebounds to a visible height for one frame before settling —
// see `player-row.tsx`'s own doc comment. what a unit test *can* assert is
// that the collapse now reads a plain timing curve rather than a spring;
// what it *cannot* — since RNTL renders no layout engine and this
// project's Reanimated mock doesn't simulate real spring/timing physics at
// all (docs/conventions/testing.md) — is that the rebound itself no longer
// paints on a real device, which is a manual, on-device check.
describe('<PlayerRow /> the committed-delete height collapse', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collapses rowHeight through withTiming, against motionSizeTimingConfig — never a spring', async () => {
    const withTimingSpy = jest.spyOn(reanimatedMock, 'withTiming');
    const withSpringSpy = jest.spyOn(reanimatedMock, 'withSpring');
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-300);
    });

    expect(withTimingSpy).toHaveBeenCalledWith(0, motionSizeTimingConfig, expect.any(Function));
    // `translateX`'s own exit still reads a spring (`motionSpring`,
    // `COMMIT_EXIT_OFFSET`) — this only proves `rowHeight` itself never
    // does, not that nothing in this commit path calls `withSpring` at all.
    expect(withSpringSpy).not.toHaveBeenCalledWith(0, expect.anything(), expect.anything());
    expect(onDelete).toHaveBeenCalledTimes(1); // the mock invokes withTiming's own callback synchronously
  });
});

describe('<PlayerRow /> the revealed delete panel', () => {
  it('deletes the player when tapped', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

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
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockedTriggerHaptic).not.toHaveBeenCalled();
  });

  it('ignores any other action name', async () => {
    const { onDelete, onEditRequested } = await renderRow(HOLE_CARDS_PLAYER);

    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(onEditRequested).not.toHaveBeenCalled();
  });
});

/** a long-press-then-drag: `BEGAN` (the pickup), a first `ACTIVE` step with
 * no meaningful offset of its own, a second `ACTIVE` step carrying the
 * drag's own current `translationY`, then `END`. Two `ACTIVE` steps are
 * required, not one — `react-native-gesture-handler`'s own
 * `useAnimatedGesture` (`GestureDetector/useAnimatedGesture.ts`) only ever
 * calls `player-row.tsx`'s own `reorderPan.onUpdate` for an event with no
 * `oldState` field, i.e. one that does not itself carry a state
 * transition; the *first* `BEGAN`→`ACTIVE` transition is exactly a state
 * change (it is what calls `onStart` instead), so whatever `translationY`
 * rides on that first transition is silently dropped, never reaching
 * `onUpdate` at all. A second, same-state `ACTIVE`→`ACTIVE` step carries no
 * `oldState` (`jestUtils.ts`'s own `fillOldStateChanges`), so
 * `fireGestureHandler` dispatches it over the continuous
 * `'onGestureHandlerEvent'` channel instead of `'onGestureHandlerStateChange'`
 * — the one path this library actually routes to `onUpdate`. This is the
 * one respect in which this row's reorder gesture can't reuse `fireSwipe`
 * above's own two-event shape: that gesture's own `onEnd` computes its
 * outcome directly from the event's own final `translationX` rather than
 * from a value `onUpdate` accumulated, so it never needed a real `onUpdate`
 * call to begin with; `reorderPan`'s crossing detection lives in `onUpdate`
 * itself; `onEnd` only resets it. */
function fireReorderDrag(translationY: number) {
  fireGestureHandler(getByGestureTestId('reorder'), [
    { state: State.BEGAN, x: 0, y: 0 },
    { state: State.ACTIVE, translationY: 0 },
    { state: State.ACTIVE, translationY },
    { state: State.END, translationY },
  ]);
}

describe('<PlayerRow /> long-press-to-drag reorder', () => {
  it('fires dragStart once the long-press-then-pan gesture activates', async () => {
    await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireGestureHandler(getByGestureTestId('reorder'), [{ state: State.BEGAN, x: 0, y: 0 }]);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragStart);
  });

  it('fires dragEnd, and no reorder, for a drag that never crosses another row’s midpoint', async () => {
    const { onReorder } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireReorderDrag(ROW_HEIGHT / 2 - 10);
    });

    expect(mockedTriggerHaptic).toHaveBeenCalledWith(HapticEvent.DragEnd);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('reports the crossed index once the drag passes another row’s midpoint, downward', async () => {
    const { onReorder } = await renderRow(
      HOLE_CARDS_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      3,
    );

    act(() => {
      fireReorderDrag(ROW_HEIGHT / 2 + 10);
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(HOLE_CARDS_PLAYER.id, 1);
  });

  it('reports the crossed index once the drag passes another row’s midpoint, upward', async () => {
    const { onReorder } = await renderRow(
      HOLE_CARDS_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      1,
      3,
    );

    act(() => {
      fireReorderDrag(-(ROW_HEIGHT / 2 + 10));
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(HOLE_CARDS_PLAYER.id, 0);
  });

  it('clamps at the list top: the first row never reports an index above its own', async () => {
    const { onReorder } = await renderRow(
      HOLE_CARDS_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      3,
    );

    act(() => {
      fireReorderDrag(-(ROW_HEIGHT * 5));
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('clamps at the list bottom: the last row never reports an index past its own', async () => {
    const { onReorder } = await renderRow(
      HOLE_CARDS_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      2,
      3,
    );

    act(() => {
      fireReorderDrag(ROW_HEIGHT * 5);
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('is a no-op, reporting no reorder, when released back at its own starting position', async () => {
    const { onReorder } = await renderRow(
      HOLE_CARDS_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      3,
    );

    act(() => {
      fireGestureHandler(getByGestureTestId('reorder'), [
        { state: State.BEGAN, x: 0, y: 0 },
        // this first `ACTIVE` step is the pickup's own state transition,
        // not a live update — see `fireReorderDrag`'s own doc comment
        // above for why its `translationY` (here, the no-op default 0)
        // never reaches `onUpdate`. the two steps that follow are what
        // actually drive the crossing and the return.
        { state: State.ACTIVE, translationY: 0 },
        { state: State.ACTIVE, translationY: ROW_HEIGHT },
        { state: State.ACTIVE, translationY: 0 },
        { state: State.END, translationY: 0 },
      ]);
    });

    // crosses to index 1 and back to index 0 — two live calls, the second
    // of which undoes the first, exactly the no-op `movePlayer`'s own
    // same-index convention already resolves.
    expect(onReorder).toHaveBeenNthCalledWith(1, HOLE_CARDS_PLAYER.id, 1);
    expect(onReorder).toHaveBeenNthCalledWith(2, HOLE_CARDS_PLAYER.id, 0);
  });
});

describe('<PlayerRow /> the existing swipe-to-delete and tap-to-edit gestures, unchanged by the reorder gesture', () => {
  // a regression check per the plan's own Verification strategy: the new
  // long-press-then-pan gesture is composed with the existing swipe via
  // `Gesture.Exclusive`, and this row's tap-to-edit `Pressable` runs on an
  // entirely separate touch system (this component's own doc comment) —
  // both are already covered by the describe blocks above, which are
  // unchanged by this file's own reorder addition; this block exists so a
  // reader sees the regression was checked, not only that it happened to
  // still pass.
  it('still opens the edit sheet on a plain preview tap, with no long press held first', async () => {
    const { onEditRequested } = await renderRow(HOLE_CARDS_PLAYER);

    await fireEvent.press(screen.getByTestId('preview'));

    expect(onEditRequested).toHaveBeenCalledTimes(1);
  });

  it('still commits a delete on a quick horizontal swipe, with no long press held first', async () => {
    const { onDelete } = await renderRow(HOLE_CARDS_PLAYER);

    act(() => {
      fireSwipe(-300);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

// issue #163's own empirical proof: before this issue, `PlayerRow` itself
// read the live equity result and computed everything derived from it, so
// the whole row — the gesture-detecting `GestureDetector` included —
// re-rendered on every one of a player's own live equity-result updates.
// `GestureDetector`'s own re-sync effect depends on its entire incoming
// `props` object rather than on the gesture value's own identity
// (`react-native-gesture-handler`'s own `GestureDetector/
// useDetectorUpdater.ts`, confirmed against the installed 2.32.0 source),
// so that re-render pushed this row's gesture configuration to the native
// side every single time, regardless of whether the configuration itself
// had changed. `./player-row.tsx`'s own doc comment records the fuller
// reasoning; this is the check that actually proves the fix moved the
// subscription far enough to matter, not merely that the row's *own*
// render body got smaller.
describe('<PlayerRow /> native gesture re-sync (issue #163)', () => {
  // `updateHandlers.ts`'s own `_RNGestureHandlerModule.default.updateGestureHandler`
  // call is what actually pushes a gesture's configuration to the native
  // side — confirmed by reading `node_modules/react-native-gesture-handler/
  // lib/commonjs/handlers/gestures/GestureDetector/updateHandlers.js`
  // directly at the installed 2.32.0. `react-native-gesture-handler/
  // jestSetup` (imported at the top of this file) already replaces
  // `./lib/commonjs/RNGestureHandlerModule` — the exact specifier the
  // library's own compiled runtime code imports — with its own mock
  // (`./lib/commonjs/mocks/mocks`, `updateGestureHandler` a plain, spy-able
  // property there, not a getter). Requiring that same specifier here reaches
  // that same mocked module object, the same "reach the real module's own
  // spy-able properties through a plain `require()`, not the compiled
  // ESM-interop getters `jest.spyOn` would refuse" technique this file's own
  // `reanimatedMock` above already uses, and for the same reason.

  type GestureHandlerModuleMock = {
    default: { updateGestureHandler: (...args: unknown[]) => void };
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gestureHandlerModuleMock: GestureHandlerModuleMock = require('react-native-gesture-handler/lib/commonjs/RNGestureHandlerModule');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** `updateHandlers.js`'s own call to `updateGestureHandler` runs inside
   * `ghQueueMicrotask` (`setImmediate`, at this installed version — confirmed
   * by reading `ghQueueMicrotask.js` directly), not synchronously inside the
   * React effect that schedules it — so a call this test's own re-render
   * triggers (or, just as importantly, one it must prove never happens)
   * would still be sitting unflushed on the very next line without this:
   * every assertion below awaits this once, after the render/update that
   * might schedule a call, before reading the spy. */
  function flushGestureSync(): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(resolve);
    });
  }

  it('does not re-sync the gesture configuration to the native side when a row re-renders solely because its own live equity result updated', async () => {
    const updateGestureHandlerSpy = jest.spyOn(
      gestureHandlerModuleMock.default,
      'updateGestureHandler',
    );
    await renderRow(HAND_RANGE_PLAYER, undefined, undefined, undefined, undefined, 0, 3);
    await act(() => flushGestureSync()); // flushes the initial mount's own sync
    // the initial mount's own sync is expected and irrelevant here — only
    // what happens *after* the equity-result update below is this test's
    // own subject.
    updateGestureHandlerSpy.mockClear();

    await act(async () => {
      setResultFor(HAND_RANGE_PLAYER, RESULT);
      await flushGestureSync();
    });

    // confirms the update actually reached this row — this test would pass
    // vacuously against a row that silently stopped reflecting live
    // updates at all, which is exactly the failure mode the companion
    // "still re-syncs" test below, and the live-update test further below,
    // both exist to rule out.
    expect(screen.getByTestId('result').props.children).toBe('61%');
    expect(updateGestureHandlerSpy).not.toHaveBeenCalled();
  });

  it('still re-syncs the gesture configuration to the native side when a gesture-relevant prop actually changes', async () => {
    const updateGestureHandlerSpy = jest.spyOn(
      gestureHandlerModuleMock.default,
      'updateGestureHandler',
    );
    const { rerender } = await renderRow(
      HAND_RANGE_PLAYER,
      undefined,
      undefined,
      undefined,
      undefined,
      0,
      3,
    );
    await act(() => flushGestureSync()); // flushes the initial mount's own sync
    updateGestureHandlerSpy.mockClear();

    // `index` is what `reorderPan`'s own clamp/crossing math closes over
    // (`player-row.tsx`'s own doc comment) — changing it, with nothing about
    // the live equity result touched, is this test's own stand-in for "the
    // row's own identity, position, reduced-motion setting, or its
    // reorder/delete/edit/detail actions actually changed," the plan's own
    // acceptance criterion for when a re-sync must still happen.
    await act(async () => {
      await rerender(
        <GestureHandlerRootView>
          <PlayerRow
            player={HAND_RANGE_PLAYER}
            index={1}
            rowCount={3}
            onDelete={jest.fn()}
            onEditRequested={jest.fn()}
            onBreakdownRequested={jest.fn()}
            onReorder={jest.fn()}
            testID="row"
          />
        </GestureHandlerRootView>,
      );
      await flushGestureSync();
    });

    expect(updateGestureHandlerSpy).toHaveBeenCalled();
  });
});

describe('<PlayerRow /> the result figure, chevron, and accessibility label update live (issue #163 regression check)', () => {
  // every other test in this file that exercises a result sets it *before*
  // the row ever mounts (`setResultFor` before `renderRow`) — this is the
  // one case that updates the store *after* mount, the exact path issue
  // #163's own restructuring had to keep working: `PlayerRowLiveContent`,
  // not `PlayerRow` itself, is what actually subscribes now, and this is
  // what proves that subscription still re-renders on its own.
  it('reflects a live equity-result update that arrives after the row has already mounted with no result', async () => {
    await renderRow(HAND_RANGE_PLAYER, undefined, undefined, undefined, undefined, 0, 3);

    expect(screen.queryByTestId('result')).toBeNull();
    expect(screen.queryByTestId('chevron-column')).toBeNull();

    act(() => {
      setResultFor(HAND_RANGE_PLAYER, RESULT);
    });

    expect(screen.getByTestId('result').props.children).toBe('61%');
    expect(screen.getByTestId('chevron-column').children).toHaveLength(1);
    expect(screen.getByTestId('content').props.accessibilityLabel).toBe(
      'Player 2: custom hand range, 10 combos. Result 61%. Opens equity breakdown.',
    );
  });
});
