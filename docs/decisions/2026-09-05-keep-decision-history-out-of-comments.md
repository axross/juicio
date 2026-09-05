---
status: accepted
---

# Keep Decision History Out Of Comments

An audit run across this codebase's `src/` tree found roughly a quarter of
its `/** */` doc-comments, and a comparable share of its `//` explanatory
comments running past the `software-development` skill's own 300-character
budget, carrying a decision's history rather than its current contract: an
issue or PR number's own story, an alternative weighed and set aside, a
bug's investigation or its fix, an on-device verification log, a
maintainer's approval recorded by date, or a comparison against a prior
implementation. The pattern held across the whole codebase rather than one
file or one author, and it was enabled by a real gap in the installed
skill's own default: that skill exempts a doc-comment from any length rule
at all, on the assumption a doc-comment carries only a contract, and its
explanatory-comment carve-out for genuine file-local rationale that "has
nowhere else to go" was being reached for routinely rather than as an
exception — mostly by content that did have somewhere else to go, this
project's own `docs/decisions/`, and simply was not sent there.

Two things this project's code review already runs under did not catch the
pattern before it reached this scale: the base skill's own admissibility
test, and ordinary review discipline. Whatever the reason, relying on
either alone going forward was not going to behave differently the next
time, so the maintainer chose to write this project's own restriction down
rather than continue trusting review to catch what it had already missed
at this scale.

Established comment-content guidance converges on the same shape this
project's own gap took: Rust's API Guidelines hold that a doc comment
should carry "nothing more" than what a user needs, and route change
history to release notes instead; Oracle's Javadoc guide calls a doc
comment "the specification of the code, from an implementation-free
perspective," and confines version history to one narrow tag rather than
prose; *Clean Code* names change-history-in-comments a "Journal Comment"
and calls it a job version control already does; and Michael Nygard's
original proposal for what became the Architecture Decision Record argues
exactly this kind of rationale belongs in a small, dedicated, dated record,
because a large document embedded in place is never kept up to date. The
one real tension in that guidance is *A Philosophy of Software Design*'s
own instruction to put design rationale in both interface- and
implementation-level comments — read closely, that instruction is about
why the code is shaped this way now, not about narrating how a past
decision was reached, which is why the maintainer drew the line
`docs/conventions/comments.md` now states at tense rather than at topic,
instead of at a length a wordy-but-legitimate present-tense explanation
could just as easily overrun.

## Alternatives considered

- **Cap doc-comment length with a number, the same shape the
  explanatory-comment budget already takes.** Rejected: a length cap both
  overreaches and underreaches the actual defect. A well-disciplined but
  wordy present-tense explanation of a genuinely complex contract would be
  cut off for being long, while a short past-tense fragment — "fixed per
  issue #140" — slips under almost any cap that still leaves room for a
  real sentence. The defect the audit found was in what a comment said, not
  how long it ran.
- **Prohibit rationale in a comment entirely, beyond restating the
  signature.** Rejected: this contradicts comment-content guidance this
  project otherwise finds convincing (*A Philosophy of Software Design*'s
  interface- and implementation-comment rationale, *Clean Code*'s
  "explanation of intent" as a named good comment type), and most of what
  the audit found was legitimate present-tense design reasoning sitting
  alongside the excluded history, not on its own — a blanket ban would cut
  the reasoning that belongs along with the history that does not.
- **Leave the installed skill's default as written and treat this as a
  review-discipline problem instead of a rule gap.** Rejected: the pattern
  the audit found was already present at the scale it was despite code
  review already running under that skill's own rules, which is evidence
  that review alone was not going to behave differently going forward
  without the rule itself changing.

## Consequences

`docs/conventions/comments.md` states this project's own restriction, and
a future comment that would otherwise carry a decision's history now
routes that content to a decision record, a commit message, or a spec
instead, per that document. This decision does not itself rewrite any
comment the audit found; fixing an existing violation is tracked
separately, one issue at a time, so this record is not read as having
already resolved what it found.
