# Comments

This project's own addition to the `software-development` skill's comment
conventions: the line between a comment stating why the code is shaped this
way now, which stays admissible, and a comment carrying the history of how
that shape was reached, which does not. It does not restate that skill's
own rules for comment kinds, the admissibility test, comment voice, the
explanatory-comment length budget, or the `TODO` form — read
`.claude/skills/software-development/references/code-quality.md` for those.

## Present Rationale Stays, Past History Does Not

A doc-comment or an explanatory comment MAY state why the code beside it is
shaped the way it is now — a non-obvious behaviour, an edge case, a
constraint the reader could not otherwise see from the code alone. A
comment MUST NOT carry the history of how that shape was reached: a
decision's deliberation, an alternative considered and rejected, a bug's
investigation or its fix's narrative, an on-device verification log, a
maintainer-approval record, or a comparison against a prior implementation
or another codebase's own choice. The line is tense, not topic — "this
batches writes to avoid a render storm" is a present-tense reason and
stays; "this used to write on every keystroke until a bug report found it
dropped frames, so a later change switched it to batching, which the
maintainer confirmed worked on-device" is the same fact wrapped in its own
history, and does not. [This project's own decision to draw the line
there](../decisions/2026-09-05-keep-decision-history-out-of-comments.md)
states why, since the code that follows from it cannot.

This restriction reaches a doc-comment specifically because the installed
skill's own length rule does not: that skill exempts a doc-comment from the
explanatory-comment budget on the assumption that a doc-comment carries
only a current contract, not because it is a place where unbounded
narrative is welcome. The same restriction reaches an explanatory comment that stays
over that budget under the skill's own file-local-rationale carve-out — the
carve-out is for a "why" that genuinely has nowhere else to go, not for
history that has a destination and simply was not sent there.

## Where the Excluded Content Goes

A decision that constrains future work and is not recoverable from the code
belongs in this project's own decision record, under `docs/decisions/`'s
own filename and frontmatter rules, not summarised beside the code it
constrains. The reasoning behind one specific diff belongs in the commit
message that made it. A specification fact or a domain-vocabulary
definition belongs in a spec or in the glossary. A comment that still needs
to name the decision behind it MUST link to that decision record with a
relative link, rather than restate what the record already says.
