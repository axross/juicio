---
status: accepted
---

# Remove the Stop Hook's In-Flight Reminder

[`check.sh`](../../.claude/hooks/check.sh), the project's opt-in `Stop` hook,
carried a second mechanism alongside its blocking lint/test check: whenever the
branch had commits ahead of the default branch that were all pushed and the
tree was clean — the state a change loop leaves behind when it stopped between
the push and the pull request — the removed code printed
`{"systemMessage": "..."}`: a JSON object whose only key, `systemMessage`,
sits at the **top level** of the hook's output. That is a different field from
`hookSpecificOutput`, the separate object a `Stop` hook nests
`additionalContext` inside — discussed below — and the reminder used only the
former. The message itself read:

> Reminder: pushed commits are ahead of the default branch on this branch. If
> no pull request with an independent review exists for them, the change loop
> is incomplete — do not report this work as done.

That mechanism has been removed rather than repaired, and not replaced with
anything: no dedupe file, no `git fetch` to refresh what it compared against,
no reworded message, no new hook. It was found to carry three independent
defects, verified against a run of this project's own session on 2026-08-28.

## Defect 1: It reported commits the session never made

The gate's `change_in_flight` function compared the branch head against the
local `origin/<default>` remote-tracking ref and never refreshed that ref
itself. In the session that produced this removal, the container was reused
from a checkout cached on 2026-08-26, so `origin/main` sat 20 commits behind
the branch head the session was given: before any commit was authored in that
session, `git rev-list --count origin/main..HEAD` printed `20`; after
`git fetch origin main` it printed `0`. Any session running `git push -u` in
such a container satisfied the whole gate with no work of its own — the
reminder fired for commits the session had not made and a push it had not
performed.

## Defect 2: It repeated on every stop

The gate was a pure state test with no memory, and both of the code paths that
did not fail a check ended by evaluating it again — the path taken when no
code had changed, and the path taken after both checks passed. Claude Code's
`Stop` hook fires each time the agent finishes responding, including on turns
that only answered a question — so the reminder re-emitted after the pull
request was already open, through every address round of the independent
review, at every CI wake, and at the ready handoff: exactly the states where
it had nothing left to catch. The hook cannot query GitHub for an open pull
request, so it had no way to tell any of those states apart from the one it
existed to flag.

## Defect 3: Its imperative was addressed to a reader that never received it

Claude Code's hooks reference documents `systemMessage` as a "Warning message
shown to the user" — it does not enter the agent's own context. The sentence
"do not report this work as done" was therefore written as an instruction to
an agent that never read it. The only reader who receives the message is the
human, and whether a pull request with an independent review exists for those
commits is not something that human can confirm from the message itself.

## Why neither hook output channel can carry a non-blocking reminder to the agent

The field that does reach the agent, `hookSpecificOutput.additionalContext`,
is documented for `Stop` as non-error feedback that keeps the conversation
going through the same loop protections as `decision: "block"` — the
`stop_hook_active` input and the 8-consecutive-continuation cap — so it
prevents the turn from ending, which is the blocking behaviour this project's
own `agent-sessions.md` had recorded as forbidden for this reminder. There is
no documented `Stop` channel that hands the agent a reminder without also
driving another continuation. Both facts are from Claude Code's hooks
reference, <https://code.claude.com/docs/en/hooks>, verified 2026-08-28.

Given that, a reminder addressed to the agent and a reminder that stays
non-blocking are not two design choices to pick between — the one channel that
reaches the agent is the one channel that cannot stay non-blocking.

## What this accepts

No in-session mechanism now detects a run stopped between the push and the
pull request.
