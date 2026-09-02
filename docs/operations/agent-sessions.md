# Agent Sessions

How a Claude Code session starts in this project, the hooks that run during
one, the subagents it can spawn, the one setting that cannot be verified from
inside a session at all, and the environment variables recommended for
cutting a session's cost.

## The Session-Start Hook

In a cloud session, [`.claude/hooks/session-start.sh`](../../.claude/hooks/session-start.sh)
provisions the toolchain, copies `.env.example` to `.env.local` if one does not
exist, materializes the opt-in quality hooks, installs dependencies, and echoes
a pointer to [`AGENTS.md`](../../AGENTS.md) so every session carries the working
agreement into its context.

It exits immediately unless `CLAUDE_CODE_REMOTE=true`, because a local session
manages its own toolchain and should not have one installed under it. Set that
variable by hand to exercise the hook locally.

The toolchain block activates a version manager only when one is **already**
present. It MUST NOT be changed to install one unconditionally: an image that
already ships a usable runtime does not need one, and a hard `curl | sh` turns
a transient network failure into a failed session start — a failure that
surfaces as every later command missing its tools rather than as an install
error.

The hook is wired in [`.claude/settings.json`](../../.claude/settings.json),
which also sets the session's default reasoning effort — `effortLevel`, shipped
as `xhigh`. Both are read at session start, so a change to either reaches only
the next session.

The reminder it echoes names `AGENTS.md` rather than `CLAUDE.md` on purpose.
`CLAUDE.md` is an `@AGENTS.md` import, which is a Claude Code mechanism; a host
that does not resolve imports would read the literal import line instead of the
working agreement.

## The Opt-In Quality Hooks

Format-on-edit and check-before-stop are **opt-in**. They live in
[`.claude/settings.local-example.json`](../../.claude/settings.local-example.json),
which the session-start hook copies to the gitignored `settings.local.json` in a
cloud session; Claude Code hot-reloads them for that session. A local session
skips the hook entirely, so opting in there stays a manual copy.

That example file also pre-approves `send_later` and `delete_trigger`. Those are
not a convenience: `loop-engineering` schedules its own wake with them while
waiting on CI and the independent review, and without the grant every wait
raises a permission prompt that an unattended session cannot answer.

A blocking `Stop` check is expensive in a way a `PostToolUse` repair is not: it
fires only after the agent believes the task is finished, so a failure there
costs a full main turn — the agent has to read the failure, re-plan, and run
its fix — before it can stop again. Whether a check belongs at `Stop` or
earlier, at `PostToolUse`, therefore turns on whether it needs an authoring
decision (something only that turn can supply) or is purely mechanical (safe
to repair the moment the file is written, at no such cost):

- **`npm run lint`, the violations `eslint --fix` repairs** —
  **non-blocking, when `format.sh` gets to a file first.**
  [`format.sh`](../../.claude/hooks/format.sh) repairs these on `PostToolUse`
  as each `.ts`, `.tsx`, `.js`, `.jsx`, or `.mjs` file is written, so they
  reach `Stop` only when the edit fell outside its reach, per the caveat
  below.
- **`npm run lint`, the violations `eslint --fix` cannot repair** —
  **blocking.** The correct repair is an authoring decision — which name to
  choose, which branch of the logic to keep — that only the agent's own turn
  can make. [`check.sh`](../../.claude/hooks/check.sh) never attempts one
  itself.
- **`npm run test:unit`** — **deliberately no longer run by the `Stop` hook
  at all.** A failing unit test surfaces in CI (Expo Merge Checks' `test`
  job) instead of before the agent stops; see
  [the decision record on removing it](../decisions/2026-09-02-remove-npm-run-test-unit-from-the-stop-hook.md)
  for what that trades away.

`format.sh`'s `PostToolUse` hook fires only for a file changed through the
`Edit`, `Write`, or `MultiEdit` tools — the matcher's scope, which this
project deliberately does not widen — so a file changed another way, such as
a Bash heredoc or `sed -i`, reaches `Stop` uncorrected and keeps the blocking
behaviour above for whichever unrepairable violation it carries.

[`check.sh`](../../.claude/hooks/check.sh) runs only for a session that
changed code, and does nothing else. It no longer emits a reminder for a
branch stopped between the push and the pull request; see
[the decision record on removing it](../decisions/2026-08-28-remove-the-stop-hooks-in-flight-reminder.md)
for why.

## Subagents

[`.claude/agents/`](../../.claude/agents/) holds three definitions, and it is
the only home for any of them: an agent definition is not a skill, so the
skills CLI never carries it, and it never appears in `skills-lock.json`.

`implementer.md` is the worker `loop-engineering` delegates Code and Verify to.
It pins a lower-cost model, because a worker inheriting the session's model runs
at the main actor's cost and defeats the point of delegating. It states its
delivery boundary — commits stay local, pushing and publishing belong to
whoever asked — in its own prose rather than by withdrawing a tool.

`reviewer.md` is the reader for the advisory pre-flight review. It denies
exactly two things, editing and spawning, and nothing else. Widening that
deny-list is the tempting mistake and MUST be resisted: judging a change means
confirming what was asked and not only what was written, which reaches the
issue, the plan's artifacts, and the documentation behind a factual claim. A
reviewer that cannot reach one of those does not fail to start — it returns a
report short by exactly those checks, and an under-equipped review reads exactly
like a clean one.

`investigator.md` is the reader for a payload the main actor needs only one
conclusion from — a log, a long thread, a wide search across files or history,
a file tree — so that payload never enters the main actor's own context. It
returns a conclusion and a locator precise enough to go back to the source,
never the payload itself, which is what keeps the read cheap on the caller's
side. Like the reviewer, it denies editing and spawning; it decides nothing the
material does not itself settle, sending an unresolved judgment call back to
whoever asked.

Deleting any of the three files degrades gracefully rather than breaking the
loop. Without the implementer, the loop delegates to a generic agent or runs
single-agent; without the reviewer, the pre-flight stage is skipped rather than
performed by the main actor, which is what keeps it from collapsing into
self-review; without the investigator, the main actor reads the payload itself,
per read, paying in its own context what delegating the read would otherwise
have saved.

## Telemetry Tagging

[`.claude/settings.json`](../../.claude/settings.json) carries an `env` block
setting two OpenTelemetry variables, so this project's usage separates from
every other repository sharing an account or a cloud environment.
`OTEL_RESOURCE_ATTRIBUTES` stamps the repository name onto the resource Claude
Code exports; `OTEL_METRICS_INCLUDE_ENTRYPOINT` adds the session's launch
surface to metric datapoints. They are two mechanisms rather than one — the
resource describes what is emitting, the datapoint attribute describes one
emission — and only the first is a resource attribute. It configures nothing else — no endpoint, no credential, no
`CLAUDE_CODE_ENABLE_TELEMETRY` — so a contributor who has never set telemetry
up sees no behavior change from it.

Verifying a change to that block is the catch: Claude Code does not pass `OTEL_*`
variables to the subprocesses it spawns, so `echo $OTEL_RESOURCE_ATTRIBUTES`
inside a session prints nothing even when the exporter holds the value. Confirm
it in the metrics backend instead, against a session started **after** the
change — an already-running session read its configuration at startup.

## Recommended Environment Variables

Two environment variables are worth setting for any session run here, cloud
or local, per the upstream skills library's own cost analysis
([axross/skills#506](https://github.com/axross/skills/issues/506)) rather than
a measurement of this repository's own usage:

- `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` — moves auto-compaction's trigger
  from a measured median of **784,287** tokens to **384,000**, which that
  analysis estimated lowers the average main context by **29%**.
- `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` — stops prompt-suggestion
  generation, which that analysis measured at **$467 over 30 days (3.0%)** of
  its cost baseline.

Set them in the environment dialog at claude.ai/code for a cloud session, or
in `~/.claude/settings.json` for a local one. `~/.claude/settings.json` does
**not** reach a cloud session — its scope stops at your own machine.

`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` is not a substitute for the first variable:
Claude Code on the web sets it itself, and its value overrides whatever is
added to the environment.

Neither variable belongs in a committed settings file — a cost-saving
behavior one contributor wants is not something to impose on another; that is
also why neither is added to
[`.claude/settings.json`](../../.claude/settings.json) or
[`.claude/settings.local-example.json`](../../.claude/settings.local-example.json)
here.
