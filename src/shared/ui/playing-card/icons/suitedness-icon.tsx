import type { ComponentProps } from 'react';
import { Path, Svg } from 'react-native-svg';

import type { Suitedness } from '@/shared/model/rank-pair';

/**
 * one path per suitedness glyph, sharp (non-rounded) square-cornered bars
 * throughout: two flat horizontal bars for `suited` (reading as "="), the
 * same two bars crossed by a third, diagonal bar for `offsuit` (reading as
 * "≠"). this project's own invented geometry, not a Figma measurement —
 * unlike `rank-icon.tsx`'s and `suit-icon.tsx`'s own paths, this glyph has
 * no design-file precedent to transcribe, the same "no existing precedent
 * to borrow" position `../../../features/presets/ui/preset-tag-picker-sheet/
 * preset-tag-picker-sheet.tsx`'s own checkbox indicator states for its own
 * invented shape. A 0..16 viewBox, matching `rank-icon.tsx`'s own scale so
 * this glyph sits flush against a `RankIcon` at zero gap.
 */
const SUITEDNESS_PATHS: Record<Suitedness, string> = {
  suited: 'M3,6 L13,6 L13,8 L3,8 Z M3,10 L13,10 L13,12 L3,12 Z',
  offsuit:
    'M3,6 L13,6 L13,8 L3,8 Z M3,10 L13,10 L13,12 L3,12 Z M3.22,12.38 L11.22,2.38 L12.78,3.63 L4.78,13.63 Z',
};

// lives under `shared/ui/playing-card/icons/`, not `src/core/icons/` — see
// `rank-icon.tsx`'s doc comment, which states the reasoning once for both:
// a rank pair's suitedness is a poker concept, not feature-agnostic
// infrastructure.

/**
 * the trailing suitedness indicator a Rank Pair chip draws after its two
 * `RankIcon`s — `../../../features/evaluations/ui/
 * equity-breakdown-rank-pairs/equity-breakdown-rank-pairs.tsx`'s only
 * caller, for `suited`/`offsuit` pairs only; a pocket pair chip draws no
 * third icon at all, since a pocket pair's own two cards are never
 * suited or offsuit against each other in the sense this glyph names. See
 * `rank-icon.tsx`'s doc comment for why this is one data-driven component
 * over two near-identical files.
 */
export function SuitednessIcon({
  suitedness,
  color,
  size = 16,
  testID,
  style,
  ...props
}: ComponentProps<typeof Svg> & {
  suitedness: Suitedness;
  /** resolved from a theme colour token by the caller, the same contract
   * `rank-icon.tsx`'s own `color` prop carries — this component reads no
   * theme itself. */
  color: string;
  /** both width and height. defaults to 16, matching `rank-icon.tsx`'s own
   * default so this glyph sits at the same scale as the `RankIcon`s it sits
   * beside. */
  size?: number;
  testID?: string;
}) {
  return (
    // `style` is pulled out of the rest spread rather than left to ride in
    // it: this icon sets no style of its own to array-merge with today, but
    // a spread `style` would replace one the moment it gained one. every
    // other rest prop, `testID` included, spreads last (default ordering),
    // so a caller can override this icon's own defaults (`width`/`height`,
    // say).
    <Svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      testID={testID}
      style={style}
      {...props}
    >
      <Path d={SUITEDNESS_PATHS[suitedness]} fill={color} />
    </Svg>
  );
}
