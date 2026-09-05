// registers this project's real themes/i18n resources — see
// `../history-entry-row/history-entry-row.test.tsx`'s own matching
// comment.
import '@/core/theme/unistyles';
import '@/core/i18n';
import 'react-native-gesture-handler/jestSetup';

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { sql } from 'drizzle-orm';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { db } from '@/core/db/client';
import { historyEntries } from '@/core/db/schema';
import type { Card } from '@/shared/model/card';

import { listHistoryEntries, saveHistoryEntry } from '../../adapter/history-entries-store';
import type { HistoryEntryPlayer } from '../../model/history-entry';
import { HistoryScreen } from './history-screen';

// mirrors `../history-entry-row/history-entry-row.test.tsx`'s own identical
// mocks and their own doc comments.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@/core/haptics/haptics');
jest.mock('@/core/instrumentation/report-error', () => ({ reportError: jest.fn() }));

// `db` here is the in-memory client from `__mocks__/client.ts`, per
// docs/conventions/testing.md's "Database-Backed Tests" section — every
// fixture below is seeded through `saveHistoryEntry` (this feature's own
// shipped write path) or a raw `db.run`, never through this screen's own
// code path.

afterEach(() => {
  db.delete(historyEntries).run();
});

const ACE_SPADES: Card = { rank: 'A', suit: 's' };
const TEN_SPADES: Card = { rank: 'T', suit: 's' };
const FOUR_CLUBS: Card = { rank: '4', suit: 'c' };

const HOLE_CARDS_PLAYER: HistoryEntryPlayer = {
  holding: { kind: 'holeCards', holeCards: { first: ACE_SPADES, second: TEN_SPADES } },
  result: { win: 0.6, tie: 0.02, equity: 0.61 },
  name: 'Player 1',
};

const HAND_RANGE_PLAYER: HistoryEntryPlayer = {
  holding: { kind: 'handRange', rankPairs: new Set(['AA', 'AKs']) },
  result: { win: 0.55, tie: 0.02, equity: 0.56 },
  name: 'Player 2',
};

async function renderScreen() {
  await render(
    <GestureHandlerRootView>
      <HistoryScreen />
    </GestureHandlerRootView>,
  );
}

/** saves `player`'s own entry and reads back its store-assigned id
 * immediately — a fixture helper, not this screen's own code path — so a
 * test can address one particular row by its own real, globally unique
 * `history-entry-row-<id>` testID instead of guessing at the render tree's
 * shape. */
function saveAndFindId(
  calculatedAt: number,
  board: readonly Card[],
  player: HistoryEntryPlayer,
): string {
  saveHistoryEntry({ calculatedAt, board, players: [player] });
  const [saved] = listHistoryEntries().filter((entry) => entry.calculatedAt === calculatedAt);
  return saved.id;
}

describe('<HistoryScreen /> empty fallback', () => {
  it('shows the empty state with nothing saved', async () => {
    await renderScreen();

    expect(screen.getByTestId('history-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('history-groups')).toBeNull();
  });

  it('shows the empty state when the underlying read fails outright', async () => {
    db.run(
      sql`insert into history_entries (calculated_at, board, players) values (1000, '[]', 'not json')`,
    );

    await renderScreen();

    expect(screen.getByTestId('history-empty-state')).toBeTruthy();
  });

  it('falls back to the empty state once the only remaining entry is deleted', async () => {
    const id = saveAndFindId(Date.now(), [], HOLE_CARDS_PLAYER);
    await renderScreen();
    expect(screen.queryByTestId('history-empty-state')).toBeNull();
    const row = screen.getByTestId(`history-entry-row-${id}`);

    await fireEvent.press(within(row).getByTestId('bin'));

    expect(screen.getByTestId('history-empty-state')).toBeTruthy();
    expect(screen.queryByTestId('history-groups')).toBeNull();
  });
});

describe('<HistoryScreen /> grouping and row rendering', () => {
  it('groups saved entries by calculation date and then by board, including a no-board entry, and renders each row', async () => {
    const now = Date.now();
    const boardA: readonly Card[] = [ACE_SPADES, TEN_SPADES, FOUR_CLUBS];

    saveHistoryEntry({ calculatedAt: now, board: boardA, players: [HOLE_CARDS_PLAYER] });
    saveHistoryEntry({ calculatedAt: now - 1000, board: [], players: [HAND_RANGE_PLAYER] });

    await renderScreen();

    expect(screen.getByTestId('history-groups')).toBeTruthy();
    // the populated board group's own row.
    expect(screen.getByText('Player 1')).toBeTruthy();
    expect(screen.getByText('Hole cards')).toBeTruthy();
    // the no-board group's own row, grouped and rendered the same way.
    expect(screen.getByText('Player 2')).toBeTruthy();
    expect(screen.getByText('10 combos')).toBeTruthy();
  });

  it("deletes only the swiped row's own entry, leaving the other saved entry and its group visible", async () => {
    const idToDelete = saveAndFindId(Date.now(), [], HOLE_CARDS_PLAYER);
    saveHistoryEntry({ calculatedAt: Date.now() - 1000, board: [], players: [HAND_RANGE_PLAYER] });
    await renderScreen();
    const row = screen.getByTestId(`history-entry-row-${idToDelete}`);

    await fireEvent.press(within(row).getByTestId('bin'));

    expect(screen.queryByText('Player 1')).toBeNull();
    expect(screen.getByText('Player 2')).toBeTruthy();
    expect(screen.queryByTestId('history-empty-state')).toBeNull();
  });
});

// proves this screen wires its own scroll offset into NavBar
// (`scrollOffset={scrollOffset}`, `./history-screen.tsx`) — mirrors
// `../../../evaluations/ui/analyze-screen/analyze-screen.test.tsx`'s own
// identically-shaped test.
describe('<HistoryScreen /> nav bar scroll wiring (issue #260)', () => {
  it('wires its own scroll offset into NavBar, mounting the scroll-linked blur overlay', async () => {
    await renderScreen();

    const navBar = within(screen.getByTestId('history-nav-bar'));
    expect(navBar.getByTestId('nav-bar-blur')).toBeTruthy();
    expect(navBar.getByTestId('nav-bar-scroll-tint')).toBeTruthy();
  });
});

// proves docs/conventions/component-styling.md's root-style merge rule is
// real for `HistoryScreen`'s own root `View`, not merely type-level — mirrors
// `../../../evaluations/ui/analyze-screen/analyze-screen.test.tsx`'s own
// identically-shaped test for its own precedent case.
describe('<HistoryScreen /> style', () => {
  it('merges a caller-supplied style onto its own root style rather than replacing it', async () => {
    await render(
      <GestureHandlerRootView>
        <HistoryScreen style={{ marginTop: 10 }} />
      </GestureHandlerRootView>,
    );

    const root = screen.getByTestId('history-screen');
    const flattenedStyle = Array.isArray(root.props.style)
      ? Object.assign({}, ...root.props.style.flat(Infinity).filter(Boolean))
      : root.props.style;

    // the caller's `marginTop` survived...
    expect(flattenedStyle).toMatchObject({ marginTop: 10 });
    // ...alongside this screen's own `flex: 1`, which a caller replacing
    // rather than extending the style would have wiped.
    expect(flattenedStyle).toHaveProperty('flex', 1);
  });
});
