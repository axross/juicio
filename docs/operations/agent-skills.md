# Agent Skills

Installing and refreshing the agent skills this project uses, and what to do
when one of them turns out to be wrong or to collide with this codebase.

Every skill under `.claude/skills/` is **installed**, not written here. All of
them come from the shared [axross/skills](https://github.com/axross/skills)
library and are copied in with the
[vercel-labs/skills](https://github.com/vercel-labs/skills) CLI, pinned by
[`skills-lock.json`](../../skills-lock.json). This project owns no skill of its
own — its conventions and operating procedures are the documents you are
reading. Two costs come with that choice. Refreshing needs Node and network
access, because `npx skills` fetches from the library over the network; the
installed skills themselves are plain Markdown, so this cost falls on
refreshing, not on every session. And the library is not this project's own: a
rule that turns out wrong, outdated, or silent on a case here cannot be fixed by
editing the installed copy, because the next install discards the edit while it
poses as a rule the library agrees with — see
[Deviations and Gaps](#deviations-and-gaps) below for how that is handled
instead.

## Install and Refresh

```bash
# refresh exactly the skills this project already manages
npx skills add axross/skills --agent claude-code --yes --copy \
  $(node -p "Object.keys(require('./skills-lock.json').skills).map(s => '--skill ' + s).join(' ')")
```

**Do not use `--skill '*'` here.** Against an external source it installs the
library's *entire* catalogue, not the subset in `skills-lock.json` — today that
would silently adopt the framework, vendor, and UI layers this project has not
chosen. The command above derives the list from the lockfile instead, so it
stays correct as the set changes.

Adopting a new skill means naming it explicitly, and `--skill` takes exactly one
skill per flag: repeat the flag (`--skill a --skill b`) rather than passing a
comma-separated list. A comma-separated value matches nothing, installs nothing,
writes no lockfile, and reports an available-skill list that reads like ordinary
help rather than a failure — so a refresh can appear to succeed while doing
nothing at all.

`npx skills` can also fail to resolve the CLI in a fresh container or against a
stale npx cache, aborting with `npm error could not determine executable to
run`, which reads like a broken command rather than a resolution failure. Retry
that one case with an explicit specifier — `npx --yes skills@latest add …` —
rather than pinning `@latest` on every run, which refetches the newest CLI build
each time.

Every directory under `.claude/skills/` MUST be treated as a generated
artifact. Editing one is pointless — the next install discards it — so a change
to a skill goes upstream to the library as an issue or pull request there. The
regenerated skill directories and `skills-lock.json` MUST be committed together,
and a skill MUST NOT be added to `.claude/skills/` while it is absent from
`skills-lock.json`: the lockfile describes the directory's entire contents, and
that correspondence is what makes drift detectable at all.

Installing a skill does not prove a host loaded it. That is not observable from
inside the session that changed the tree, because skills are read at session
start — so confirm it once in a **fresh** session with `/context`, which is what
proves the installed directories were picked up.

### When Upstream Renames a Skill

The refresh command above breaks on a rename rather than absorbing it: the
lockfile still holds the old name, so the `--skill` list it derives asks the
library for a name that no longer resolves in its catalogue, and the run fails
on that one name instead of refreshing anything. Run the install once by hand
in that case, naming every surviving skill plus the new name explicitly, rather
than deriving the list from the lockfile:

```bash
npx skills add axross/skills --agent claude-code --yes --copy \
  --skill <surviving-skill> --skill <surviving-skill> --skill <new-name>
```

Remove the stale skill with `npx skills remove <old-name>` rather than deleting
its directory by hand — the CLI is what rewrites `skills-lock.json`, and a
directory removed without it leaves the lockfile still claiming a skill that is
no longer on disk.

The rename is not finished at the lockfile. Every repository-side reference to
the old name — a workflow step or script that executes the skill's own scripts
by path, and any prose that names it — is carried in the same change, not left
for later. That includes the `for check in
.claude/skills/<name>/scripts/check-*.mjs` pattern this project uses to run a
skill's validators: pointed at a directory that no longer exists, the glob
expands to nothing, and — without `nullglob` — the shell passes the literal,
unexpanded pattern through, so the command that receives it fails loudly (a
"cannot find module" error, not a silent no-op). A stale path here is caught,
not swallowed, but only once something runs the command; naming the old
directory in `skills-lock.json` and in the affected files is what prevents that
in the first place.

## Deviations and Gaps

Two different things route here, and they resolve the same way. A **deviation**
is a collision — an installed capability requires one thing, this project
deliberately does another. A **gap** is an installed capability being wrong,
outdated, or simply silent on a case that comes up here. Either way the
installed skill is left exactly as it is, and the resolution is written down in
this document.

That matters because an unrecorded deviation reads to the next agent, and to a
reviewer, as a plain violation of a MUST rule, and an unrecorded gap gets
rediscovered from scratch by whoever hits it next.

A suspected gap MUST be verified against the installed skill's own text before
being routed anywhere; a rule that turns out to be stated correctly is a
compliance failure to own, not a defect to file. A real gap is then resolved by
one or both of two routes: an issue opened on
[`axross/skills`](https://github.com/axross/skills) when the gap generalizes
beyond this project, and a written note in the register below saying what the
capability states, what this project does instead, and how to handle the case
meanwhile. The human's go-ahead MUST be obtained before opening an upstream
issue — it is a public write on a repository this project does not own — and the
gap MUST be recorded locally in the meantime rather than leaving the finding to
depend on that issue landing.

The task that exposed the finding continues under the skill exactly as
installed. Routing a change never blocks the work, and never licenses acting as
though the proposed rule were already in force. Any upstream issue filed or left
pending SHOULD be named in the work's completion report, so the finding outlives
the session that produced it.

## The Register

The register is exhaustive, which is what makes it useful: anything in this
codebase that departs from an installed rule and is not listed here is a
finding. A departure MUST be treated as a finding while no entry below matches
it — the register is not licence to assume an unlisted departure was already
blessed.

An entry records a decision the human accepted, with its reason. A hypothetical
or anticipated collision MUST NOT be entered: a deviation is recorded when it is
accepted, not when it is expected.

### Deviation — this project does not use EAS; `expo-app-development` is not a mandate to reach for it

`expo-app-development`'s own build-and-updates reference is written pipeline-
neutral on purpose — it covers a hosted build service and a self-hosted native
pipeline as equally legitimate adapters, and names neither. But the skill's own
frontmatter lists `EAS` among its trigger keywords, and EAS is the Expo
ecosystem's default hosted pipeline, so a session applying this skill can
easily reach for `eas.json`, `eas build`, `eas submit`, `eas update`, or `eas
workflow` as the assumed adapter rather than treating the choice as open.

This project has decided **not** to use EAS at all — no EAS Build, Submit,
Update, or Workflows. A session MUST ignore any EAS-specific tooling or
terminology it might otherwise default to when applying `expo-app-development`,
and follow [`docs/operations/preview-deployment.md`](./preview-deployment.md)
for how this project actually builds, previews, and ships instead.

This is recorded here rather than left to be rediscovered, because the
skill's own pipeline-neutral reference gives no signal that a project might
reject one adapter outright — only that a session should not assume either.
