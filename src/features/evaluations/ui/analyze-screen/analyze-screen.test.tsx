// registers this project's real themes and namespaces — see
// `../../hand-ranges/ui/holding-input-sheet/holding-input-sheet.test.tsx`
// for why this side-effect import must run before anything themed renders.
import '@/core/theme/unistyles';
import '@/core/i18n';
// `react-native-gesture-handler`'s own Jest mock — see
// `../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`.
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
// for — see `../../../shared/ui/bottom-sheet/bottom-sheet.test.tsx`'s own
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
 * `fireEvent.press` cannot drive at all). Mirrors `../../hand-ranges/ui/
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
    expect(within(list).getByText('Custom')).toBeTruthy();
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
