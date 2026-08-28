# Continuous Integration

This project's own rule for sizing a CI job's `timeout-minutes`: the fixed
ladder a value must land on, how a value is derived from measurement, and
why the evidence behind a value lives in the decision record that set it
rather than beside the value or in this document. It does not cover which
runner a job runs on — that is a separate question this document does not
reopen — beyond the one consequence the ladder has on `ubuntu-slim`, stated
below.

## The Ladder

A job's `timeout-minutes` MUST be one of five values — 5, 15, 30, 45, or
60 — and MUST NOT be any other number. A value outside this ladder, however
well it fits the job it guards, is not a conforming value.

## Deriving a Value

A `timeout-minutes` value MUST be derived by taking the job's measured
maximum duration, doubling it, and raising the doubled figure to the
smallest ladder rung that covers it. Doubling is the margin; the ladder rung
is the value that is actually written down.

Where a job's duration on its target runner cannot be measured — because the
job has not run on that runner yet — the value MUST instead be projected
from the runner the job **was** measured on, doubled the same way before
being raised to a rung, and the decision record that sets the value MUST say
plainly that the figure is a projection rather than a measurement. A
projection is what stands until a real measurement exists to replace it; it
is not entitled to be mistaken for one.

## Why a Ladder at All

A ladder costs precision on purpose. Snapping a derived figure up to the
nearest rung routinely leaves a job's declared value unchanged even after
its measured maximum has moved — a job whose maximum grew from one minute to
two still reads `5`, and the ladder is why that is not a bug in the
derivation.

What it buys back is comparability. A reader comparing two workflows'
`timeout-minutes` values is comparing the two authors' intent — how loose a
budget each job was given relative to its own measured cost — rather than
reverse-engineering two unrelated pieces of arithmetic to find out whether
they agree. A value nobody has re-measured in a year still reads as a
decision someone made, not as a number that merely never got revisited.

## Where the Evidence Goes

The measured figures behind a `timeout-minutes` value — the maximum
observed, the runner it was observed on, how many runs were sampled — belong
in the decision record that set the value. They MUST NOT be written as a
comment beside the value in the workflow file, and they MUST NOT be
duplicated into this document either. This document holds the rule that
applies to every job; the decision record holds the numbers behind one
job's value at the time it was set; the workflow file holds only the value
itself, with nothing beside it explaining where the number came from.

This split is deliberate, not incidental: a number beside the value goes
stale the moment the job's real duration moves without anyone touching the
comment, while a rule stated once here does not need to change just because
a measurement did.

## `ubuntu-slim`'s Ceiling

`ubuntu-slim` enforces a hard 15-minute job limit that no `timeout-minutes`
value can raise. A job on `ubuntu-slim` whose declared value is 15 therefore
coincides with the platform's own ceiling and can never fire on its own —
the platform limit is reached first, every time. This is a direct
consequence of the ladder's top rungs: 30, 45, and 60 are meaningless for a
job that runs on `ubuntu-slim`, since the runner itself never lets a job
reach them.
