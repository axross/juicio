import type { ComponentProps } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { HistoryBoardGroup } from '../../usecase/group-history-entries';
import { HistoryEntryRow } from '../history-entry-row/history-entry-row';
import { BoardThumbnail } from './board-thumbnail';

/**
 * one board group within a date group (`docs/specs/calculation-history.md`):
 * the board every entry beneath it was calculated against, drawn as a
 * thumbnail, followed by one condensed row per entry — most recently
 * calculated first, the same order `../../usecase/
 * group-history-entries.ts` already hands this component. **no heading
 * text of its own** — the design groups by board using the board
 * thumbnail alone, with no caption above or beside it.
 *
 * a plain stack, not a `FlatList` — this project's own convention for a
 * small, non-virtualized list
 * (`../../../evaluations/ui/player-list/player-list.tsx`'s own doc
 * comment): nothing about History Entry volume in this app is expected to
 * require virtualization.
 */
export function BoardGroup({
  group,
  onDeleteEntry,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  group: HistoryBoardGroup;
  /** fires with a deleted entry's own `id`, forwarded straight from
   * whichever row's own swipe or accessibility action committed it — this
   * component holds no store reference of its own, the same "report the
   * outcome" shape `../../../evaluations/ui/player-list/player-list.tsx`
   * already takes for `onDeletePlayer`. */
  onDeleteEntry: (id: string) => void;
  testID?: string;
}) {
  return (
    <View style={[styles.root, style]} testID={testID} {...props}>
      <BoardThumbnail board={group.board} testID={testID ? 'board' : undefined} />
      <View style={styles.rows}>
        {group.entries.map((entry) => (
          <HistoryEntryRow
            key={entry.id}
            entry={entry}
            onDelete={onDeleteEntry}
            testID={testID ? `history-entry-row-${entry.id}` : undefined}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    width: '100%',
    gap: theme.space.x16,
  },
  rows: {
    width: '100%',
  },
}));
