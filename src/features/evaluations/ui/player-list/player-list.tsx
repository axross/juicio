import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

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
 * **takes `players` and two callbacks, holding no store reference of its
 * own** — the same shape `PlayerRow` follows, one level down. `../analyze-
 * screen/analyze-screen.tsx` is what reads `../../adapter/use-players.ts`
 * and binds both callbacks to its actions — `onEditPlayer` to
 * `replacePlayerHolding`, reached by first reopening the sheet seeded with
 * that player's own current holding (`../../adapter/use-players.ts`'s
 * `replacePlayerHolding`, `HoldingInputSheet`'s own `initialHolding` prop).
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
      {players.map((player) => (
        <PlayerRow
          key={player.id}
          player={player}
          onDelete={() => onDeletePlayer(player.id)}
          onEditRequested={() => onEditPlayer(player.id)}
          onBreakdownRequested={() => onBreakdownRequested(player.id)}
          testID={testID ? `player-row-${player.id}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  root: {
    width: '100%',
  },
}));
