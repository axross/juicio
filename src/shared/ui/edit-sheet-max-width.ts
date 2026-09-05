/**
 * the extra width ceiling the player and board edit sheets add on top of
 * `PANEL_MAX_WIDTH` (`./bottom-sheet/bottom-sheet.tsx`), for a viewport
 * that is wide enough to have already hit that cap but short enough,
 * relative to its own height, to still overflow the sheet panel's own
 * `maxHeight` — a tablet in landscape is the clearest case. Neither the
 * 13×13 rank-pair grid (`./selection-grid/selection-grid.tsx`) nor the
 * card fan (`./cards-pane/cards-pane.tsx`, `./card-fan-geometry.ts`) looks
 * at the viewport's height at all — each derives its own rendered height
 * purely from the width the sheet's panel hands it — so once that width is
 * pinned at 600 (docs/specs/hand-ranges.md's own rationale for that cap),
 * nothing stops either from rendering taller than the panel's own height
 * cap on a short-and-wide viewport. This narrows the panel's *width*
 * instead of teaching either component an independent height cap — see
 * [decisions/2026-09-05-narrow-the-edit-sheet-panel-width-rather-than-teach-height-awareness.md](../../../docs/decisions/2026-09-05-narrow-the-edit-sheet-panel-width-rather-than-teach-height-awareness.md)
 * for why.
 *
 * **flat at `shared/ui/`'s own top level, not colocated with either
 * sheet.** `../features/hand-ranges/ui/holding-input-sheet/
 * holding-input-sheet.tsx` and `../features/evaluations/ui/
 * board-input-sheet/board-input-sheet.tsx` both call this directly, from
 * two different feature directories — exactly
 * docs/conventions/directory-structure.md's own bar for a module that
 * stays flat here rather than colocating into either one's own directory
 * (that document's own `card-fan-geometry.ts`/`grid-coordinates.ts`
 * worked examples).
 */
import { PANEL_MAX_WIDTH } from '@/shared/ui/bottom-sheet/bottom-sheet';

// the fixed vertical room this reserves for the sheet's own chrome — see
// [decisions/2026-09-05-narrow-the-edit-sheet-panel-width-rather-than-teach-height-awareness.md](../../../docs/decisions/2026-09-05-narrow-the-edit-sheet-panel-width-rather-than-teach-height-awareness.md)
// for why, and for what this figure accounts for.
export const EDIT_SHEET_VERTICAL_RESERVE = 240;

/**
 * `undefined` below `PANEL_MAX_WIDTH` — both edit sheets keep rendering
 * exactly as they do today, in either orientation, since this ceiling only
 * ever exists to narrow a panel that has already hit that cap. At or above
 * it, returns `screenHeight - insetTop - insetBottom -
 * EDIT_SHEET_VERTICAL_RESERVE` outright, with no floor and no clamp back
 * down to `PANEL_MAX_WIDTH` on the way out: the caller merges this result
 * into `BottomSheet`'s own `maxWidth` prop alongside a panel whose `width`
 * is already `panelWidth`'s own `Math.min(screenWidth, PANEL_MAX_WIDTH)`
 * (`./bottom-sheet/bottom-sheet.tsx`), so a result at or past
 * `PANEL_MAX_WIDTH` constrains nothing further there — the panel already
 * rendered exactly that wide regardless of what this function returns. No
 * minimum floor is added beneath a small or negative result either: the
 * narrowest realistic case this project currently has reason to support
 * does not appear to produce a degenerate width, and no floor value has
 * any existing precedent in this codebase to draw from — an unusually
 * short wide viewport is a residual risk, not defended against here.
 */
export function editSheetMaxWidth(
  screenWidth: number,
  screenHeight: number,
  insetTop: number,
  insetBottom: number,
): number | undefined {
  if (screenWidth < PANEL_MAX_WIDTH) {
    return undefined;
  }
  return screenHeight - insetTop - insetBottom - EDIT_SHEET_VERTICAL_RESERVE;
}
