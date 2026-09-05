---
status: accepted
---

# Colour Each Histogram Bar by Its Bin's Majority Strength Band

`2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`
assigns a strength band to each card pair individually, from its own equity
and current strength. The Equity Breakdown histogram's bars, by contrast,
each draw one equity bin — a count over every card pair the bin holds, not
over a single card pair. Once bands are assigned per card pair rather than
per equity position, a single bin can hold card pairs from more than one
band: on the wet fixture heads-up, the bin around 60–65% equity holds both
`Value` made hands, such as `A♥T♥`, and `Marginal` flush draws, such as
`K♠Q♠`. `2026-08-26-show-equity-strength-as-a-continuous-gradient.md`
had the bars run a continuous colour ramp along the equity axis on exactly
the opposite assumption — that band followed equity position monotonically
— which is no longer true once bands are assigned per card pair, so the
ramp can no longer carry band identity on its own. This decision supersedes
that record and settles what takes the ramp's place once the classification
ships.

## What was compared

Four presentation options were rendered against both app themes, over the
wet, heads-up fixture (`JsTs4h`, 222 live card pairs, R1 bands `[31, 107, 42,
42]`), and put to the maintainer:

- **A — Stacked bars.** Each equity bar becomes a stack of the bands present
  in that bin, bottom to top from `Trash` to `Nuts`, separated by a 2pt gap
  in the sheet's own background colour, with the legend carrying the counts.
  It is the only option that shows both the shape of the range along equity
  and how much of each bin is actually ahead now, so a mixed bin at 50–70%
  equity reads as exactly what it is. Its cost: at the widest bar count a
  segment can be only a few points tall, and `Value` and `Nuts` sit adjacent
  in the stack with fills a categorical-palette check measures at ΔE 7.5 for
  normal colour vision (against the check's own floor of 15) and ΔE 6.9 for
  deuteranopia — close enough that the 2pt gap and the legend counts, not
  the hue, are what carries the distinction between an adjacent `Value`
  segment and a `Nuts` one.
- **B — Majority colour.** Each bar takes the flat colour of whichever band
  holds the most card pairs in its bin, with the legend carrying the counts.
  It keeps the sheet's current silhouette and its one-flat-colour-per-bar
  drawing, while still placing the bands somewhere on the equity axis. Its
  cost: a bin's minority is not visible in its bar — the 60–65% bar reads as
  `Value` although a third of it is `Marginal` flush draws — so a bar's
  colour and the legend's counts can disagree with no way for a reader to
  see why from the bar alone.
- **C — A second band chart.** The equity histogram keeps one neutral
  colour, and a second, four-bar chart beneath the legend shows the four
  band counts directly, with each count on its own bar's cap. Each chart
  then says exactly one thing. Its cost: the sheet grows by about 130pt to
  fit the second chart, and where a band sits along the equity axis is no
  longer visible in either chart — a reader has to hold both charts in mind
  at once to connect them.
- **D — Counts only.** The histogram keeps today's continuous colour ramp
  unchanged; the legend gains the four counts beside their labels. It is
  the smallest change to the sheet and to the chart component. Its cost:
  the ramp still implies a band from equity position alone, which the added
  counts now contradict — a bar coloured toward `Value` by its position on
  the ramp can be a bin that is mostly `Marginal` draws — so the chart
  itself still carries no real band information, only the legend does.

## The decision

The maintainer chose option B, majority colour, from the rendered exhibit in
both themes. Each bar takes the flat colour of the band holding the most
card pairs in its bin; the legend beside each band's swatch carries that
band's total count across every live card pair, not the count within one
bin. A tie between two bands within a bin resolves to the stronger of the
two. A bin with no live card pairs draws no bar, the same as an empty bin
does today.

The four band colours, and their `onSolid`/`text` counterparts, are
unchanged from what the design system already records for the legend and
the bars. This decision took effect once the classification shipped, in
issue #237 (PR #255, merged 2026-09-05); before then, the histogram kept the
continuous colour ramp the record this one supersedes had described.

## Consequences

A bar's colour no longer shows every band present in its bin: the minority
card pairs in a mixed bin — a `Marginal` draw sharing a bin with a `Value`
made hand, for instance — are counted in the legend but not visible in the
bar they sit in. A reader who wants to see the mixed composition of one bin
has only the legend's totals to go by, not a per-bin breakdown. Choosing
majority colour over the stacked-bars option also means the close `Value`
and `Nuts` fills never appear as adjacent segments needing a gap to
distinguish them, so the palette check's ΔE 7.5 finding carries no
consequence for the shipped presentation.
