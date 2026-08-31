// registers this project's real themes and namespaces — see
// `../../../hand-ranges/ui/holding-input-sheet/holding-input-sheet.test.tsx`
// for why this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`.
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { PortalHost } from '@/shared/ui/portal/portal';

import { usePlayersStore } from '../../adapter/use-players';
import { AnalyzeScreen } from './analyze-screen';

// this screen's own `HoldingInputSheet` composes `BottomSheet`, and its
// `PlayerList` composes `PlayerRow` — both reach into
// `react-native-worklets`' native module on import, and drive real
// `withSpring` calls this screen's own tests never wait multiple frames
// for — see `../../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
// matching comment on why both mocks below are needed together.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// the players store is a module-level singleton (`use-players.ts`), so a
// player added in one test would otherwise leak into the next — the same
// reset `settings-screen.test.tsx` does for its own theme-preference store.
afterEach(() => {
  usePlayersStore.setState({ players: [] });
});

async function renderScreen() {
  await render(
    <GestureHandlerRootView>
      <PortalHost>
        <AnalyzeScreen />
      </PortalHost>
    </GestureHandlerRootView>,
  );
}

/**
 * commits the sheet's own close (submit or dismiss, whichever
 * `resolveHoldingOutcome` decides) via a tap on the backdrop — a plain
 * `Pressable`, unlike the handle (a `GestureDetector`, which
 * `fireEvent.press` cannot drive at all). Mirrors `../../../hand-ranges/ui/
 * holding-input-sheet/holding-input-sheet.test.tsx`'s own `closeSheet`
 * exactly; `includeHiddenElements` is needed because the backdrop's own
 * opacity is driven by a Reanimated shared value RNTL cannot see through
 * to decide visibility from.
 */
async function closeSheet() {
  await fireEvent.press(screen.getByTestId('backdrop', { includeHiddenElements: true }));
}

describe('<AnalyzeScreen /> with no players', () => {
  it('renders the shipped empty state, with no player list', async () => {
    await renderScreen();

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});

describe('<AnalyzeScreen /> submitting a hand range from the empty state', () => {
  it('replaces the empty state with the player list, showing the submitted range', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();

    expect(screen.queryByTestId('analyze-empty-state')).toBeNull();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();
  });
});

describe('<AnalyzeScreen /> editing a player by tapping its row preview', () => {
  // deliberately never asserts against `player-row-<id>`'s own literal id
  // string, unlike this file's other describes: `../../model/player.ts`'s
  // own id counter is module-scope and persists across every test in this
  // file (`usePlayersStore`'s own `afterEach` reset below only clears the
  // *list*, not that counter), so the first player this describe's own
  // tests add is `player-1` only when run alone — `Player {{number}}`'s own
  // number, derived fresh from the (reset) list each time, is what stays
  // deterministic instead.

  it("reopens the sheet seeded with that player's own current holding, and replaces its holding in place on submit", async () => {
    await renderScreen();

    // add one player through the empty state, same sequence the
    // submission test above already exercises.
    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    expect(within(list).getByText('Player 1')).toBeTruthy();

    // the sheet is gone until the preview is tapped.
    expect(screen.queryByTestId('hand-range-pane')).toBeNull();

    await fireEvent.press(screen.getByTestId('preview'));

    // reopened already on the Hand Range tab, seeded from this player's
    // own current holding — `useHoldingInput`'s own re-seed-on-reopen
    // effect, fed by `initialHolding` now that this screen supplies it.
    expect(screen.getByTestId('hand-range-pane')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();

    // still exactly one player, still numbered 1 — an edit substitutes the
    // holding in place, it never appends a second player.
    expect(within(list).queryByText('Player 2')).toBeNull();
    expect(within(list).getByText('Player 1')).toBeTruthy();
  });

  it('leaves the player untouched when the edit is dismissed without confirming', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');
    // globally, not scoped through a row's own id — exactly one player
    // row exists at this point, so `subtitle`'s own fixed, non-prefixed
    // testID (this component's own convention for a non-root child, see
    // `../player-row/player-row.tsx`) is already unique.
    const beforeSubtitle = screen.getByTestId('subtitle').props.children;

    await fireEvent.press(screen.getByTestId('preview'));
    // switches to the sheet's other tab, which reseeded empty (this player
    // is a hand-range player) — closing from here is a genuine dismiss
    // (`resolveHoldingOutcome`'s own `incomplete-hole-cards` reason: the
    // Hand Range tab's own seeded selection is still non-empty, so this is
    // not the `nothing-selected` reason a truly blank sheet would dismiss
    // with), not a resubmission of the unchanged selection closing straight
    // from the Hand Range tab would be.
    await fireEvent.press(screen.getByTestId('tab-cards'));
    await closeSheet();

    expect(within(list).queryByText('Player 2')).toBeNull();
    const afterSubtitle = screen.getByTestId('subtitle').props.children;
    expect(afterSubtitle).toBe(beforeSubtitle);
  });

  it("opens a blank sheet for a fresh player, not the previously edited player's holding, once New Player is pressed afterward", async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    const list = screen.getByTestId('analyze-player-list');

    await fireEvent.press(screen.getByTestId('preview'));
    await fireEvent.press(screen.getByTestId('tab-cards'));
    await closeSheet(); // a genuine dismiss — see the test above

    await fireEvent.press(screen.getByTestId('new-player-row'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-A2s+'));
    await closeSheet();

    // a second, brand new player — numbered 2, not a second edit of player 1.
    expect(within(list).getByText('Player 2')).toBeTruthy();
  });
});

describe('<AnalyzeScreen /> dismissing the sheet without submitting', () => {
  it('adds no player and keeps the empty state', async () => {
    await renderScreen();

    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await closeSheet();

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});

describe('<AnalyzeScreen /> deleting the last player', () => {
  it('returns to the empty state', async () => {
    await renderScreen();

    // add a player through the empty state's own button — see this
    // test's own submission test above for the full sheet flow this one
    // composes with the deletion below.
    await fireEvent.press(screen.getByTestId('analyze-empty-new-player-button'));
    await fireEvent.press(screen.getByTestId('tab-handRange'));
    await fireEvent.press(screen.getByTestId('chip-55+'));
    await closeSheet();
    expect(screen.getByTestId('analyze-player-list')).toBeTruthy();

    // deletes without the gesture, through the row's own accessibility
    // action — see `player-row/player-row.test.tsx` for the swipe itself.
    fireEvent(screen.getByTestId('content'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });

    expect(screen.getByTestId('analyze-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('analyze-player-list')).toBeNull();
  });
});
