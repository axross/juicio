import { Path, Svg } from 'react-native-svg';

import type { IconProps } from './icon-props';

/**
 * the swipe-to-delete panel's own icon (docs/specs/equity-analysis.md,
 * issue #87), drawn at 20 — this project's one icon so far that isn't
 * drawn on the 24×24 canvas `IconProps`' own doc comment defaults every
 * other icon here to; `size` is passed explicitly by every caller rather
 * than relied on to default.
 *
 * **Heroicons v2 outline `trash`, not Lucide** — measured, not inferred:
 * this project's own icon set is otherwise recorded as "Lucide — inferred,
 * not confirmed" (docs/conventions/design-system.md's Icon Set section),
 * but that inference doesn't hold for this glyph. the design's own 20×20
 * SVG (Figma file `vkZzv1l45PBcVi5Wp92Eqg`) strokes `#ECEEEC` at width 1.5
 * with round caps and joins, and its coordinates are Heroicons' own
 * 24-unit `trash` path scaled by 20/24 exactly: `14.74 → 12.28333…`,
 * `9.26 → 7.71666…`, `18 → 15`, `0.91 → 0.75833…` all match to the
 * design's own five-decimal figures. transcribed at this project's usual
 * 1.5 stroke weight, following `./chevron-right-icon.tsx`'s own pattern of
 * naming a transcribed icon's source in its doc comment.
 */
export function TrashIcon({ color, size = 20, testID }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" testID={testID}>
      <Path
        d="M12.2833 7.5L11.995 15M8.005 15L7.71667 7.5M13.125 4.49417C14.0948 4.56925 15.0616 4.6796 16.0233 4.825C16.3083 4.86833 16.5917 4.91417 16.875 4.96333M16.0233 4.825L15.1333 16.3942C15.097 16.8652 14.8842 17.3051 14.5375 17.626C14.1908 17.9469 13.7358 18.1251 13.2633 18.125H6.73667C6.26425 18.1251 5.80919 17.9469 5.46248 17.626C5.11578 17.3051 4.90299 16.8652 4.86667 16.3942L3.97667 4.825M3.97667 4.825C3.69167 4.8675 3.40833 4.91333 3.125 4.9625M3.97667 4.825C4.93844 4.6796 5.9052 4.56925 6.875 4.49417M13.125 4.49417V3.73083C13.125 2.7475 12.3667 1.9275 11.3833 1.89667C10.4613 1.8672 9.53865 1.8672 8.61667 1.89667C7.63333 1.9275 6.875 2.74833 6.875 3.73083V4.49417M13.125 4.49417C11.0448 4.3334 8.95523 4.3334 6.875 4.49417"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
