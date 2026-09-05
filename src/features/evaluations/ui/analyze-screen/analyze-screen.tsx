import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { trackEvent } from '@/core/instrumentation/analytics';
import { NavBar } from '@/core/navigation/nav-bar';
import { BoardInputSheet } from '@/features/evaluations/ui/board-input-sheet/board-input-sheet';
import { HoldingDismissReason } from '@/features/hand-ranges/model/holding';
import { HoldingInputSheet } from '@/features/hand-ranges/ui/holding-input-sheet/holding-input-sheet';
import { EmptyState } from '@/shared/ui/empty-state/empty-state';

import { setBoard, useBoard } from '../../adapter/use-board';
import {
  useEquityEvaluationStatus,
  useImpossibleSignal,
} from '../../adapter/use-equity-evaluation';
import {
  addPlayer,
  removePlayer,
  replacePlayerHolding,
  usePlayers,
} from '../../adapter/use-players';
import { BoardDismissReason } from '../../model/board';
import { MAX_PLAYERS } from '../../model/player';
import { unavailableCardsForBoard, unavailableCardsForPlayer } from '../../model/unavailable-cards';
import { Board } from '../board/board';
import { EquityBreakdownSheet } from '../equity-breakdown-sheet/equity-breakdown-sheet';
import { BAR_HEIGHT, EquityProgressBar } from '../equity-progress-bar/equity-progress-bar';
import { NewPlayerFab } from '../new-player-fab/new-player-fab';
import { PlayerList } from '../player-list/player-list';
import { Toast } from '../toast/toast';

/**
 * the Analyze tab's screen. this phase is what finally reads
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
 * band — the design's own presentation. the board is rendered outside the `ScrollView` below, so it stays
 * pinned above the players list rather than scrolling away with it: it
 * keeps its five slots regardless of how many players the list below holds.
 *
 * **pressing a board slot opens the board input sheet**, tracked by one local
 * `boardSheetSlot` — the slot pressed, or `null` for a closed sheet, so
 * one piece of state carries both whether that sheet is open and which
 * slot it opened on. **the submitted `Board` reaches `../../adapter/
 * use-board.ts`'s own `setBoard`**, rather than being dropped:
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
 * **the sheet's submitted `Holding` reaches `../../adapter/
 * use-players.ts`'s `addPlayer`, rather than being dropped.** With zero
 * players the shipped empty state renders unchanged; with one or more,
 * `PlayerList` renders instead. **One persistent
 * `NewPlayerFab` (`../new-player-fab/new-player-fab.tsx`) is this screen's
 * one add-player entry point**, rendered
 * below regardless of whether the empty state or the list is showing, and
 * hidden only once `players.length` reaches `MAX_PLAYERS`. Its own press
 * calls `openSheetForNewPlayer` below, which calls the same
 * `setSheetVisible(true)` every sheet-opening path here always has, so
 * this screen still owns exactly one sheet-visibility flag regardless of
 * which affordance opened it. `onDismiss` still needs nothing from its own
 * reason: a dismissal without submitting adds no player.
 *
 * **one sheet serves both adding and editing:** `editingPlayerId` tracks which player, if
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
 * `openSheetForNewPlayer` below — the FAB's own press handler — resets
 * `editingPlayerId` to `null` before opening the sheet, so a session that
 * edits a player and then adds a fresh one never carries the earlier
 * edit's target forward. `onDismiss` clears it too, without touching any
 * player — dismissing an edit leaves that player's holding exactly as it
 * was, the same "a dismissal changes nothing" rule this screen already
 * held for adding.
 *
 * **this screen is also where both sheets' own `unavailableCards` are
 * computed:** `boardUnavailableCards` and
 * `playerUnavailableCards` below, each a `useMemo` over `board` and
 * `players` — the board and players stores this screen already reads —
 * plus, for the player set, `editingPlayerId`, so the sheet's own edited
 * player's two cards are never in its own unavailable list (`../../model/
 * unavailable-cards.ts`'s own doc comment on why neither sheet excludes
 * the cards it is itself editing). the board's own set has no such
 * exclusion to make: it depends only on `players`, since the board's own
 * current cards were never a player's cards to begin with.
 *
 * **and where the toast (`../toast/toast.tsx`) gets its message:**
 * `toastMessage` above is one string-or-`null` slot, raised from
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
 * route module itself:** `src/app/(tabs)/index.tsx` composes
 * this component and nothing else. Route modules load lazily through
 * `require.context`, which sweeps every file under `src/app/` — including
 * a colocated `.test.tsx` — into whatever bundle Metro produces, release
 * bundles included, dragging `@testing-library/react-native` in with it.
 * This
 * screen, and its own colocated test, live here instead, where nothing
 * `require.context` ever walks.
 *
 * **a hand-range row's own detail press opens the Equity Breakdown sheet,**
 * tracked by `breakdownPlayerId` — the id of the player it
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
 *
 * **the "Calculating" progress bar and the impossible-situation toast:**
 * `../../adapter/use-equity-evaluation.ts` is the module-scope
 * store that owns the whole evaluation lifecycle — this screen reads only
 * its `status` and its `impossibleSignal` from it, it drives nothing.
 * `../equity-progress-bar/equity-progress-bar.tsx` renders directly beneath
 * `Board`, outside the `ScrollView` the same way `Board` itself is, and
 * only while `useEquityEvaluationStatus()` reads `'calculating'` — that
 * component holds no visibility logic of its own (see its own doc
 * comment). **this screen does not read the store's own `progress` at
 * all** — see
 * docs/decisions/2026-09-05-subscribe-equityprogressbar-directly-to-the-equity-store.md
 * for why: `EquityProgressBar`
 * subscribes to `progress` directly instead (see that component's own doc
 * comment), so this screen's own render body never runs on a
 * progress tick. The impossible-situation case (`useImpossibleSignal()` —
 * a monotonically-incrementing counter, not a boolean, precisely so a
 * *second* impossible situation in a row still raises a fresh toast) is
 * turned into the same `toastMessage` slot every other toast-raising path
 * above already shares, via a `useRef`-compared `useEffect` guarded to skip
 * the mount-time render — the store may already hold a nonzero count from
 * a previous screen's own session, and that past count must not raise a
 * toast the instant this screen mounts.
 *
 * **the progress bar's own space is reserved at all times** — see
 * docs/specs/equity-analysis.md's Screen States section for why (a
 * conditionally-mounted bar would shift the `ScrollView` right below
 * it — the "Players" heading and the players list it holds — every time a
 * calculation began or ended). `styles.equityProgressBarSlot` below is a
 * fixed-height
 * `View`, exactly `BAR_HEIGHT` tall, that is always rendered regardless of
 * `equityStatus`; only its contents — the bar's own track and fill — stay
 * conditional on `'calculating'`, drawn inside that always-present slot
 * rather than the slot itself appearing and disappearing. **Reserving that
 * slot alone would add `BAR_HEIGHT` of new, permanent space above
 * the "Players" heading in every non-calculating state** — so
 * `styles.content`'s own `paddingTop` below is reduced by that same
 * `BAR_HEIGHT`, netting out to the same total spacing
 * between the board and that heading in every state. Both computations share
 * `BAR_HEIGHT` as their one source of truth, so neither can drift from the
 * bar's own actual height.
 *
 * **this screen is also where drag-to-reorder's own two gating conditions
 * combine into one value:** `reorderingAllowed` below is
 * `true` exactly when more than one player is present and `equityStatus`
 * does not read `'calculating'` — with one player or fewer there is
 * nothing to reorder against, and while a calculation for the current
 * players is actively running, a fresh reorder would restart it. Passed
 * straight through to `PlayerList`, and from there to every row, alongside
 * each row's other props — this screen already reads both `players` and
 * `equityStatus` for its own empty-state branch and the progress bar
 * above, so it is where the two combine rather than either `PlayerList` or
 * `PlayerRow` reading `equityStatus` a second way. This value only narrows
 * when a *new* drag may start; a drag already under way keeps running even
 * if its own reordering flips `equityStatus` back to `'calculating'`
 * mid-drag — `../player-row/player-row.tsx`'s own doc comment on
 * `isPickedUp` covers that half.
 */
export function AnalyzeScreen({ style, ...props }: ComponentProps<typeof View>) {
  const { t: tNav } = useTranslation('navigation');
  const { t } = useTranslation('analyze');
  const { theme } = useUnistyles();
  // the iOS-only half of `fabBottom` below — see that constant's own
  // comment for why this screen needs it there and nowhere else.
  const insets = useSafeAreaInsets();

  const [sheetVisible, setSheetVisible] = useState(false);
  // `null` while the sheet is adding a fresh player; the id of the player
  // currently being edited otherwise — see this component's own doc
  // comment. looked up against the live `players` list on every render
  // rather than held as a snapshot, so `initialHolding` below still reads
  // that player's *current* holding even if it somehow changed while the
  // sheet was open.
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  // the board slot whose own sheet is open, or `null` for a closed one —
  // it shares nothing with the holding sheet's own two pieces of state
  // above, and the two sheets are never open at once because only one
  // affordance can be pressed at a time.
  const [boardSheetSlot, setBoardSheetSlot] = useState<number | null>(null);
  // the id of the player the Equity Breakdown sheet is currently open for,
  // or `null` for a closed one — the same "one piece of
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
  // `EmptyHandRange` raise nothing at all, see
  // docs/decisions/2026-08-31-toast-a-discarded-partial-input-not-a-clean-cancel.md
  // for why.
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const players = usePlayers();
  const board = useBoard();
  const editingPlayer = players.find((player) => player.id === editingPlayerId) ?? null;
  const breakdownPlayer = players.find((player) => player.id === breakdownPlayerId) ?? null;
  const equityStatus = useEquityEvaluationStatus();
  const impossibleSignal = useImpossibleSignal();
  // `undefined` on the first render only, so the effect below can tell
  // "the mount-time read" apart from a genuine increment — see this
  // component's own doc comment on why a count already nonzero at mount
  // must not raise a toast.
  const previousImpossibleSignal = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (
      previousImpossibleSignal.current !== undefined &&
      impossibleSignal !== previousImpossibleSignal.current
    ) {
      setToastMessage(t('toast.impossibleSituation'));
    }
    previousImpossibleSignal.current = impossibleSignal;
  }, [impossibleSignal, t]);

  // both unavailable sets — see this component's own doc comment above.
  // the board's own never exceeds six cards (three players' two each),
  // the player's own never exceeds eleven (those six plus the board's own
  // five) — docs/conventions/design-system.md's own non-functional
  // performance requirement.
  const boardUnavailableCards = useMemo(() => unavailableCardsForBoard(players), [players]);
  const playerUnavailableCards = useMemo(
    () => unavailableCardsForPlayer(board, players, editingPlayerId),
    [board, players, editingPlayerId],
  );

  // the drag-to-reorder gesture's own combined gating condition — see
  // this component's own doc comment above.
  const reorderingAllowed = players.length > 1 && equityStatus !== 'calculating';

  function openSheetForNewPlayer() {
    setEditingPlayerId(null);
    setSheetVisible(true);
  }

  // the FAB's own clearance above the tab bar. `theme.space.x24` alone
  // is correct only on Android: its `TabBar` is
  // still `expo-router`'s JS `Tabs` navigator, which lays this screen out
  // *above* the tab bar in one flex column, so this screen's own bottom
  // edge already coincides with the tab bar's own top edge, and 24 is the
  // plain clearance above it. iOS's `TabNavigator`
  // (`../../../../core/navigation/tab-navigator.ios.tsx`) is `NativeTabs`,
  // a real `UITabBarController`; read from `expo-router`'s own
  // `NativeTabsView.ios.js`, each of its screens mounts full-bleed *behind*
  // the tab bar rather than above it, so a flat 24 alone would leave the
  // FAB under the bar there instead of above it.
  //
  // `insets.bottom` (`react-native-safe-area-context`'s `useSafeAreaInsets`,
  // above) is what corrects this on iOS — and it must be that hook, not
  // Unistyles' own `rt.insets.bottom` used everywhere else in this
  // codebase: `NativePlatform+ios.swift`'s `getInsets()` reads the key
  // *window*'s `safeAreaInsets`, which never changes for a `UITabBarController`
  // tab bar (that's a child view controller's own layout, not a window-level
  // system inset). `NativeTabsView.ios.js` wraps every screen in its own
  // fresh `SafeAreaProvider`, and UIKit inflates *that* view's safe area for
  // whatever ancestor chrome sits below it — a tab bar included — which is
  // exactly what `RNCSafeAreaProviderComponentView.mm` reads back out
  // (`self.safeAreaInsets`, not the window's). So on iOS, `insets.bottom`
  // already equals the tab bar's own height; nothing here hardcodes it.
  // `Platform.OS === 'ios'` gates the addition rather than composing it
  // unconditionally (`Math.max`, say) because Android's own `insets.bottom`
  // is a real, separate device inset that this screen must not double-count
  // on top of a tab bar it never sits behind to begin with.
  //
  // moved out of `styles.fab` below rather than declared inside it, the
  // same restructuring docs/decisions/2026-08-29-ban-dynamic-function-styles.md's
  // own `tab-bar.tsx` fix used for its per-render `paddingBottom`: a value
  // Unistyles' `(theme, rt) =>` factory signature has no way to receive
  // (`insets` isn't `theme` or `rt`) is computed here and merged in as a
  // plain style at the call site instead.
  const fabBottom = theme.space.x24 + (Platform.OS === 'ios' ? insets.bottom : 0);

  // `../player-list/player-list.tsx`'s own `onEditPlayer` prop, wrapped in
  // `useCallback` rather than left as a fresh inline closure per render —
  // `setEditingPlayerId`/`setSheetVisible` are
  // both `useState` setters, guaranteed stable across renders by React
  // itself, so `[]` is a complete dependency list. this is what keeps this
  // one stable reference the same across every one of this screen's own
  // renders, the same reason that list's own doc comment gives for handing
  // `onDeletePlayer`/`onBreakdownRequested` straight through unwrapped:
  // without it, `PlayerList`'s own memoized rows (`MemoizedPlayerRow`)
  // would re-render on every render of *this* screen regardless of whether
  // that render had anything to do with any row's own data, since a fresh
  // closure here would reach every row as a changed prop.
  const handleEditPlayer = useCallback((id: string) => {
    setEditingPlayerId(id);
    setSheetVisible(true);
  }, []);

  // `../player-list/player-list.tsx`'s own `onBreakdownRequested` prop,
  // wrapped in `useCallback` for the exact same reason `handleEditPlayer`
  // above already is: a fresh inline closure here would reach every one of
  // `PlayerList`'s own memoized rows as a changed prop on every render of
  // this screen. Fires `Equity Breakdown Viewed` ahead of the
  // state write that actually opens the sheet — this prop only ever fires
  // for a hand-range row (`../player-row/player-row.tsx` never wires it for
  // a hole-cards row), so no extra guard is needed here to keep the event
  // limited to hand-range players, per this event's own contract in
  // `@/core/instrumentation/analytics.ts`.
  const handleBreakdownRequested = useCallback((id: string) => {
    trackEvent('Equity Breakdown Viewed', {});
    setBreakdownPlayerId(id);
  }, []);

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
      {/* always rendered, at a fixed `BAR_HEIGHT` — only its contents are
          conditional on `equityStatus` — see this component's own doc
          comment above for why. */}
      <View style={styles.equityProgressBarSlot} testID="analyze-equity-progress-bar-slot">
        {equityStatus === 'calculating' ? (
          <EquityProgressBar testID="analyze-equity-progress-bar" />
        ) : null}
      </View>
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
            testID="analyze-empty-state"
          />
        ) : (
          <PlayerList
            players={players}
            reorderingAllowed={reorderingAllowed}
            onDeletePlayer={removePlayer}
            onEditPlayer={handleEditPlayer}
            onBreakdownRequested={handleBreakdownRequested}
            testID="analyze-player-list"
          />
        )}
      </ScrollView>
      {players.length < MAX_PLAYERS ? (
        <NewPlayerFab
          onPress={openSheetForNewPlayer}
          style={[styles.fab, { bottom: fabBottom }]}
          testID="analyze-add-player-fab"
        />
      ) : null}
      <HoldingInputSheet
        visible={sheetVisible}
        initialHolding={editingPlayer?.holding}
        unavailableCards={playerUnavailableCards}
        onSubmit={(holding) => {
          if (editingPlayerId !== null) {
            replacePlayerHolding(editingPlayerId, holding);
          } else {
            // `Player Added` fires from `../../adapter/
            // use-players.ts`'s own `addPlayer`, guarded there against
            // the cap the same way `Player Removed` already relies on
            // `removePlayer` alone.
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
          // `NothingSelected` and `EmptyHandRange` both close silently.
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
          trackEvent('Board Confirmed', {});
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
        playerCount={players.length}
        isPreflop={board.length === 0}
        onRequestClose={() => setBreakdownPlayerId(null)}
        testID="analyze-equity-breakdown-sheet"
      />
      <Toast message={toastMessage} onClear={() => setToastMessage(null)} testID="analyze-toast" />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    // establishes the coordinate space `fab` below is positioned within —
    // not this screen placing itself; see
    // docs/conventions/component-styling.md's "A Positioning Context for a
    // Component's Own Children Is Not Placement".
    position: 'relative',
    backgroundColor: theme.colors.background.neutral.app,
  },
  // the progress bar's own reserved slot — always rendered at
  // exactly `BAR_HEIGHT`, whether or not it currently draws the bar itself;
  // see this component's own doc comment above.
  equityProgressBarSlot: {
    height: BAR_HEIGHT,
  },
  content: {
    // reduced from `theme.space.x32` by the reserved slot's
    // own `BAR_HEIGHT`, so the slot above plus this padding
    // still sum to `theme.space.x32` — the total space
    // between the board and the "Players" heading, unchanged in every
    // state. A computed literal, not a new named token, the same
    // "no token fits exactly" precedent `fabBottom` above documents.
    paddingTop: theme.space.x32 - BAR_HEIGHT,
    paddingBottom: theme.space.x32,
  },
  playersHeading: {
    ...theme.typography.sectionHeading,
    color: theme.colors.text.neutral.low,
    paddingHorizontal: theme.space.x16,
    marginBottom: theme.space.x16,
  },
  // this screen's own placement of `NewPlayerFab`, per
  // docs/conventions/component-styling.md's "Placement Is the Caller's"
  // rule — the FAB's own root sets none of this. Fixed to the bottom-right
  // corner of `screen` above, not of the `ScrollView` its own players
  // section scrolls inside, so it stays put regardless of scroll position.
  // `right` combines this project's own gutter with the device's own
  // horizontal safe-area inset, the same `Math.max` composition
  // `@/core/navigation/nav-bar.tsx`'s `paddingEnd` and `../toast/toast.tsx`'s
  // own `right` already use — horizontal placement is unaffected by which
  // tab navigator is rendering this screen, so it stays in this stylesheet.
  // `bottom` does not live here — see `fabBottom`'s own comment above, next to
  // where it's computed: it needs `insets.bottom`
  // (`react-native-safe-area-context`'s `useSafeAreaInsets`), which this
  // factory's `(theme, rt) =>` signature has no way to receive, so it's
  // merged in as a plain style at the FAB's own call site instead — the
  // same restructuring
  // docs/decisions/2026-08-29-ban-dynamic-function-styles.md's own
  // `tab-bar.tsx` fix used for its per-render `paddingBottom`.
  fab: {
    position: 'absolute',
    right: Math.max(theme.space.x16, rt.insets.right),
  },
}));
