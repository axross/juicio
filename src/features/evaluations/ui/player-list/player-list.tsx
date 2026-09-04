import type { ComponentProps } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { movePlayerById } from '../../adapter/use-players';
import type { Player } from '../../model/player';
import { PlayerRow } from '../player-row/player-row';

/**
 * the Analyze players list (docs/specs/equity-analysis.md, issue #87): a
 * plain stack of `PlayerRow`s in submission order. The add-player
 * affordance this list used to render as its own trailing row (issue #87)
 * moved out to a persistent floating action button `../analyze-screen/
 * analyze-screen.tsx` renders alongside this list instead (issue #155,
 * `../new-player-fab/new-player-fab.tsx`) — this list no longer knows the
 * players cap or opens the card/range input sheet itself.
 *
 * **takes `players` and three of its four callbacks, holding no store
 * reference of its own for them** — the same shape `PlayerRow` follows,
 * one level down. `../analyze-screen/analyze-screen.tsx` is what reads
 * `../../adapter/use-players.ts` and binds those three to its actions —
 * `onEditPlayer` to `replacePlayerHolding`, reached by first reopening the
 * sheet seeded with that player's own current holding (`../../adapter/
 * use-players.ts`'s `replacePlayerHolding`, `HoldingInputSheet`'s own
 * `initialHolding` prop).
 *
 * **the fourth callback, each row's own `onReorder`, is wired to
 * `../../adapter/use-players.ts`'s `movePlayerById` right here instead**
 * (issue #153's own plan) — a deliberate departure from the paragraph
 * above, not an inconsistency: `onReorder` fires potentially several
 * times over one held drag, live, as it crosses further rows' own
 * midpoints (`../player-row/player-row.tsx`'s own doc comment), so
 * resolving it through `../analyze-screen/analyze-screen.tsx` first would
 * buy nothing but an extra prop hop for a callback that has nowhere else
 * to go — unlike editing or the Equity Breakdown sheet, opening a reorder
 * has no further sheet or screen state for that screen to own.
 * `movePlayerById` itself, not this component, is what resolves the
 * player's current index fresh from the store by its own stable `id`
 * rather than from this render's own (potentially stale) `index` — see
 * that function's own doc comment, and its own unit tests in
 * `../../adapter/use-players.test.ts`, for why.
 *
 * **every row's own callback now fires with that player's own `id`**
 * (issue #162's own plan), which is what lets every one of the four below
 * reach each row as the exact same function reference on every render of
 * this list: `onDeletePlayer` and `onBreakdownRequested` are this list's
 * own received props, handed to every `PlayerRow` unwrapped rather than
 * rebuilt per row; `onEditPlayer` the same; and `onReorder` is
 * `movePlayerById` itself, imported directly, since its own signature —
 * `(id: string, toIndex: number) => void` — already matches what
 * `PlayerRow` now calls it with, leaving nothing for this list to adapt.
 * Before this change every row was handed a fresh closure built inside
 * the `.map()` below (`() => onDeletePlayer(player.id)` and the like) — a
 * new function identity on every single render of this list, which
 * defeated `React.memo` before it could ever bail out a row's own
 * re-render.
 *
 * **`MemoizedPlayerRow` below is where this project's own new decision —
 * a shared component's re-render protection is applied at the place that
 * renders it, not inside the component's own file — is first put into
 * practice**
 * (docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md,
 * docs/conventions/component-memoization.md). `PlayerRow` itself stays
 * exactly as free of `React.memo` as it always was; this list is the one
 * place that actually knows every prop it now hands down is stable enough
 * for the wrap to pay off. `arePlayerRowPropsEqual`'s own doc comment
 * below explains the one prop it deliberately does not compare.
 *
 * **a plain stack, not a `FlatList`.** virtualisation buys nothing at a
 * fixed cap of three rows, and this list already renders inside
 * `index.tsx`'s own `ScrollView` — nesting a virtualised list inside
 * another scrolling container is a pattern React Native warns against.
 */
export function PlayerList({
  players,
  onDeletePlayer,
  onEditPlayer,
  onBreakdownRequested,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  players: readonly Player[];
  /** fires with the deleted player's own id, once a row's swipe or
   * accessibility action commits — see `../player-row/player-row.tsx`'s
   * own `onDelete`. */
  onDeletePlayer: (id: string) => void;
  /** fires with a player's own id, once that row's preview is tapped or its
   * own accessibility `'edit'` action is invoked — see `../player-row/
   * player-row.tsx`'s own `onEditRequested`. this list knows nothing about
   * the sheet that opens in response, or that it reopens seeded with that
   * player's own current holding. */
  onEditPlayer: (id: string) => void;
  /** fires with a hand-range player's own id, once that row is pressed
   * anywhere other than its preview (issue #102) — see `../player-row/
   * player-row.tsx`'s own `onBreakdownRequested`. this list knows nothing
   * about the Equity Breakdown sheet that opens in response. */
  onBreakdownRequested: (id: string) => void;
  testID?: string;
}) {
  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      {players.map((player, index) => (
        <MemoizedPlayerRow
          key={player.id}
          player={player}
          index={index}
          rowCount={players.length}
          onDelete={onDeletePlayer}
          onEditRequested={onEditPlayer}
          onBreakdownRequested={onBreakdownRequested}
          onReorder={movePlayerById}
          testID={testID ? `player-row-${player.id}` : undefined}
        />
      ))}
    </View>
  );
}

/**
 * `PlayerRow`'s own re-render protection, applied here rather than inside
 * `../player-row/player-row.tsx` itself, per this project's own decision
 * (docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md,
 * docs/conventions/component-memoization.md) — this list's own doc comment
 * above explains why every prop `PlayerList` hands each row is now stable
 * enough for this to actually skip work rather than compare-and-re-render
 * every time regardless.
 */
const MemoizedPlayerRow = memo(PlayerRow, arePlayerRowPropsEqual);

/**
 * the custom equality `MemoizedPlayerRow` above checks instead of
 * `React.memo`'s own default shallow comparison of every prop — every prop
 * but one. **`rowCount` is deliberately left out.** `PlayerList` passes
 * every row the same `players.length`, so adding or removing any player —
 * not only this row's own — changes every existing row's own `rowCount`
 * prop on every one of those renders; comparing it here would mean the one
 * genuinely unrelated case this project's own decision exists to protect
 * against (docs/decisions/2026-09-03-memoize-shared-components-at-the-call-site.md's
 * own worked example) — an unrelated player being added or removed — would
 * still re-render every existing row, defeating the point of wrapping this
 * component at all.
 *
 * the cost this accepts: a row's own drag gesture
 * (`../player-row/player-row.tsx`'s `reorderPan`) rebuilds its clamp math
 * from whatever `rowCount` its *last actual render* closed over, not
 * necessarily the current player count, for as long as this row keeps
 * being skipped. this is reachable only by another player being added or
 * removed *while this exact row is mid-drag* — on a single-pointer touch
 * device that requires the interaction driving that add/remove (opening
 * the card/range input sheet and submitting it, or another row's own
 * swipe-to-delete) to happen with a *second*, simultaneous touch, since
 * this row's own long-press-then-pan gesture already holds the only
 * pointer an ordinary phone interaction has. this row's own `index` and
 * `player` props, by contrast, are still compared: a reorder that moves
 * this row, or an edit to this row's own holding, still re-renders it with
 * fresh values, on the very next render this component is given regardless
 * of whether that render happened to be skipped for `rowCount` alone.
 */
function arePlayerRowPropsEqual(
  previous: ComponentProps<typeof PlayerRow>,
  next: ComponentProps<typeof PlayerRow>,
): boolean {
  return (
    previous.player === next.player &&
    previous.index === next.index &&
    previous.onDelete === next.onDelete &&
    previous.onEditRequested === next.onEditRequested &&
    previous.onBreakdownRequested === next.onBreakdownRequested &&
    previous.onReorder === next.onReorder &&
    previous.testID === next.testID
    // `rowCount` intentionally excluded — see this function's own doc
    // comment above.
  );
}

const styles = StyleSheet.create(() => ({
  root: {
    width: '100%',
  },
}));
