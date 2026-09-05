---
status: accepted
---

# Carry Per-Card-Pair Results at Settlement as Fixed-Slot Buffers, Under a Stated Card Pair Numbering

On 2026-09-05, this record supersedes
`2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md`.
It keeps that record's decision unchanged and adds the reason the card pair
numbering the fixed-slot buffers rely on is now stated explicitly rather
than assumed.

On 2026-09-04, once
`2026-09-04-define-the-blocker-score-as-a-per-opponent-mean-equity-shift.md`
had settled what number to carry, the session measured how the blocker
score and each card pair's own equity could cross the Nitro boundary from
the `espada-engine` crate into the app.

Reading the pinned `react-native-nitro-modules` 0.37.0 and `nitrogen`
0.37.1 sources, and running the generator on a copy of the module's spec,
found that a `number[]` or `string[]` field converts on the JavaScript
thread, one JSI call per element, with no typed-array fast path — a string
element additionally allocates a JavaScript string — while an `ArrayBuffer`
field wraps in one O(1) call with no byte copy, its native buffer staying
alive as long as the JavaScript object that wraps it. At the five-player
ceiling issue #42 sets, a string-keyed payload works out to about 46,000
per-element JSI calls per settlement, 6,630 of them string allocations, and
building the string codes cost the engine about ten times more than filling
a fixed layout, at every table size measured.

Timings, release build on the session host, median of five runs: the
existing exhaustive walk cost 226 ms at the flop, 14 ms at the turn, and 0.4
ms at the river for three players; computing Δ for all six ordered player
pairs took 0.05 ms, against 5.1 ms for the same by a naive double loop. On
synthetic worst-case rows — every player holding all 1,326 card pairs —
filling both fixed-layout buffers cost 0.03 ms for three players and 0.07
ms for five, against 0.44 ms and 0.78 ms respectively for the same data as
string codes; per-card sums and the Δ computation itself added at most 0.79
ms more, for a total added settlement cost of about 0.3 ms for three
players and 0.9 ms for five. The settle payload itself grows by a fixed
10,608 × players bytes for the equities and 10,608 × players × (players −
1) bytes for the scores, once per job — about 95 KB for three players and
265 KB for five, regardless of range width. The maintainer intends to raise
the app's progress callback rate from its current 10 Hz towards 20–30 Hz,
which a per-tick payload of this size would work against; the fixed-slot
buffers therefore cross only at settlement, never on a progress tick. The
engine's own rank ordinal runs ace first and deuce last, the reverse of the
app's deuce-first order, so the specification states the shared card pair
number explicitly, with the engine converting its ordinal, instead of
assuming the two ordinals already agree. See `specs/equity-analysis.md`'s
The Blocker Score section for the resulting contract.

Alternatives considered:

- **Carry both buffers on every progress tick.** Rejected given the planned
  rise to 20–30 Hz: the payload is sized for once per job. The engine's own
  per-tick cost — about 0.3 ms for three players and 0.9 ms for five, from
  the synthetic rows above — was not the reason; the payload size was.
- **A payload of string-keyed card pair codes.** Rejected: at five players
  it works out to about 46,000 per-element JSI calls per settlement, 6,630
  of them string allocations, and the codes cost the engine about ten times
  more to build than the fixed layout, at every table size measured.
- **Plain `number[]` arrays for the scores and equities, keyed by position
  alone.** Rejected on the same Nitro finding as the string-keyed codes: a
  `number[]` field converts on the JavaScript thread one JSI call per
  element with no typed-array fast path — the identical per-element cost,
  without even the codes' self-describing keys to show for it.
- **Seat-indexed columns, with a sentinel in the scoring player's own
  column.** Rejected: a consumer averaging a row could silently include the
  sentinel, and it wastes one column in five; the skip-self ordinal used
  instead costs the reader one comparison instead.

Two things this decision does not do. It does not persist the scores or
equities in a history entry — that is a follow-up separate from issue #178
(which shipped as #185), needing its own normalised storage rather than an
extension of the existing one. And it adds no telemetry beyond leaving the
measurement point the specification names — nothing records or sends a
number yet, and this decision does not commit to ever doing so.
