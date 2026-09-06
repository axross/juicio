---
status: accepted
---

# Stop Filling Per-Card-Pair Equity and Strength Buffers on Progress Ticks

`2026-09-05-carry-per-card-pair-equity-and-strength-as-fixed-slot-buffers-on-every-tick.md`
sent a hand-range player's `equities`/`strengths` — each a fixed-slot buffer
of `CARD_PAIR_COUNT` (1,326) 32-bit floats — on every progress tick as well
as at settlement, so the Equity Breakdown Sheet's histogram and legend could
keep reclassifying every live card pair and redrawing from it while a
calculation was still running. That record's own buffer *shape* is
unaffected by this one: an `ArrayBuffer` still crosses at settlement in one
constant-time, zero-copy call, still one slot per card pair number, still
32-bit floats. What this record reverses is narrower — *filling* that shape
on every tick at all, not the shape itself.

Issue #294 found the cost that per-tick population buys nothing for. The
native engine still has to populate 1,326 slots per player, per buffer, per
tick, to keep both current on the walk's own progress — pure compute spent
whether or not anything downstream reads it. On the JavaScript side, the
sheet already reclassifies and redraws from the buffers on every tick they
change per the prior record's own design, at whatever rate the app's
progress callback fires — the exact per-tick JavaScript-thread cost that
record's own predecessor
(`2026-09-05-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers-under-a-stated-card-pair-numbering.md`)
already tried to keep low by moving off a per-element list, now paid again
one level up the pipeline: a histogram and a four-item legend redrawn
several times a second for the entire span of a calculation the reader is
being told, by the progress bar under the board, to simply wait out.
Nothing in the design (the exhibit at
`https://claude.ai/code/artifact/4a7d83d7-6ed7-4599-abd7-623f807ffa0c`) asks
for a live-updating histogram at all — it asks for a loading state: an empty
axis frame, the legend's counts replaced by an en dash, and a breathing
"Calculating" caption, for as long as the evaluation is running.

The maintainer chose to stop filling `equities`/`strengths` on a progress
tick and fill them only at settlement, the same settlement-only cadence the
identity-bearing card-pair list, the 20-bin `distribution`, and
`blockerScores` already carry. A progress tick now carries every slot of
both buffers at the sentinel `NaN` — the same sentinel a genuinely dead card
pair already carried in a settled result — rather than a shorter or
differently-shaped payload, so the C ABI struct layout
(`EspadaEquityPlayerResult`) and the Nitro bridge's own `ArrayBuffer::copy`
call are unaffected either way; only the native fill loop that used to run
on every tick is skipped now, not the copy across the boundary.

This reopens the exact ambiguity
`2026-09-05-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers-under-a-stated-card-pair-numbering.md`
first named and the "on every tick" record above closed: a progress tick's
`NaN`-filled buffers are indistinguishable, by content alone, from a settled
result with no live card pairs at all. The prior record closed that gap by
filling both on every tick so there was always real content to read; this
one reopens it deliberately, because the JavaScript side no longer needs to
tell "a live card pair" from "no card pair yet" out of buffer content —
`src/features/evaluations/adapter/use-equity-evaluation.ts`'s own
`useEquityEvaluationStatus()` already reports `'calculating'` versus
`'calculated'` at the run level, and the sheet now gates its loading
treatment on that status instead of on what the buffers contain. Reading
`status` rather than buffer content is not new to this change — the header's
own result percentage and the board's own progress bar already read a
different, always-populated aggregate field regardless of tick or
settlement — this record extends that same "read status, not buffer
content" split to the histogram and legend, which previously were the one
part of this sheet still reading per-tick buffer content directly.

Alternatives considered:

- **Keep filling both buffers per tick and gate the *display* on status
  instead**, discarding native and payload cost but not silencing the
  redraw. Rejected: it pays the fill cost this record exists to remove
  while still hiding its own result, buying nothing over stopping the fill
  outright.
- **Fill only `equities`, drop `strengths` from the per-tick shape.** The
  histogram's own Rule R1 classification needs both postflop; a
  strength-less mid-run classification would misclassify every live pair
  as preflop-only, which is wrong even before this record's own loading
  state replaces classification during a run entirely. Not taken.
- **A distinguishable sentinel closer to a real value (e.g. `-1`) instead of
  `NaN`.** Buys nothing a status read does not already solve more directly,
  and risks a `-1` being read as a real, if degenerate, equity by a caller
  that does not check status. Not taken.

Consequently, `docs/specs/equity-breakdown.md`'s own claim that a running
calculation's bars ease from their previous heights toward new ones (issue
#197) no longer describes a reachable case for this sheet: a bar count of
zero (the loading state's own empty `bars`) to a settled bar count is always
an entrance to `./bar-chart.tsx`'s own eyes, never the same-count "update"
case that easing described, since starting a new job always transitions
through `'calculating'` first. `./bar-chart.tsx` keeps that update-easing
mechanism regardless — it is a generic capability of that primitive, not
special-cased to this one caller, and a different caller reusing it later
could still exercise it — but the Equity Breakdown Sheet's own histogram no
longer reaches it as of this change.
