/**
 * the Equity Breakdown chart's own bar colour
 * (docs/decisions/2026-09-04-colour-each-histogram-bar-by-its-majority-
 * strength-band.md): a bar's colour is the flat colour of whichever
 * strength band holds the most of that bin's own live card pairs — never a
 * gradient, and never interpolated between two bands. No I/O, no React, no
 * theme import: this module takes the four anchor colours as plain hex
 * strings, resolved by its caller from `theme.bands`
 * (`../../../core/theme/tokens.ts`) — the same "a component reads a token
 * and hands it in" split `../../../core/icons/icon-props.ts` already
 * follows for a colour prop.
 *
 * `../ui/equity-breakdown-chart/equity-breakdown-chart.tsx`'s own `bars`
 * hands `../ui/equity-breakdown-chart/bar-chart.tsx`'s `BarChart` one
 * `{ value, color }` entry per bar, and `color` is a single flat colour
 * drawn as one Skia `Rect` per bar: `../model/strength-band.ts`'s
 * `majorityBandsPerBin` decides *which* band a bar takes, and `bandColor`
 * below is the one place that band resolves to an actual colour string
 * (see docs/decisions/2026-08-26-show-equity-strength-as-a-continuous-
 * gradient.md, superseded by the decision record linked above).
 */
import type { StrengthBand } from './strength-band';

export type BandAnchors = {
  readonly trash: string;
  readonly marginal: string;
  readonly value: string;
  readonly nuts: string;
};

/** `band`'s own anchor colour — a plain lookup, not a computation: every
 * one of `anchors`' own four fields already is one band's exact fill
 * colour, so there is nothing to interpolate between. */
export function bandColor(band: StrengthBand, anchors: BandAnchors): string {
  return anchors[band];
}
