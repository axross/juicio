import type { ComponentProps } from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import { SelectionGrid } from '@/shared/ui/selection-grid/selection-grid';

import {
  HAND_RANGE_SHORTHANDS,
  isEverySelected,
  toggleShorthand,
  type HandRangeShorthand,
} from '../../model/hand-range-shorthand';
import { handRangeCardPairCount, type HandRange } from '../../model/hand-range';
import { rankPairKey, type RankPairKey } from '../../model/rank-pair';
import { gridCoordinatesToRankPair } from './grid-coordinates';

const GRID_COLUMNS = 13;
// the design's measured cell size and pitch (docs/specs/hand-ranges.md,
// docs/conventions/design-system.md's Spacing and Radius section —
// faithful reproduction is this project's default now, not normalizing
// onto its 4/8px grid). `GRID_GAP` is the difference between the two, the
// gap `SelectionGrid`'s `gap` prop draws between cells so a 13-cell row
// measures out to exactly `GRID_CELL_SIZE` per cell.
const GRID_CELL_SIZE = 29;
const GRID_PITCH = 30.833;
const GRID_GAP = GRID_PITCH - GRID_CELL_SIZE;

// row-major, both axes descending A→2 — docs/specs/hand-ranges.md's grid
// — built once at module scope from `./grid-coordinates.ts`'s coordinate
// transform rather than duplicating its row/col rule here.
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
 * selection's card pair count on one row, the 13×13 rank-pair grid
 * beneath it.
 *
 * **a shorthand chip toggles its own rank pairs, it doesn't only ever
 * add.** the maintainer's rule, `../model/hand-range-shorthand.ts`'s
 * `toggleShorthand`: if any of the chip's rank pairs isn't yet selected,
 * the press selects all of them; if every one is already selected, the
 * press deselects all of them. rank pairs outside the chip's set are
 * never touched either way, which is what still lets a player combine
 * more than one chip's shape in the same range — pressing `55+` after
 * `A2s+` still keeps every suited ace the first chip selected, since
 * `55+`'s toggle only ever reads and writes its own pocket-pair rank
 * pairs. fires `toggleOn` when the press selects, and `toggleOff` when it
 * deselects — docs/conventions/haptics.md's `toggleOn`/`toggleOff` rows
 * already cover exactly this two-state-switch shape, which a shorthand
 * chip now is, rather than `selectionChange`'s "pick one of several
 * options" shape a chip no longer matches once it can turn its own
 * selection off again.
 */
export function HandRangePane({
  selectedRankPairs,
  onSelectionChange,
  testID,
  style,
  ...props
}: ComponentProps<typeof View> & {
  selectedRankPairs: HandRange;
  /** named for the outcome, not the mechanism, per
   * docs/conventions/component-contracts.md — fires with the whole
   * updated set, whether a shorthand chip or a grid cell (tap or drag)
   * caused it. */
  onSelectionChange: (next: ReadonlySet<RankPairKey>) => void;
  testID?: string;
}) {
  const { t } = useTranslation('handRanges');

  const cardPairCount = handRangeCardPairCount(selectedRankPairs);

  const handleChipPress = (shorthand: HandRangeShorthand) => {
    const { next, haptic } = toggleShorthand(selectedRankPairs, shorthand);
    triggerHaptic(haptic);
    onSelectionChange(next);
  };

  return (
    // `style` merged last, after this component's `styles.root`, so a
    // caller extending it doesn't wipe the chip-row-to-grid `gap` layout
    // below depends on; every other rest prop spreads after `testID`, same
    // ordering `SegmentedTabs` uses.
    <View style={[styles.root, style]} testID={testID} {...props}>
      <View style={styles.chipRow}>
        <View style={styles.chips}>
          {HAND_RANGE_SHORTHANDS.map((shorthand) => (
            <ShorthandChip
              key={shorthand.token}
              shorthand={shorthand}
              active={isEverySelected(selectedRankPairs, shorthand.rankPairs)}
              onPress={handleChipPress}
              accessibilityLabel={t('chip.accessibilityLabel', { shorthand: shorthand.label })}
              testID={testID ? `chip-${shorthand.token}` : undefined}
            />
          ))}
        </View>
        <Text style={styles.count} testID={testID ? 'count' : undefined}>
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
          testID={testID ? 'grid' : undefined}
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
 * one grid cell's fill and label — a separate component, not inline JSX
 * in `renderCell` above, because `styles.useVariants` can only be called
 * from a component body, and each cell needs its own `selected` variant
 * independently of every other one — the same shape
 * `../../../../shared/ui/segmented-tabs/segmented-tabs.tsx`'s `Tab` takes
 * for the same reason.
 */
function GridCell({ rankPairKeyValue, selected }: GridCellProps) {
  styles.useVariants({ selected });

  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{rankPairKeyValue}</Text>
    </View>
  );
}

type ShorthandChipProps = {
  shorthand: HandRangeShorthand;
  /** true once every one of this chip's rank pairs is already selected —
   * `isEverySelected` (`../../model/hand-range-shorthand.ts`), the same
   * predicate `toggleShorthand`'s deselect branch already computes,
   * reused here rather than recomputed. */
  active: boolean;
  onPress: (shorthand: HandRangeShorthand) => void;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * one shorthand chip — a separate component, not inline JSX in the
 * `.map()` above, for the same reason `GridCell` above is one: each chip
 * needs its own `active` variant independently of its siblings, and
 * `styles.useVariants` can only be called from a component body.
 *
 * the active ring is drawn as a separate, absolutely-positioned overlay
 * (`styles.chipActiveRing` below) rather than a wider `styles.chip` border
 * — `PreviewSlot`'s focus ring (`../cards-pane/cards-pane.tsx`) already
 * established why: a border on `styles.chip` itself would inset that
 * box's content (and, since this chip's width is intrinsic, not fixed,
 * would grow the box and shift every chip after it) rather than leaving
 * the resting fill and the chip's drawn size untouched. its
 * `pointerEvents="none"` (set at the call site below) keeps the overlay
 * out of the touch target's hit test, so `CHIP_TOUCH_EXPANSION` below is
 * undisturbed by it.
 */
function ShorthandChip({
  shorthand,
  active,
  onPress,
  accessibilityLabel,
  testID,
}: ShorthandChipProps) {
  styles.useVariants({ active });

  const handlePress = useCallback(() => {
    onPress(shorthand);
  }, [onPress, shorthand]);

  return (
    <Pressable
      style={styles.chip}
      onPress={handlePress}
      hitSlop={{ top: CHIP_TOUCH_EXPANSION, bottom: CHIP_TOUCH_EXPANSION }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View style={styles.chipActiveRing} pointerEvents="none" />
      <Text style={styles.chipLabel}>{shorthand.label}</Text>
    </Pressable>
  );
}

const CHIP_HEIGHT = 37;
const CHIP_RADIUS = 20;
// same fix as `../../../../shared/ui/bottom-sheet/bottom-sheet.tsx`'s
// `HANDLE_TOUCH_EXPANSION`: the drawn chip is 37 tall, under the 44pt
// floor both platforms ask for, and its horizontal extent already clears
// 44 on its own (32 of horizontal padding alone, before any glyph width,
// on even the shortest chip label, `55+`) — so only the vertical touch
// target needs expanding: (44 - CHIP_HEIGHT) / 2, split evenly above and
// below, leaving the drawn 37-tall pill unchanged.
const CHIP_TOUCH_EXPANSION = (44 - CHIP_HEIGHT) / 2;
// the "chips to grid" gap, one of the sheet's four uniform 40-apart
// landmark gaps (see `./holding-input-sheet.tsx`'s `LANDMARK_GAP`) — not
// one of `theme.space`'s steps (`x32`, `x48`), so it stays this pane's own
// named constant rather than reaching for a step that doesn't match.
const CHIP_ROW_TO_GRID_GAP = 40;
// the active chip's ring width — an implementer's own choice ("around
// 1.5px"), not a value any existing `theme.borderWidth` step names
// (`base` is 1, `thick` is 2). drawn flush against the chip's edge
// (`styles.chipActiveRing` below has no offset), so it reads as the
// chip's border recoloured to lime rather than a ring standing outside
// it.
const CHIP_ACTIVE_RING_WIDTH = 1.5;

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
  // `position: 'relative'` anchors `chipActiveRing` below against this
  // box — the same reason `../cards-pane/cards-pane.tsx`'s `slot` style
  // carries it for `focusRing`.
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: CHIP_RADIUS,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
    backgroundColor: theme.colors.component.neutral.rest,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  // the active state's ring: an absolutely-positioned overlay, entirely
  // out of flow, rather than a style on `chip` itself — a wider border
  // there would inset `chip`'s fixed height (harmless, since
  // `CHIP_HEIGHT` is fixed rather than intrinsic) but would also grow
  // `chip`'s intrinsic *width* (unset, sized from its padding and label)
  // and shift every chip after it — exactly what must not happen to the
  // chip's drawn size or its neighbours. `pointerEvents="none"` (set at
  // the call site) keeps it out of `CHIP_TOUCH_EXPANSION`'s hit test.
  chipActiveRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CHIP_RADIUS,
    variants: {
      active: {
        true: { borderWidth: CHIP_ACTIVE_RING_WIDTH, borderColor: theme.colors.text.accent.low },
        false: { borderWidth: 0 },
        default: { borderWidth: 0 },
      },
    },
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
  // proportional figure would be 20.1, moving each cell by 0.15 — below a
  // device pixel at any scale factor this app renders at, and not worth
  // measuring a second layout to recover.
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
        // docs/conventions/design-system.md's "Rank-Pair Grid Cell
        // Label" entry for the measured ratios and why this is not a bug
        // to fix.
        false: { color: theme.colors.solid.neutral.rest },
        default: { color: theme.colors.solid.neutral.rest },
      },
    },
  },
}));
