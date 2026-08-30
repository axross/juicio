import type { ComponentProps } from 'react';
import { Circle, Svg } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

import type { HandRange } from '../../model/hand-range';
import { rankPairKey, type RankPairKey } from '../../model/rank-pair';
import { gridCoordinatesToRankPair } from '../grid-coordinates';

const GRID_COLUMNS = 13;

/**
 * the rank-pair dot matrix's own native (viewBox) size — 13 circle
 * diameters plus 12 gaps between them, exactly, per this module's own
 * `RANK_PAIR_GRID_RADIUS`/`RANK_PAIR_GRID_PITCH` below (Figma file
 * `vkZzv1l45PBcVi5Wp92Eqg`, the SVG of node `518:27304`'s grid instance at
 * 64 wide): `13 * (2 * RANK_PAIR_GRID_RADIUS) + 12 * (RANK_PAIR_GRID_PITCH
 * - 2 * RANK_PAIR_GRID_RADIUS)` reduces to `13 * RANK_PAIR_GRID_PITCH -
 * (RANK_PAIR_GRID_PITCH - 2 * RANK_PAIR_GRID_RADIUS)`, which the measured
 * figures below resolve to exactly 64.
 */
const NATIVE_SIZE = 64;

/** a selected cell's circle radius — measured, not normalized onto this
 * project's 4/8px grid (docs/conventions/design-system.md's Spacing and
 * Radius section: faithful reproduction is the default now). */
export const RANK_PAIR_GRID_RADIUS = 2.23077;

/** the centre-to-centre pitch between two adjacent cells — the circle's
 * own 4.46154 diameter (`2 * RANK_PAIR_GRID_RADIUS`) plus a 0.5 gap,
 * measured the same way as the radius above. */
export const RANK_PAIR_GRID_PITCH = 4.96154;

// row-major, both axes descending A→2 — built once at module scope from
// `../grid-coordinates.ts`'s coordinate transform, the same way
// `../hand-range-pane/hand-range-pane.tsx`'s own `GRID_CELL_KEYS` is,
// rather than re-deriving the row/col-to-rank-pair mapping here.
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
 * a hand range's own 13×13 dot-matrix preview (docs/specs/
 * equity-analysis.md's Player Kinds, issue #87) — presentational only, no
 * gestures, no per-cell state of its own; unlike `../selection-grid/
 * selection-grid.tsx`, this draws **circles**, not squares,
 * and never changes what it renders in response to a touch.
 *
 * **an unselected cell is the same circle as a selected one, at `opacity:
 * 0`** — not a different colour, not omitted — reproducing the design's
 * own SVG literally rather than only its visible result, per this
 * project's "faithful reproduction is the default" rule.
 *
 * **sized by `size`, not hardcoded to 64.** `NATIVE_SIZE` above is this
 * grid's own coordinate system — every circle's `cx`/`cy`/`r` stays at its
 * measured, native value regardless of `size` — and `<Svg>`'s own
 * `width`/`height` vs. `viewBox` mismatch is what scales the rendered
 * result, the same way a plain `<img>` or `<svg>` scales on the web. this
 * project's one caller today (`../../../features/evaluations/ui/
 * player-row/player-row.tsx`) passes `64`, the row's own preview column
 * width.
 *
 * decorative: nothing here sets `accessible` on the `<Svg>` root or any
 * `<Circle>`, so this grid renders no accessibility stop of its own — the
 * row that composes it already carries one accessibility label describing
 * the whole holding, and a screen reader has no use for 169
 * individually-announced dots. (no document of this project's states that
 * composition rule — `docs/conventions/accessibility.md` is scoped to
 * routing a form field's hint and error, nothing wider — so this is the
 * reasoning itself, not a citation of one.)
 *
 * its root child element is `<Svg>`, not a wrapping `View` —
 * `docs/conventions/component-contracts.md`'s props-inheritance rule
 * reaches the element a caller actually sees.
 */
export function RankPairGrid({
  rankPairs,
  size,
  testID,
  ...props
}: ComponentProps<typeof Svg> & {
  rankPairs: HandRange;
  /** the rendered width and height — this grid is always square. */
  size: number;
  testID?: string;
}) {
  const { theme } = useUnistyles();

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${NATIVE_SIZE} ${NATIVE_SIZE}`}
      fill="none"
      testID={testID}
      {...props}
    >
      {GRID_CELL_KEYS.map((key, index) => {
        const row = Math.floor(index / GRID_COLUMNS);
        const col = index % GRID_COLUMNS;
        const selected = rankPairs.has(key);
        return (
          <Circle
            key={key}
            cx={RANK_PAIR_GRID_RADIUS + col * RANK_PAIR_GRID_PITCH}
            cy={RANK_PAIR_GRID_RADIUS + row * RANK_PAIR_GRID_PITCH}
            r={RANK_PAIR_GRID_RADIUS}
            fill={theme.colors.solid.accent.rest}
            opacity={selected ? 1 : 0}
            testID={testID ? `cell-${key}` : undefined}
          />
        );
      })}
    </Svg>
  );
}
