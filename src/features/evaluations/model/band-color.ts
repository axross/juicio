/**
 * the Equity Breakdown chart's colour ramp (docs/specs/equity-analysis.md):
 * a bar's colour is a flat colour interpolated between the
 * four equity strength-band anchors at that bar's own fractional position
 * on the equity axis — never a gradient fill on the bar itself
 * (`../ui/equity-breakdown-chart/equity-breakdown-chart.tsx` hands
 * `../ui/equity-breakdown-chart/bar-chart.tsx`'s `BarChart` one `{ value,
 * color }` entry per bar, and its own `color` field is a single flat
 * colour, drawn as one Skia `Rect` per bar). No I/O, no React, no theme
 * import: this module takes the four
 * anchor colours as plain hex strings, resolved by its caller from
 * `theme.bands` (`../../../core/theme/tokens.ts`) — the same "a component
 * reads a token and hands it in" split `../../../core/icons/icon-props.ts`
 * already follows for a colour prop.
 *
 * **continuous, per
 * docs/decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md** —
 * there is no equity value at which a bar's colour steps from one band to
 * the next; `bandColorAt` below reads its `position` argument as a
 * continuous `[0, 1]` fraction, not a bucket index.
 */
export type BandAnchors = {
  readonly trash: string;
  readonly marginal: string;
  readonly value: string;
  readonly nuts: string;
};

/** `#rrggbb` (this project's own anchors, `theme.bands.*.solid`, are always
 * this six-digit form) parsed to its three 0–255 channels. */
function parseHexColor(hex: string): readonly [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

/** linearly interpolates each RGB channel between `from` and `to` at `t`
 * (clamped to `[0, 1]` by every call site below, never clamped again in
 * here) and formats the result back to `#rrggbb`. */
function lerpColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = parseHexColor(from);
  const [r2, g2, b2] = parseHexColor(to);
  const r = r1 + (r2 - r1) * t;
  const g = g1 + (g2 - g1) * t;
  const b = b1 + (b2 - b1) * t;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

/**
 * the colour at fractional position `position` (`0` the equity axis's own
 * left edge, `1` its right edge) along the four-anchor ramp
 * `trash → marginal → value → nuts`. Four anchors make three equal
 * segments, each a third of `[0, 1]` wide; `position` is clamped into
 * `[0, 1]` first, so a bar this module is never actually handed a value
 * outside that range for (every caller derives `position` from a bar
 * index within a known count) still resolves to one of the two end
 * anchors rather than extrapolating past them.
 *
 * `bandColorAt(0)` and `bandColorAt(1)` land exactly on `anchors.trash` and
 * `anchors.nuts` — not merely close to them — at every bar count this
 * project draws, because `../ui/equity-breakdown-chart/
 * equity-breakdown-chart.tsx`'s own `barColors` below always includes both
 * endpoints in the positions it asks for.
 */
export function bandColorAt(position: number, anchors: BandAnchors): string {
  const clamped = Math.min(1, Math.max(0, position));
  const segment = clamped * 3;
  if (segment <= 1) {
    return lerpColor(anchors.trash, anchors.marginal, segment);
  }
  if (segment <= 2) {
    return lerpColor(anchors.marginal, anchors.value, segment - 1);
  }
  return lerpColor(anchors.value, anchors.nuts, segment - 2);
}

/**
 * `count` flat colours, evenly spaced across the equity axis — one per bar,
 * left to right. `count === 1` is not a case any real chart ever draws
 * (`../model/equity-breakdown.ts`'s `EQUITY_BIN_COUNTS` starts at 8), so
 * this treats it as a single bar sitting at the ramp's own start (`bandColorAt(0)`)
 * rather than dividing by `count - 1 === 0`. For every `count` this project
 * actually draws, position `i` is `i / (count - 1)`, so the first and last
 * bars always land exactly on `anchors.trash` and `anchors.nuts` — see
 * `bandColorAt`'s own doc comment — and every bar in between is evenly
 * spaced along the same `[0, 1]` fraction, regardless of `count`.
 */
export function barColors(count: number, anchors: BandAnchors): readonly string[] {
  if (count <= 1) {
    return [bandColorAt(0, anchors)];
  }
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(bandColorAt(i / (count - 1), anchors));
  }
  return colors;
}
