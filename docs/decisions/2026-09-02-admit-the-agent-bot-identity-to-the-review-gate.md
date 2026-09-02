---
status: accepted
---

# Admit the Change Loop's Own Bot Identity to the Review Gate

`claude-review.yaml`'s reviewer job never once fired from a review request the
change loop posted itself. The job's author-association gate admits only
`OWNER`, `MEMBER`, and `COLLABORATOR`, and every request the loop posts is a
top-level pull-request comment authored by the `claude[bot]` identity, whose
`author_association` GitHub reports as `NONE` on its own comments — the same
value an outside contributor's comment would carry. The gate's third condition
was therefore false for every request the loop ever posted, and the job was
skipped before any step ran. This decision admits that one bot identity to the
gate, by login rather than by association, alongside the three associations
rather than inside that list.

## The mechanism this fixes

Issue #115 counted the workflow's entire run history — 288 runs — and found
that no run triggered by a `claude[bot]` comment has ever completed
`success`, while all 110 successful reviews came from a human comment. The
108 `claude[bot]`-triggered runs that the issue counted as `skipped` are not
a count of blocked review requests: GitHub creates a workflow run for every
`issue_comment` event and only then evaluates the job's `if:`, so any
comment from that identity produces a `skipped` run whether or not it
carried the review trigger phrase — and the same holds for the skipped runs
the issue attributes to human comments, so both counts bound the problem
rather than measure it. The mechanism itself is confirmed directly, not
inferred from either count: issue #115 found a trigger comment whose run
completed `skipped` with the job reporting zero steps, and pull request #113
has a `claude[bot]`-authored request comment holding the review trigger
phrase and nothing else. The failure was silent throughout: a skipped job
posts nothing to the pull request and the workflow run itself does not fail,
so nothing in the run's own status distinguished "no review was requested"
from "a review was requested and gated out." Re-running a skipped run does
not surface it either, since GitHub re-evaluates the job's `if:` against the
stored event payload, and the association on that payload is fixed at the
moment the comment was created — a manual re-run cannot change what GitHub
already recorded for it.

## What the gate does now

The gate keeps its three association alternatives exactly as they were and
gains a fourth, matching the commenting user's login instead of an association
value, and requiring the comment to carry no Markdown heading anywhere in it.

No human author gains anything from this: the three associations a human
comment can carry are unchanged, and the fourth clause matches only one exact
login string, further narrowed by the heading test below. A comment from any
other non-associated author, bot or human, still evaluates the whole `(...)`
group to false and the job still skips.

## The threat the gate defends against, and why this does not reopen it

The workflow's own comments state the gate's purpose as keeping untrusted
authors from spending the repository's tokens or steering the reviewer.
Neither opens back up:

- **Token spend stays bounded, on both the external and the self-triggered
  side.** A comment authored under the `claude[bot]` identity can only be
  produced by a session already holding this repository's own operator
  credentials — the installed Claude GitHub App and the repository's
  `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`) secret. An outside
  contributor has no way to make GitHub attribute a comment to that identity,
  so admitting the login does not hand a new party the ability to trigger a
  paid run. That bound is not the whole story, though: the reviewer this
  workflow runs also posts its own summary comment under that same
  `claude[bot]` identity, so a login-only clause would have admitted the
  reviewer's own output back through the gate it had just fired from. Any
  summary whose prose happened to quote the review trigger phrase — describing
  the run it just finished, for instance — would satisfy the existing
  `contains(...)` clause and the login clause both, arming a fresh review that
  no human or loop request ever asked for, with the job's
  `cancel-in-progress` concurrency only serialising the resulting runs rather
  than capping how many of them fire. This is not hypothetical: a reviewer
  summary in this repository has already contained the phrase, quoting it
  while describing the run's own timing. The heading test above closes this
  side of the bound: the loop's own request carries only the phrase and a
  generated-by footer and no Markdown heading, while every sampled reviewer
  summary in this repository opens with one, so requiring the bot clause's
  comment to carry no heading anywhere in it admits the loop's requests
  exactly as before while excluding the reviewer's own summaries.
- **Steering stays closed.** The `claude_args` the job passes are a fixed
  `prompt` string naming only the pull request's URL, built from
  `github.event.issue.number` and `github.repository` rather than from
  `github.event.comment.body`. The reviewer's own instructions come from
  `REVIEW.md` on the checked-out base ref. The triggering comment's text is
  never read into either, so admitting a fourth author does not give that
  author's comment body any new route into what the reviewer does.
- **Execution of untrusted code stays closed.** Safety property 2 — the
  base-ref checkout in the `Checkout` step — is untouched by this change: the
  runner still never holds the pull request's head, only the base ref, so no
  code the request's author could have introduced runs on the runner
  regardless of which identity requested the review. The reviewer's
  permissions block (`contents: read`, no `contents: write`) and safety
  property 3's background-task denial (`Task` in `--disallowedTools`) are
  likewise untouched.

## Alternatives considered

- **Match the comment body exactly**, admitting the bot only when its comment
  is nothing but the review trigger phrase and the agent marker. Rejected:
  the workflow expression language has no regular-expression or length
  operator, so this would have to be an exact string equality against a body
  whose precise composition is set by an installed skill this repository does
  not control. The first time that skill's own formatting shifted, the gate
  would start silently skipping again — reproducing exactly the failure this
  decision removes. What it would have bought is also small: the comment body
  never reaches the reviewer's prompt, so a wider body under the admitted
  identity carries no steering risk to narrow in the first place.
- **Admit the `NONE` association itself.** Rejected outright — that would
  admit every outside author, which is precisely the case the gate exists to
  keep out.
- **Leave the gate alone and require a human to request every review.**
  Considered and declined by the maintainer: it puts a manual step in front
  of every change the loop produces, which is the exact cost this decision
  removes.
- **Change the request procedure upstream**, in the installed change-loop
  skill, so a review request does not depend on an agent-authored trigger.
  Considered and declined by the maintainer.

## The cost this accepts

The gate now trusts a login string rather than an association GitHub computes
from repository membership. If the change loop's bot identity's login ever
changes — a GitHub App rename, a migration to a different installation — the
gate silently reverts to skipping the loop's own requests, with the same
silent-failure signature this decision fixes: no failed run, no comment
posted, nothing to notice except reviews that stop arriving. This decision
deliberately adds no mechanism that detects such a skip; that scope was put to
the maintainer and declined, on the basis that the gate change makes the
loop's request work, which is what this decision rests on. The residual risk
is that a future silent regression of this kind is again found only by
someone noticing that reviews stopped arriving.

The heading test added alongside the bot clause carries its own version of
this same risk. It discriminates on content, not on anything GitHub computes:
it holds only for as long as the reviewer's own output keeps carrying a
Markdown heading somewhere in its body and the loop's own request keeps
carrying none at all. If the reviewer's output format ever changed so that a
summary carried no Markdown heading anywhere in its body, a summary that
happened to quote the review trigger phrase could again satisfy the bot clause
and re-arm the gate, reproducing the self-trigger vector this decision closes.
The test is deliberately written broad — `'## '` rather than the reviewer's
specific heading text — so that the likelier
failure mode of such a drift is the gate skipping a legitimate bot-authored
request, not the gate re-admitting a reviewer summary into an unbounded
re-trigger chain. That is the same silent-skip failure mode already accepted
above for the login string: nothing here detects the drift either, so it is
again found only by someone noticing that reviews stopped arriving.
