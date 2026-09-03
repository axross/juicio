import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';

import { movePlayer, usePlayersStore } from '../../adapter/use-players';
import { MAX_PLAYERS, type Player } from '../../model/player';
import { PlayerRow } from '../player-row/player-row';

const TILE_SIZE = 64;

/**
 * the Analyze players list (docs/specs/equity-analysis.md, issue #87): a
 * stack of `PlayerRow`s in submission order, plus a trailing `New Player`
 * row whenever the list has room for another — gone at `MAX_PLAYERS`,
 * which removes the only affordance that opens the card/range input
 * sheet from a non-empty list.
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
 * `../../adapter/use-players.ts`'s `movePlayer` right here instead**
 * (issue #153's own plan) — a deliberate departure from the paragraph
 * above, not an inconsistency: `onReorder` fires potentially several
 * times over one held drag, live, as it crosses further rows' own
 * midpoints (`../player-row/player-row.tsx`'s own doc comment), so
 * resolving it through `../analyze-screen/analyze-screen.tsx` first would
 * buy nothing but an extra prop hop for a callback that has nowhere else
 * to go — unlike editing or the Equity Breakdown sheet, opening a reorder
 * has no further sheet or screen state for that screen to own.
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
  onNewPlayerRequested,
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
  /** fires when the trailing `New Player` row is pressed — this list
   * knows nothing about the sheet that opens in response. */
  onNewPlayerRequested: () => void;
  testID?: string;
}) {
  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      {players.map((player, index) => (
        <PlayerRow
          key={player.id}
          player={player}
          index={index}
          rowCount={players.length}
          onDelete={() => onDeletePlayer(player.id)}
          onEditRequested={() => onEditPlayer(player.id)}
          onBreakdownRequested={() => onBreakdownRequested(player.id)}
          // `../player-row/player-row.tsx`'s own `onReorder` fires
          // potentially several times over one held drag, live (that
          // component's own doc comment) — `fromIndex` is resolved fresh
          // from the store's own current state at each call, by this
          // player's own stable id, rather than closed over from this
          // render's own `index` above: a live reorder can move a player
          // between two calls faster than React re-renders this list with
          // a fresh `index`, and a stale closure would then call
          // `movePlayer` against a position this player no longer holds.
          onReorder={(toIndex) => {
            const fromIndex = usePlayersStore
              .getState()
              .players.findIndex((candidate) => candidate.id === player.id);
            if (fromIndex !== -1) {
              movePlayer(fromIndex, toIndex);
            }
          }}
          testID={testID ? `player-row-${player.id}` : undefined}
        />
      ))}
      {players.length < MAX_PLAYERS ? (
        <NewPlayerRow
          onPress={onNewPlayerRequested}
          testID={testID ? 'new-player-row' : undefined}
        />
      ) : null}
    </View>
  );
}

/**
 * the trailing `New Player` row — an inset 64×64 tile holding a plus
 * glyph, beside a label in the row's own `rowLabel` style. carried over
 * from the design's older `Home` frame (`142:13177`), scaled to this
 * row's own dimensions: the newer 393-wide frames draw no add affordance
 * at all, so nothing more specific exists to reproduce (the plan's own
 * assumption). private to this file — `PlayerList` is its only caller.
 *
 * fires `primaryAction` on press — the same event the empty state's own
 * `+ New Player` button fires (`docs/conventions/haptics.md`'s own row for
 * it): both open the identical sheet, and Apple's Consistency Rule is
 * explicit that the same gesture must not read as a different sensation
 * on two different screens.
 */
function NewPlayerRow({ onPress, testID }: { onPress: () => void; testID?: string }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation('analyze');
  const label = t('newPlayerRow.label');

  const handlePress = () => {
    triggerHaptic(HapticEvent.PrimaryAction);
    onPress();
  };

  return (
    <Pressable
      style={styles.row}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={styles.tile}>
        <PlusIcon color={theme.colors.text.neutral.high} size={24} />
      </View>
      <Text style={styles.newPlayerLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x16,
    padding: theme.space.x16,
    // this row's own design-fixed intrinsic dimension, per
    // docs/conventions/component-styling.md's "A Design-Fixed Intrinsic
    // Dimension Stays With the Component" rule — `NewPlayerRow` is a
    // file-private component, but the rule reaches its root the same way
    // it reaches any other: 96 is a measured design value, reproduced
    // faithfully rather than derived (docs/conventions/design-system.md's
    // Spacing and Radius section: "list rows at 96 and 72").
    height: 96,
    width: '100%',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.component.neutral.rest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPlayerLabel: {
    ...theme.typography.rowLabel,
    color: theme.colors.text.neutral.high,
  },
}));
