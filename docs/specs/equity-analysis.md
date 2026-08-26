# Equity Analysis

This document describes what the design specifies for the Analyze screen and
its Equity Breakdown sheet. None of it is built yet; this is a record of
design intent, not of shipped behaviour.

## The Board

The top of the Analyze screen carries the **board**: five community-card
slots. Each slot is dashed while empty and fills with a card as one is added.

## The Players Section

Below the board, a `Players` section lists the **players** in the
calculation. A player is added through the card/range input sheet, reached
from `+ New Player` or from an existing row; see
[hand-ranges.md](./hand-ranges.md).

## Screen States

The Analyze screen has three states:

- **Empty** — no players yet. A shark-and-fish illustration, a heading, a
  description, and a lime `+ New Player` pill button. The exact copy is
  settled in
  [conventions/design-system.md](../conventions/design-system.md).
- **Calculating** — a thin lime progress bar sits directly beneath the board.
  Player rows are present, with no result shown yet.
- **Calculated** — the progress bar is gone; each player row carries a result
  and a chevron.

## Player Kinds

A player is one of two kinds:

- An **exact holding** — two specific hole cards (for example `A♡T♡`) —
  rendered as the two cards next to a single result percentage.
- A **hand range** — rendered as a 13×13 dot-matrix icon, a name (which
  truncates when long, e.g. `BTN Call against UT…`), a subtitle, an averaged
  result percentage (`Avg. 17%`), and a `See Details` link that opens the
  Equity Breakdown sheet below. A range player built ad hoc rather than from
  a saved preset — named `Custom` in the design — shows a combo count (e.g.
  `147 Combos`) in place of the subtitle.

Both kinds share one row layout and are swipe-to-delete: a swipe progresses
through `No` / `Started` / `Almost` / `Ongoing` dismissal states to a red
background with a trash icon, independent of whether the row's calculation is
`Done` or still `Ready`. A row is 393×96 at rest, collapsing to 393×48 while
mid-swipe.

## The Equity Breakdown Sheet

`See Details` on a hand-range player opens a bottom sheet with a drag handle.
Its header repeats that player's icon, name, subtitle, and averaged result
(`Avg. 17%`). Below the header:

- a heading, `Equity Breakdown`;
- a four-item legend naming the four **strength bands** — `Trash`,
  `Marginal`, `Value`, `Nuts` — each with a colour swatch;
- a histogram: the y-axis is labelled `Combos`, from `0` to `20`; the x-axis
  is labelled `Equity`, from `0` to `100`. Each bar is one equity bin; a
  bar's height is the number of combos that fall in it. Bar colour is not
  four flat colours — it varies continuously along the x-axis, from cyan
  through yellow-green and orange to red, so a bar's colour and its band
  label agree only approximately. There are no equity values at which a bar's
  colour actually changes band; see
  [decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md](../decisions/2026-08-26-show-equity-strength-as-a-continuous-gradient.md).
- a heading for the currently highlighted bin, in the shape `Equity <hi>
  -<lo>%` (the design's own example, `Equity 75 -70%`, is internally
  inconsistent — a descending range with no explicit sign on the second
  number — and no corrected format has been settled);
- a two-column list of the combos in the highlighted bin, each row showing
  two cards and a result percentage (every row in the observed example reads
  `74.8%`, which is a placeholder value, not a rule).

Every strength-band colour, and the histogram's own palette, is catalogued in
[conventions/design-system.md](../conventions/design-system.md).
