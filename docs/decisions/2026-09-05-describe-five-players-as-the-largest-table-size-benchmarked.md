---
status: accepted
---

# Describe Five Players as the Largest Table Size Benchmarked

`2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md`
measured its fixed-slot-buffer approach at three and five players and
described five as "the five-player ceiling issue #42 sets."
`2026-09-04-classify-strength-bands-from-fair-share-equity-and-current-strength.md`
(same date) instead states six-player support is planned, and the engine's
own `MAX_PLAYERS` constant is `3` — three different figures for the same
project, with neither record citing the other.

## The decision

The documented player ceiling this project targets is six, per the
classify-strength-bands record's own planned figure. The fixed-slot-buffers
record's measurements at three and five players stand as what was actually
benchmarked; its "five-player ceiling issue #42 sets" attribution is retired
rather than restated, since five is not this project's documented ceiling.
Nothing about the fixed-slot-buffers approach itself changes.

## Consequences

`2026-09-04-carry-per-card-pair-results-at-settlement-as-fixed-slot-buffers.md`
is marked superseded by this record. Its own measured figures — JSI-call
counts, timings, and payload sizes at three and five players — remain the
authoritative benchmark data; nothing here replaces them, only the stale
ceiling attribution in its second paragraph.
