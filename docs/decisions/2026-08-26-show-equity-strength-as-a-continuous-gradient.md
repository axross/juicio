---
status: superseded
superseded_by: 2026-09-04-colour-each-histogram-bar-by-its-majority-strength-band.md
---

# Show Equity Strength as a Continuous Gradient, With No Bucket Boundaries

The Equity Breakdown histogram's canvas annotation labels four strength bands
— `Trash`, `Marginal`, `Value`, `Nuts` — against ranges `0-25`, `30-50`,
`55-75`, `80-100`. Those ranges are not contiguous: `25-30`, `50-55`, and
`75-80` are all left undefined, so no boundary set can be read directly off
the annotation.

The four names are kept as labels on a continuous gradient, with no equity
value at which a bar's colour or a combo's band actually changes. The
histogram's bar colour varies smoothly across the equity axis rather than in
four flat blocks.

Two boundary sets were considered and rejected as guesses the annotation does
not support. Four equal quarters (`0-25` / `25-50` / `50-75` / `75-100`),
aligned to the annotation's lower bounds, was rejected. `0-30` / `30-55` /
`55-80` / `80-100`, aligned to its upper bounds, was rejected too. Neither
reading is more supported by the annotation than the other, and choosing
either would present a guess as a specification.

This defers a real cost rather than removing it: the moment anything needs to
classify a single combo as `Value` rather than `Marginal` — filtering,
aggregating per band, or labelling a combo list — boundaries have to be
chosen after all, at that point, by whoever builds it.
