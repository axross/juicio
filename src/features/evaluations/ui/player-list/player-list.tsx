import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { HapticEvent, triggerHaptic } from '@/core/haptics/haptics';
import { PlusIcon } from '@/core/icons/plus-icon';

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
 * **takes `players` and three callbacks, holding no store reference of its
 * own** — the same shape `PlayerRow` follows, one level down. `../analyze-
 * screen/analyze-screen.tsx` is what reads `../../adapter/use-players.ts`
 * and binds all three callbacks to its actions — `onEditPlayer` to
 * `replacePlayerHolding`, reached by first reopening the sheet seeded with
 * that player's own current holding (`../../adapter/use-players.ts`'s
 * `replacePlayerHolding`, `HoldingInputSheet`'s own `initialHolding` prop).
 *
 * **a plain stack, not a `FlatList`.** virtualisation buys nothing at a
 * fixed cap of six rows, and this list already renders inside
 * `index.tsx`'s own `ScrollView` — nesting a virtualised list inside
 * another scrolling container is a pattern React Native warns against.
 */
export function PlayerList({
  players,
  onDeletePlayer,
  onEditPlayer,
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
  /** fires when the trailing `New Player` row is pressed — this list
   * knows nothing about the sheet that opens in response. */
  onNewPlayerRequested: () => void;
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
