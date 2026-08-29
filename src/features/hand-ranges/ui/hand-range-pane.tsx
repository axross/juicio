import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import { SelectionGrid } from '@/shared/ui/selection-grid/selection-grid';

import { HAND_RANGE_SHORTHANDS, type HandRangeShorthand } from '../model/hand-range-shorthand';
import { handRangeCardPairCount, type HandRange } from '../model/hand-range';
import { gridCoordinatesToRankPair, rankPairKey, type RankPairKey } from '../model/rank-pair';

export type HandRangePaneProps = {
  selectedRankPairs: HandRange;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires with the whole
   * updated set, whether a shorthand chip or a grid cell (tap or drag)
   * caused it. */
  onSelectionChange: (next: ReadonlySet<RankPairKey>) => void;
  testID?: string;
};

const GRID_COLUMNS = 13;
// the design's own measured cell size and pitch (docs/specs/hand-ranges.md,
// docs/conventions/design-system.md's Spacing and Radius section — faithful
// reproduction is this project's default now, not normalizing onto its
// 4/8px grid). `GRID_GAP` is the difference between the two, the gap
// `SelectionGrid`'s own `gap` prop draws between cells so a 13-cell row
// measures out to exactly `GRID_CELL_SIZE` per cell.
const GRID_CELL_SIZE = 29;
const GRID_PITCH = 30.833;
const GRID_GAP = GRID_PITCH - GRID_CELL_SIZE;

// row-major, both axes descending A→2 — docs/specs/hand-ranges.md's own
// grid — built once at module scope from `../model/rank-pair.ts`'s own
// coordinate transform rather than duplicating its row/col rule here.
const GRID_CELL_KEYS: readonly RankPairKey[] = Array.from(
  { length: GRID_COLUMNS * GRID_COLUMNS },
  (_, index) =>
    rankPairKey(
      gridCoordinatesToRankPair({
        row: Math.floor(index / GRID_COLUMNS),
        col: index % GRID_COLUMNS,
      }),
    ),
);

/**
 * the card/range input sheet's `Hand Range` tab
 * (docs/specs/hand-ranges.md): the three shorthand chips and the current
 * selection's own card pair count on one row, the 13×13 rank-pair grid
 * beneath it.
 *
 * **a shorthand chip adds to the current selection, it does not replace
 * it.** the spec leaves this open; replacing would make the three chips
 * mutually exclusive — pressing `55+` after `A*s` would silently discard
 * every suited ace the first chip just selected — which defeats having
 * three of them at all, since a real range is routinely built from more
 * than one of these shapes at once (suited aces *and* a pocket-pair
 * threshold *and* a connector run, all in the same range). adding is also
 * the direction a player can always recover from: over-selecting from a
 * chip is undone with a further tap on the grid itself, the same paint
 * gesture that deselects anywhere else on it, where a replace-and-lose-
 * the-rest press has no such undo. fires `selectionChange`, not
 * `toggleOn`/`toggleOff`: a chip is not a boolean switching one thing on
 * or off, it is a bulk choice among the three shapes, the same kind of
 * "pick one of several options" interaction
 * docs/conventions/haptics.md's own `selectionChange` row already covers
 * (its own example: "picking a Settings radio option... including
 * re-selecting the one already active").
 */
export function HandRangePane({
  selectedRankPairs,
  onSelectionChange,
  testID,
}: HandRangePaneProps) {
  const { t } = useTranslation('handRanges');

  const cardPairCount = handRangeCardPairCount(selectedRankPairs);

  const handleChipPress = (shorthand: HandRangeShorthand) => {
    triggerHaptic('selectionChange');
    const next = new Set(selectedRankPairs);
    for (const key of shorthand.rankPairs) {
      next.add(key);
    }
    onSelectionChange(next);
  };

  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.chipRow}>
        <View style={styles.chips}>
          {HAND_RANGE_SHORTHANDS.map((shorthand) => (
            <Pressable
              key={shorthand.token}
              style={styles.chip}
              onPress={() => handleChipPress(shorthand)}
              accessibilityRole="button"
              accessibilityLabel={t('chip.accessibilityLabel', { shorthand: shorthand.label })}
              testID={testID ? `${testID}-chip-${shorthand.token}` : undefined}
            >
              <Text style={styles.chipLabel}>{shorthand.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.count} testID={testID ? `${testID}-count` : undefined}>
          {t('cardPairCount', { count: cardPairCount })}
        </Text>
      </View>
      <View style={styles.gridWrapper}>
        <SelectionGrid
          columns={GRID_COLUMNS}
          cellKeys={GRID_CELL_KEYS}
          selectedKeys={selectedRankPairs}
          onSelectionChange={onSelectionChange}
          renderCell={(key, selected) => <GridCell rankPairKeyValue={key} selected={selected} />}
          gap={GRID_GAP}
          getCellAccessibilityLabel={(key) => t('grid.cellAccessibilityLabel', { rankPair: key })}
          testID={testID ? `${testID}-grid` : undefined}
        />
      </View>
    </View>
  );
}

type GridCellProps = {
  rankPairKeyValue: RankPairKey;
  selected: boolean;
};

/**
 * one grid cell's own fill and label — a separate component, not inline
 * JSX in `renderCell` above, because `styles.useVariants` can only be
 * called from a component body, and each cell needs its own `selected`
 * variant independently of every other one — the same shape
 * `../../../shared/ui/segmented-tabs/segmented-tabs.tsx`'s own `Tab`
 * takes for the same reason.
 */
function GridCell({ rankPairKeyValue, selected }: GridCellProps) {
  styles.useVariants({ selected });

  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{rankPairKeyValue}</Text>
    </View>
  );
}

const CHIP_HEIGHT = 37;
const CHIP_RADIUS = 20;
// the "chips to grid" gap this run's own brief names, one of the sheet's
// four uniform 40-apart landmark gaps (see `./holding-input-sheet.tsx`'s
// own `LANDMARK_GAP`) — not one of `theme.space`'s own steps (`x32`,
// `x48`), so it stays this pane's own named constant rather than reaching
// for a step that does not match.
const CHIP_ROW_TO_GRID_GAP = 40;

const styles = StyleSheet.create((theme) => ({
  root: {
    gap: CHIP_ROW_TO_GRID_GAP,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.x16,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.x8,
  },
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: CHIP_RADIUS,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
    backgroundColor: theme.colors.component.neutral.rest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipLabel: {
    ...theme.typography.chipLabel,
    color: theme.colors.text.neutral.high,
  },
  count: {
    ...theme.typography.body,
    color: theme.colors.text.neutral.low,
  },
  // the grid fills whatever width the sheet's content box gives it, and
  // `SelectionGrid` sizes its own cells from that measured width, so the
  // 13 columns track the device the same way the fan does. pinning this
  // to the design's own 399 instead would overflow every device narrower
  // than the 430 reference — 393's content box is 364, so a centred
  // 399-wide grid hangs 17.5 off each side rather than being clipped on
  // one.
  //
  // `GRID_GAP` stays at its design value rather than scaling with the
  // rest: at 1.833 it contributes 22 across twelve gutters where the
  // proportional figure would be 20.1, which moves each cell by 0.15 —
  // below a device pixel at any scale factor this app renders at, and not
  // worth measuring a second layout to recover.
  gridWrapper: {
    width: '100%',
  },
  cell: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
    variants: {
      selected: {
        true: { backgroundColor: theme.colors.component.accent.selected },
        false: { backgroundColor: theme.colors.component.neutral.rest },
        default: { backgroundColor: theme.colors.component.neutral.rest },
      },
    },
  },
  cellLabel: {
    ...theme.typography.gridCellLabel,
    variants: {
      selected: {
        // the design's own selected-label colour, `lime dark/11`.
        true: { color: theme.colors.text.accent.low },
        // deliberately below the 4.5:1 text floor — see
        // docs/conventions/design-system.md's "Hand-Range Grid Cell
        // Label" entry for the measured ratios and why this is not a bug
        // to fix.
        false: { color: theme.colors.solid.neutral.rest },
        default: { color: theme.colors.solid.neutral.rest },
      },
    },
  },
}));
