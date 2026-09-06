---
status: accepted
---

# State the Card Pair Number as the Engine's Own Ace-First Ordinal, and the Ceiling as Six

On 2026-09-06, this record supersedes
`2026-09-05-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers-under-a-stated-card-pair-numbering.md`,
correcting two things that record got wrong. Neither correction touches the
fixed-slot-buffer decision itself, or the measured benchmark data — JSI-call
counts, timings, and payload sizes at three and five players — that record
carries; both stand unchanged.

## The card pair number's rank order

The superseded record stated that the shared card pair number follows the
app's own deuce-first `DECK` enumeration order, with the native engine
converting its own ace-first ordinal to match. That is backwards. The card
pair number is the native engine's own ordinal, applied directly with no
conversion: `EspadaEquityCardPairResult.cardA`/`cardB`
(`modules/espada-engine/src/specs/espada-engine.nitro.ts`) already runs 0 for
an ace to 12 for a deuce, and that is the number the specification and the
glossary now state — independent of, and the reverse of, the app's own
`DECK` enumeration order (`src/shared/model/card.ts`), which runs deuce
first. No engine-side conversion exists or is needed; the app-side consumer
reads the engine's ordinal as-is.

## The player ceiling

The superseded record — and the 2026-09-04 record it in turn superseded —
attributed its five-player benchmark figure to "the five-player ceiling
issue #42 sets." This project's documented ceiling is six, per
`2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`'s
own already-correct statement that six-player support is planned. Five was
never this project's documented ceiling; it was one of the two table sizes
(three and five) the fixed-slot-buffer approach happened to benchmark. That
attribution is retired rather than restated — the benchmark figures
themselves are not in question, only what five meant.

## Consequences

`docs/specs/equity-breakdown.md`'s Blocker Score section and
`docs/glossary.md`'s Card Pair Number entry state the ace-first rank order
directly, citing this record instead of the superseded one. Any other
document citing the superseded record's card-pair-numbering or five-player-
ceiling rationale is repointed here. Nothing about the fixed-slot-buffer
approach, or its measured benchmark data at three and five players, changes.
