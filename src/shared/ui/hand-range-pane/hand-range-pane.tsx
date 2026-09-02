import type { ComponentProps } from 'react';
import { memo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { triggerHaptic } from '@/core/haptics/haptics';
import { motionColor } from '@/core/motion/tokens';
import { usePrefersReducedMotion } from '@/core/motion/use-prefers-reduced-motion';
import {
  HAND_RANGE_SHORTHANDS,
  isEverySelected,
  toggleShorthand,
  type HandRangeShorthand,
} from '@/shared/model/hand-range-shorthand';
import { handRangeCardPairCount, type HandRange } from '@/shared/model/hand-range';
import { rankPairKey, type RankPairKey } from '@/shared/model/rank-pair';
import { SelectionGrid, type PaintChangeCause } from '@/shared/ui/selection-grid/selection-grid';

import { gridCoordinatesToRankPair } from '../grid-coordinates';

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
// — built once at module scope from `../grid-coordinates.ts`'s coordinate
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
 * add.** the maintainer's rule, `../../model/hand-range-shorthand.ts`'s
 * `toggleShorthand`: if any of the chip's rank pairs isn't yet selected,
 * the press selects all of them; if every one is already selected, the
 * press deselects all of them. rank pairs outside the chip's set are
 * never touched either way, which is what still lets a player combine
 * more than one chip's shape in the same range — pressing `55+` after
 * `A2s+` still keeps every suited ace the first chip selected, since
 * `55+`'s toggle only ever reads and writes its own pocket-pair rank
 * pairs. fires `bulkToggle` in both directions —
 * docs/conventions/haptics.md's own row for it, kept distinct from the
 * single rank-pair grid cell's `toggleOn`/`toggleOff` pair below precisely
 * because a chip press can change up to twelve rank pairs at once, not
 * one.
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
          renderCell={(key, selected, changeCause) => (
            <GridCell rankPairKeyValue={key} selected={selected} changeCause={changeCause} />
          )}
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
  /** `null` on every render but the one right after this cell's own
   * `selected` flipped from a single tap — `SelectionGrid`'s own doc
   * comment on `renderCell` says what the three states mean. */
  changeCause: PaintChangeCause | null;
};

/**
 * one grid cell's fill and label — a separate component, not inline JSX
 * in `renderCell` above, because `styles.useVariants` can only be called
 * from a component body, and each cell needs its own `selected` variant
 * independently of every other one — the same shape
 * `../segmented-tabs/segmented-tabs.tsx`'s `Tab` takes
 * for the same reason.
 *
 * **the fill transitions on a single tap, snaps on a painted run — PR
 * #70's motion system.** `SelectionGrid` already tells this component
 * apart via `changeCause`; what's left here is not re-rendering all 169
 * of these on every pointer move a drag makes. `React.memo` (this file's
 * own default export shape, `memo(GridCell)` below) is what does that:
 * `SelectionGrid`'s own render body still calls `renderCell` for every
 * cell on every selection change (`../selection-grid/selection-grid.tsx`
 * builds a fresh `<GridCell>` element per cell,
 * every render, same as before), but `selected` and `changeCause` are
 * both unchanged, by value, for every cell but the one a given pointer
 * move actually touched — `changeCause` reads `null` there both before
 * and after — so `memo`'s shallow prop comparison bails out of
 * re-rendering the other 168 without this component doing anything
 * itself to detect that.
 */
function GridCellComponent({ rankPairKeyValue, selected, changeCause }: GridCellProps) {
  const { theme } = useUnistyles();
  const reduceMotion = usePrefersReducedMotion();
  styles.useVariants({ selected });

  const targetFill = selected
    ? theme.colors.component.accent.selected
    : theme.colors.component.neutral.rest;
  const fill = useSharedValue(targetFill);

  useEffect(() => {
    // only a single tap (`'begin'`) animates — a painted run
    // (`'continue'`) and any other cause (a shorthand chip toggling many
    // cells at once, say) snap instantly, per this component's own doc
    // comment.
    fill.value = changeCause === 'begin' ? motionColor(targetFill, reduceMotion) : targetFill;
    // `fill` is a stable shared-value ref; including it here would only
    // fire this effect on every value it takes on, the same reasoning
    // `../bottom-sheet/bottom-sheet.tsx`'s own reset
    // effect gives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFill, changeCause, reduceMotion]);

  const animatedFillStyle = useAnimatedStyle(() => ({ backgroundColor: fill.value }));

  return (
    <Animated.View style={[styles.cell, animatedFillStyle]}>
      <Text style={styles.cellLabel}>{rankPairKeyValue}</Text>
    </Animated.View>
  );
}

const GridCell = memo(GridCellComponent);

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

// `Pressable` is a plain React Native component; wrapping it once, at
// module scope, lets an animated style (`styles.chip`'s fill, below)
// apply to it — the same reason `../bottom-sheet/bottom-sheet.tsx`'s own
// `AnimatedPressable` exists.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * one shorthand chip — a separate component, not inline JSX in the
 * `.map()` above, for the same reason `GridCell` above is one: each chip
 * reads its own theme-resolved target colours independently of its
 * siblings.
 *
 * active draws lime: fill, ring, and label all transition between rest
 * and active (PR #70's motion system) — three independent `useAnimatedStyle`s
 * driven by `active`, rather than the `styles.useVariants({ active })`
 * this component used before, which snapped all three instantly.
 * `styles.chipActiveRing`'s own `borderWidth` still stays a fixed,
 * unanimated constant — only its colour transitions, between the
 * accent border colour and `'transparent'` — since animating a *width*
 * belongs to this project's movement tier (`@/core/motion/tokens`'s doc
 * comment on why a spring, not a timing, suits movement), and a fixed
 * ring that fades in reads the same as one that grows, without mixing
 * the two tiers for one control. the ring stays a separate,
 * absolutely-positioned overlay rather than a wider `styles.chip`
 * border — `PreviewSlot`'s focus ring (`../cards-pane/cards-pane.tsx`)
 * already established why: a border on `styles.chip` itself would inset
 * that box's content (and, since this chip's width is intrinsic, not
 * fixed, would grow the box and shift every chip after it) rather than
 * leaving the chip's drawn size untouched. its `pointerEvents="none"`
 * (set at the call site below) keeps the overlay out of the touch
 * target's hit test, so `CHIP_TOUCH_EXPANSION` below is undisturbed by
 * it.
 */
function ShorthandChip({
  shorthand,
  active,
  onPress,
  accessibilityLabel,
  testID,
}: ShorthandChipProps) {
  const { theme } = useUnistyles();
  const reduceMotion = usePrefersReducedMotion();

  const targetFill = active
    ? theme.colors.component.accent.selected
    : theme.colors.component.neutral.rest;
  const targetRingColor = active ? theme.colors.text.accent.low : 'transparent';
  const targetLabelColor = active ? theme.colors.text.accent.low : theme.colors.text.neutral.high;

  const fill = useSharedValue(targetFill);
  const ringColor = useSharedValue(targetRingColor);
  const labelColor = useSharedValue(targetLabelColor);

  useEffect(() => {
    fill.value = motionColor(targetFill, reduceMotion);
    ringColor.value = motionColor(targetRingColor, reduceMotion);
    labelColor.value = motionColor(targetLabelColor, reduceMotion);
    // the three shared values above are stable refs — see `GridCellComponent`'s
    // own matching suppression.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFill, targetRingColor, targetLabelColor, reduceMotion]);

  const animatedChipStyle = useAnimatedStyle(() => ({ backgroundColor: fill.value }));
  const animatedRingStyle = useAnimatedStyle(() => ({ borderColor: ringColor.value }));
  const animatedLabelStyle = useAnimatedStyle(() => ({ color: labelColor.value }));

  const handlePress = useCallback(() => {
    onPress(shorthand);
  }, [onPress, shorthand]);

  return (
    <AnimatedPressable
      style={[styles.chip, animatedChipStyle]}
      onPress={handlePress}
      hitSlop={{ top: CHIP_TOUCH_EXPANSION, bottom: CHIP_TOUCH_EXPANSION }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View style={[styles.chipActiveRing, animatedRingStyle]} pointerEvents="none" />
      <Animated.Text style={[styles.chipLabel, animatedLabelStyle]}>
        {shorthand.label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

const CHIP_HEIGHT = 37;
const CHIP_RADIUS = 20;
// same fix as `../bottom-sheet/bottom-sheet.tsx`'s
// `HANDLE_TOUCH_EXPANSION`: the drawn chip is 37 tall, under the 44pt
// floor both platforms ask for, and its horizontal extent already clears
// 44 on its own (32 of horizontal padding alone, before any glyph width,
// on even the shortest chip label, `55+`) — so only the vertical touch
// target needs expanding: (44 - CHIP_HEIGHT) / 2, split evenly above and
// below, leaving the drawn 37-tall pill unchanged.
const CHIP_TOUCH_EXPANSION = (44 - CHIP_HEIGHT) / 2;
// the "chips to grid" gap, one of the sheet's four uniform 40-apart
// landmark gaps (see `HoldingInputSheet`'s own `LANDMARK_GAP`) — not
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
  // box — the same reason `../cards-pane/cards-pane.tsx`'s `slotsInner`
  // style carries it for `focusRing`. the active fill reuses the grid's own
  // selected-cell token (`styles.cell`'s own target colour above) rather
  // than a value picked for the chip alone, so a chip and the cells it
  // controls read as the same state. `backgroundColor` used to live in an
  // `active` variant here — moved to `ShorthandChip`'s own animated style
  // (PR #70's motion system) for the same reason `GridCellComponent`'s
  // own matching comment gives.
  chip: {
    height: CHIP_HEIGHT,
    paddingHorizontal: theme.space.x16,
    borderRadius: CHIP_RADIUS,
    borderWidth: theme.borderWidth.base,
    borderColor: theme.colors.border.neutral.subtle,
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
  // `borderWidth` stays fixed at `CHIP_ACTIVE_RING_WIDTH` now — it used
  // to switch to `0` for the inactive state; `ShorthandChip`'s own
  // animated `borderColor` (between the accent border colour and
  // `'transparent'`) carries the transition instead, so the ring fades
  // rather than growing — see that component's own doc comment on why.
  chipActiveRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: CHIP_RADIUS,
    borderWidth: CHIP_ACTIVE_RING_WIDTH,
  },
  // active label colour reuses `styles.cellLabel`'s own selected-state
  // token (`theme.colors.text.accent.low`) — the same lime the grid's
  // selected cell label already uses, per this component's own doc
  // comment on why the ring "reuses the grid's own selected-cell label
  // colour". `color` used to live in an `active` variant here — moved to
  // `ShorthandChip`'s own animated style, same as `chip` above.
  chipLabel: {
    ...theme.typography.chipLabel,
  },
  // `caption`, not `body` — the maintainer found `body` (16px) too large
  // for this count against the chips beside it; `caption` (14, Regular,
  // 20px line height, docs/conventions/design-system.md) is the project's
  // existing role for exactly this kind of compact secondary figure (the
  // Settings technical-information block reads the same way).
  count: {
    ...theme.typography.caption,
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
  // `backgroundColor` used to live in a `selected` variant here, same
  // shape as `cellLabel` below — moved to `GridCellComponent`'s own
  // animated style (PR #70's motion system) so a single tap can fade it;
  // a Unistyles variant snaps instantly with no transition of its own.
  cell: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.xs,
    alignItems: 'center',
    justifyContent: 'center',
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
