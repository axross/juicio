import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NavBar } from '@/core/navigation/nav-bar';
import { BoardInputSheet } from '@/features/evaluations/ui/board-input-sheet/board-input-sheet';
import { HoldingInputSheet } from '@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

import {
  addPlayer,
  removePlayer,
  replacePlayerHolding,
  usePlayers,
} from '../../adapter/use-players';
import { Board } from '../board/board';
import { PlayerList } from '../player-list/player-list';

/**
 * the Analyze tab's screen (issue #87). this phase is what finally reads
 * the card/range input sheet's own submitted `Holding` — every earlier
 * phase's board, empty state, and `Players` heading
 * (docs/specs/equity-analysis.md) stay exactly as they were; a populated
 * board and every non-empty state still belong to the equity engine this
 * change does not build. the design's Analyze nav bar draws a share icon;
 * this app's four nav bars are title-only by design
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
 * slot it opened on. a submitted `Board` is still dropped: there is no
 * board state and no equity engine to hand it to, and the board keeps
 * showing five empty slots either way. that is PR #96's own scope, not a
 * gap this change introduces — the players list below is the only thing
 * issue #87 makes a submitted value survive.
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
 * **lives under `features/evaluations/ui/` rather than in the `(tabs)/index.tsx`
 * route module itself** (PR #93): `src/app/(tabs)/index.tsx` composes
 * this component and nothing else. Route modules load lazily through
 * `require.context`, which sweeps every file under `src/app/` — including
 * a colocated `.test.tsx` — into whatever bundle Metro produces, release
 * bundles included; a test file sitting there once dragged
 * `@testing-library/react-native` into a release build and broke it. This
 * screen, and its own colocated test, live here instead, where nothing
 * `require.context` ever walks.
 */
export function AnalyzeScreen() {
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
  const players = usePlayers();
  const editingPlayer = players.find((player) => player.id === editingPlayerId) ?? null;

  function openSheetForNewPlayer() {
    setEditingPlayerId(null);
    setSheetVisible(true);
  }

  return (
    <View style={styles.screen} testID="analyze-screen">
      <NavBar title={tNav('analyzeTab')} suppressShadow testID="analyze-nav-bar" />
      <Board onEditRequest={setBoardSheetSlot} testID="analyze-board" />
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
            testID="analyze-player-list"
          />
        )}
      </ScrollView>
      <HoldingInputSheet
        visible={sheetVisible}
        initialHolding={editingPlayer?.holding}
        onSubmit={(holding) => {
          if (editingPlayerId !== null) {
            replacePlayerHolding(editingPlayerId, holding);
          } else {
            addPlayer(holding);
          }
          setSheetVisible(false);
          setEditingPlayerId(null);
        }}
        onDismiss={() => {
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
        // the submitted board has nowhere to go yet — see this
        // component's own doc comment above.
        onSubmit={() => setBoardSheetSlot(null)}
        onDismiss={() => setBoardSheetSlot(null)}
        testID="analyze-board-input-sheet"
      />
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
