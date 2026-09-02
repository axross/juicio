import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { BoardInputSheet } from '@/features/evaluations/ui/board-input-sheet/board-input-sheet';
import { HoldingDismissReason } from '@/features/hand-ranges/model/holding';
import { HoldingInputSheet } from '@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

import { setBoard, useBoard } from '../../adapter/use-board';
import {
  addPlayer,
  removePlayer,
  replacePlayerHolding,
  usePlayers,
} from '../../adapter/use-players';
import { BoardDismissReason } from '../../model/board';
import { unavailableCardsForBoard, unavailableCardsForPlayer } from '../../model/unavailable-cards';
import { Board } from '../board/board';
import { EquityBreakdownSheet } from '../equity-breakdown-sheet/equity-breakdown-sheet';
import { PlayerList } from '../player-list/player-list';
import { Toast } from '../toast/toast';

/**
 * the Analyze tab's screen (issue #87). this phase is what finally reads
 * the card/range input sheet's own submitted `Holding` — every earlier
 * phase's empty state and `Players` heading (docs/specs/equity-analysis.md)
 * stay exactly as they were; every non-empty state still belongs to the
 * equity engine this change does not build. the design's Analyze nav bar
 * draws a share icon; this app's four nav bars are title-only by design
 * (docs/specs/navigation.md), so it is deliberately not rendered here.
 *
 * the nav bar and the board share one background and one `Sheet` shadow:
 * `NavBar`'s own shadow is suppressed here, and the board draws it
 * instead, at its own bottom edge, so the two read as one unbroken top
 * band — the design's own presentation, option A of the exhibit at issue
 * #64. the board is rendered outside the `ScrollView` below, so it stays
 * pinned above the players list rather than scrolling away with it — and
 * stays untouched by *this* issue's own scope: it keeps its five slots
 * regardless of how many players the list below holds, per issue #87.
 *
 * **pressing a board slot opens the board input sheet** (PR #96, merged
 * into this branch from the default branch), tracked by one local
 * `boardSheetSlot` — the slot pressed, or `null` for a closed sheet, so
 * one piece of state carries both whether that sheet is open and which
 * slot it opened on. **the submitted `Board` now reaches `../../adapter/
 * use-board.ts`'s own `setBoard`** (issue #99), rather than being dropped:
 * `useBoard()` below is this screen's own read of that store, handed to
 * `Board`'s own `cards` prop and to `BoardInputSheet`'s own `initialBoard`,
 * so the row renders whatever the sheet last submitted and reopening it
 * shows those same cards in its own preview slots. `onSubmit`'s own reason
 * for not needing a branch the way the holding sheet's `onSubmit` does —
 * there is only one board, never an "adding" versus "editing" distinction
 * — is `resolveBoardOutcome`'s own rule (`../../model/board.ts`): every
 * submit, empty board included, is one call to `setBoard` with whatever it
 * resolved to.
 *
 * `NativeJobDemo`, which used to render beneath this screen's empty state,
 * moved to the Presets tab with an earlier change: it needed the space the
 * design's top-aligned layout now claims, and was never part of this
 * screen's own design to begin with.
 *
 * **the sheet's submitted `Holding` now reaches `../../adapter/
 * use-players.ts`'s `addPlayer`, rather than being dropped.** With zero
 * players the shipped empty state renders unchanged, its own `+ New
 * Player` button opening the sheet; with one or more, `PlayerList` renders
 * instead, its own trailing `New Player` row opening the identical sheet
 * — both call the same `setSheetVisible(true)`, so this screen owns
 * exactly one sheet-visibility flag regardless of which affordance opened
 * it. `onDismiss` still needs nothing from its own reason: a dismissal
 * without submitting adds no player, the same as before this phase.
 *
 * **one sheet now serves both adding and editing** (the maintainer's own
 * on-device pass over PR #93): `editingPlayerId` tracks which player, if
 * any, the sheet is currently editing rather than adding a fresh one for.
 * `PlayerList`'s own `onEditPlayer` — fired from a row's preview tap —
 * sets it and opens the sheet with `initialHolding` seeded from that
 * player's current holding; `HoldingInputSheet` already reseeds its own
 * state from `initialHolding` on every hidden-to-visible transition (its
 * own `useHoldingInput`), so this screen only has to supply the right
 * value, not repeat that reseeding itself. `onSubmit` branches on
 * `editingPlayerId`: `null` still calls `addPlayer` (a brand new player,
 * appended); non-`null` calls `replacePlayerHolding` instead, substituting
 * that one player's holding in place — its own `id`, `number`, and
 * position in the list all stay exactly where they were (see
 * `../../model/player.ts`'s own doc comment on `replacePlayerHolding`).
 * both the empty state's button and `PlayerList`'s own `New Player` row
 * reset `editingPlayerId` to `null` before opening the sheet, so a session
 * that edits a player and then adds a fresh one never carries the earlier
 * edit's target forward. `onDismiss` clears it too, without touching any
 * player — dismissing an edit leaves that player's holding exactly as it
 * was, the same "a dismissal changes nothing" rule this screen already
 * held for adding.
 *
 * **this screen is also where both sheets' own `unavailableCards` are
 * computed** (issue #99): `boardUnavailableCards` and
 * `playerUnavailableCards` below, each a `useMemo` over `board` and
 * `players` — the board and players stores this screen already reads —
 * plus, for the player set, `editingPlayerId`, so the sheet's own edited
 * player's two cards are never in its own unavailable list (`../../model/
 * unavailable-cards.ts`'s own doc comment on why neither sheet excludes
 * the cards it is itself editing). the board's own set has no such
 * exclusion to make: it depends only on `players`, since the board's own
 * current cards were never a player's cards to begin with.
 *
 * **and where the toast (`../toast/toast.tsx`) gets its message** (issue
 * #99): `toastMessage` above is one string-or-`null` slot, raised from
 * each sheet's own `onDismiss` for exactly one of its reasons —
 * `BoardDismissReason.IncompleteBoard`, and `HoldingDismissReason.
 * IncompleteHoleCards` (naming adding versus editing off `editingPlayerId`,
 * read *before* `onDismiss` clears it). `HoldingDismissReason.
 * NothingSelected` and `.EmptyHandRange` raise nothing at all — see
 * docs/decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md
 * for why. Neither sheet's own submit path ever sets it: a submitted board
 * or holding is exactly the case with nothing to report.
 *
 * **lives under `features/evaluations/ui/` rather than in the `(tabs)/index.tsx`
 * route module itself** (PR #93): `src/app/(tabs)/index.tsx` composes
 * this component and nothing else. Route modules load lazily through
 * `require.context`, which sweeps every file under `src/app/` — including
 * a colocated `.test.tsx` — into whatever bundle Metro produces, release
 * bundles included; a test file sitting there once dragged
 * `@testing-library/react-native` into a release build and broke it. This
 * screen, and its own colocated test, live here instead, where nothing
 * `require.context` ever walks.
 *
 * **a hand-range row's own detail press opens the Equity Breakdown sheet**
 * (issue #102), tracked by `breakdownPlayerId` — the id of the player it
 * is open for, or `null` for closed, the same "one flag is both open/closed
 * and which row opened it" shape `boardSheetSlot` above already carries.
 * `../player-list/player-list.tsx`'s own `onBreakdownRequested` sets it
 * directly, with no `editingPlayerId`-style branch to make: this sheet
 * never edits a player and has nothing to submit, so there is no "adding
 * versus editing" distinction for it to track. `breakdownPlayer` is looked
 * up against the live `players` list the same way `editingPlayer` is,
 * rather than snapshotted, so a player deleted while this sheet somehow
 * stays open never leaves it showing a stale row — `../equity-breakdown-
 * sheet/equity-breakdown-sheet.tsx`'s own `player: Player | null` prop
 * exists for exactly that closed/no-match case.
 */
export function AnalyzeScreen({ style, ...props }: ComponentProps<typeof View>) {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('analyze');

  const [sheetVisible, setSheetVisible] = useState(false);
  // `null` while the sheet is adding a fresh player; the id of the player
  // currently being edited otherwise — see this component's own doc
  // comment. looked up against the live `players` list on every render
  // rather than held as a snapshot, so `initialHolding` below still reads
  // that player's *current* holding even if it somehow changed while the
  // sheet was open.
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  // the board slot whose own sheet is open, or `null` for a closed one —
  // PR #96's own state, kept exactly as it landed on the default branch;
  // it shares nothing with the holding sheet's own two pieces of state
  // above, and the two sheets are never open at once because only one
  // affordance can be pressed at a time.
  const [boardSheetSlot, setBoardSheetSlot] = useState<number | null>(null);
  // the id of the player the Equity Breakdown sheet is currently open for,
  // or `null` for a closed one (issue #102) — the same "one piece of
  // state carries both whether the sheet is open and which row opened it"
  // shape `boardSheetSlot` above already carries for the board sheet.
  // looked up against the live `players` list on every render, not held
  // as a snapshot, the same reason `editingPlayer` above is: a player
  // deleted while this sheet is somehow still open must not leave this
  // sheet showing a stale row.
  const [breakdownPlayerId, setBreakdownPlayerId] = useState<string | null>(null);
  // the toast's own message, or `null` for no toast at all — one slot, not
  // a queue, which is what gives `../toast/toast.tsx` its "one at a time"
  // and "a later message replaces the one showing" behaviour for free (see
  // that component's own doc comment). Raised from exactly two of the two
  // sheets' four possible dismissal reasons combined
  // (`BoardDismissReason.IncompleteBoard`,
  // `HoldingDismissReason.IncompleteHoleCards`) — `NothingSelected` and
  // `EmptyHandRange` raise nothing, the maintainer's own decision recorded
  // in docs/decisions/ (issue #99).
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const players = usePlayers();
  const board = useBoard();
  const editingPlayer = players.find((player) => player.id === editingPlayerId) ?? null;
  const breakdownPlayer = players.find((player) => player.id === breakdownPlayerId) ?? null;

  // both unavailable sets — see this component's own doc comment above.
  // the board's own never exceeds twelve cards (six players' two each),
  // the player's own never exceeds seventeen (those twelve plus the
  // board's own five) — docs/conventions/design-system.md's own
  // non-functional performance requirement.
  const boardUnavailableCards = useMemo(() => unavailableCardsForBoard(players), [players]);
  const playerUnavailableCards = useMemo(
    () => unavailableCardsForPlayer(board, players, editingPlayerId),
    [board, players, editingPlayerId],
  );

  function openSheetForNewPlayer() {
    setEditingPlayerId(null);
    setSheetVisible(true);
  }

  return (
    // `style` is pulled out of the rest spread and merged last via array
    // syntax, this screen's own `styles.screen` first, the caller's last,
    // so a caller extending it doesn't wipe the screen's `flex: 1`; every
    // other rest prop, this screen's own hardcoded `testID` default
    // included, spreads last (default ordering), letting a caller override
    // it.
    <View style={[styles.screen, style]} testID="analyze-screen" {...props}>
      <NavBar title={tNav('analyzeTab')} suppressShadow testID="analyze-nav-bar" />
      <Board cards={board} onEditRequest={setBoardSheetSlot} testID="analyze-board" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          style={styles.playersHeading}
          accessibilityRole="header"
          testID="analyze-players-heading"
        >
          {t('playersHeading')}
        </Text>
        {players.length === 0 ? (
          <EmptyState
            heading={t('emptyHeading')}
            description={t('emptyDescription')}
            action={{
              label: t('emptyButton'),
              onPress: openSheetForNewPlayer,
              testID: 'analyze-empty-new-player-button',
            }}
            testID="analyze-empty-state"
          />
        ) : (
          <PlayerList
            players={players}
            onDeletePlayer={removePlayer}
            onEditPlayer={(id) => {
              setEditingPlayerId(id);
              setSheetVisible(true);
            }}
            onNewPlayerRequested={openSheetForNewPlayer}
            onBreakdownRequested={setBreakdownPlayerId}
            testID="analyze-player-list"
          />
        )}
      </ScrollView>
      <HoldingInputSheet
        visible={sheetVisible}
        initialHolding={editingPlayer?.holding}
        unavailableCards={playerUnavailableCards}
        onSubmit={(holding) => {
          if (editingPlayerId !== null) {
            replacePlayerHolding(editingPlayerId, holding);
          } else {
            addPlayer(holding);
          }
          setSheetVisible(false);
          setEditingPlayerId(null);
        }}
        onDismiss={(reason) => {
          // `editingPlayerId` is read *before* it's cleared below, so the
          // message names adding versus reverting correctly — see
          // docs/decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md
          // for why only this one reason raises a toast at all:
          // `NothingSelected` and `EmptyHandRange` both close silently,
          // the maintainer's own call.
          if (reason === HoldingDismissReason.IncompleteHoleCards) {
            setToastMessage(
              editingPlayerId !== null
                ? t('toast.incompleteHoleCardsEditing')
                : t('toast.incompleteHoleCardsAdding'),
            );
          }
          setSheetVisible(false);
          setEditingPlayerId(null);
        }}
        testID="analyze-holding-input-sheet"
      />
      <BoardInputSheet
        visible={boardSheetSlot !== null}
        // `?? 0` only ever reads while the sheet is closed and the picker
        // is unmounted with it; whenever it is open, `boardSheetSlot` is
        // the slot actually pressed.
        focusedSlot={boardSheetSlot ?? 0}
        initialBoard={board}
        unavailableCards={boardUnavailableCards}
        onSubmit={(submittedBoard) => {
          setBoard(submittedBoard);
          setBoardSheetSlot(null);
        }}
        onDismiss={(reason) => {
          // `BoardDismissReason` has one member today, but this still
          // checks it explicitly rather than raising a toast for "any
          // dismiss" — see that enum's own doc comment
          // (`../../model/board.ts`) on why a second reason later must
          // not silently start raising this same toast.
          if (reason === BoardDismissReason.IncompleteBoard) {
            setToastMessage(t('toast.incompleteBoard'));
          }
          setBoardSheetSlot(null);
        }}
        testID="analyze-board-input-sheet"
      />
      <EquityBreakdownSheet
        visible={breakdownPlayerId !== null}
        player={breakdownPlayer}
        onRequestClose={() => setBreakdownPlayerId(null)}
        testID="analyze-equity-breakdown-sheet"
      />
      <Toast message={toastMessage} onClear={() => setToastMessage(null)} testID="analyze-toast" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background.neutral.app,
  },
  content: {
    paddingTop: theme.space.x32,
    paddingBottom: theme.space.x32,
  },
  playersHeading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
    paddingHorizontal: theme.space.x16,
    marginBottom: theme.space.x16,
  },
}));
