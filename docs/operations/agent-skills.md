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

## Discovery Metadata

Every installed skill front-loads its trigger in `description`, which is the one
field every host reads. `user-invocable` is a Claude Code frontmatter extension,
and its companion `when_to_use` is deliberately absent from the installed
skills: `when_to_use` is not part of the Agent Skills specification, so a
trigger placed only there would be invisible on another host, and the skill
would simply never fire. A skill whose trigger has to be findable MUST carry it
in `description` rather than in a host-specific field.

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

### Deviation — this project writes `specs/` for behaviour the design specifies but nothing has built yet

`living-project-documentation`'s own rule for a spec is present-tense and
unconditional: `specs/<domain>.md` MUST write "what the product does" — not
what it will do, should do, or once did — which reads as a document that
cannot exist before the behaviour it describes does.

This project's `docs/specs/` documents describe screens and behaviour the
Figma design file specifies, none of which is implemented yet. Each one
opens by saying so explicitly, and the domain's present tense describes the
*design's* behaviour, not the app's. This was a deliberate choice, weighed
against two alternatives: a project-specific fifth body under `docs/` for
designed-but-unbuilt material, which would need its own placement and
cross-reference rules invented from nothing; and leaving the design reading
to the tracking issues that will implement each domain, which was rejected
because a reading that lives only in one issue's history is not the shared
reference every later issue touching that domain needs.

A session reading one of these documents MUST NOT infer that the behaviour
described is implemented — check the code, not the document's tense, before
relying on that. A session implementing a domain these documents cover
SHOULD treat the document as the specification to build against, and correct
it in the same change once the implementation diverges from what the design
specified, exactly as
[conventions/documentation.md](../conventions/documentation.md) already
requires for any document a change makes wrong.

**This deviation has narrowed, not closed.** The tab-bar shell and Settings
issue corrected `specs/settings.md` and `specs/navigation.md`, and the
empty-state sections of `specs/equity-analysis.md` and
`specs/calculation-history.md`, from design intent to a description of
shipped behaviour, exactly as the paragraph above already asks a session to
do once it implements a domain a spec covers. `specs/hand-ranges.md` in
full, and everything in `specs/equity-analysis.md` and
`specs/calculation-history.md` past the empty state — the board, the
Players section, the Calculating and Calculated states, the Equity
Breakdown sheet, history entries and their grouping — remain unimplemented,
so this deviation still governs the majority of `docs/specs/`. A session
reading any `specs/` document still MUST NOT infer implementation from
tense alone: check the code for the specific behaviour in question, since a
single spec file can now hold both shipped and still-unbuilt material side
by side.

### Deviation — `borderWidth.hairline` reads React Native's `StyleSheet`, not Unistyles'

`react-component-styling` states two rules that cannot both hold for this one
token. Its Unistyles reference requires that `StyleSheet` be imported from the
Unistyles package, "never from React Native, so styles participate in the
theming and runtime update path". Its theming reference separately requires
that the border-width family carry "a `hairline` step that resolves to the
platform's thinnest renderable line (`StyleSheet.hairlineWidth` on native)" —
naming that member explicitly.

[`src/core/theme/tokens.ts`](../../src/core/theme/tokens.ts) imports
`StyleSheet` from `react-native` to read `hairlineWidth`, and nothing else from
it. Importing Unistyles' `StyleSheet` there instead pulls its native Nitro
module into every module that imports the token module — including the token
module's own unit test, which then fails to run at all outside a native
runtime. That is not a theoretical objection: swapping the import makes
`npm run test:unit` report the suite as failing to start rather than failing an
assertion.

The two rules are reconcilable only because of what the import is used for.
The Unistyles rule exists so that a **style** joins the theming and runtime
update path; `hairlineWidth` is a device constant, read once at module load,
and a constant read joins no update path whichever package it comes from. The
capability is simply silent on this case — every example it gives is a
component calling `StyleSheet.create`, not a token module reading a static
member — so there is no exception to invoke and no rule being contradicted in
substance.

Two alternatives were weighed and rejected. Deriving the value from
`PixelRatio` avoids the forbidden import but hand-reimplements a platform
constant, so it silently stops matching React Native's own definition the
moment that definition changes, and it contradicts the theming rule that names
`StyleSheet.hairlineWidth`. Mocking `react-native-unistyles` in the token
module's test satisfies the rule's letter but stops the test from checking the
real value and couples the token layer's tests to Unistyles' internals.

A session working in `src/core/theme/` MAY read a static member of React
Native's `StyleSheet` where no Unistyles equivalent is reachable outside a
native runtime, and MUST keep that import narrow — `hairlineWidth` is the only
member this exception covers. Everywhere else, and for every `StyleSheet.create`
call anywhere in this repository, the capability's rule stands unchanged:
`StyleSheet` comes from `react-native-unistyles`. Nothing mechanical enforces
the boundary — `eslint.config.js` carries no rule forbidding the React Native
import — so it holds by review.

No issue was opened on [`axross/skills`](https://github.com/axross/skills) for
this. The gap is recorded here so the finding does not depend on an upstream
change landing; proposing the carve-out upstream stays open as separate work.

### Deviation — this project bans dynamic-function Unistyles styles outright

`react-component-styling`'s Unistyles reference states, as a MUST rule
(`.claude/skills/react-component-styling/references/unistyles.md:106`): "MUST
express an open runtime value — a measured dimension, a caller-supplied
number — as a dynamic function."

This project forbids exactly that construct, everywhere under `src/`, with no
carve-out for the case the rule names. `eslint.config.js` enforces the ban
with `no-restricted-syntax` rules scoped to `src/**/*.{ts,tsx}`, which reject
a Unistyles style whose value is itself a function and the identifier-alias
forms that carry the same hazard while looking, to an AST-only check, like an
ordinary property.

The reason is a theme-refresh gap the skill's rule does not account for: a
dynamic function's `uni__dependencies` are not read until Unistyles calls the
function at least once, which leaves that style's dependencies empty — and
its stylesheet out of both sets a theme change consults — for as long as
nothing has called it yet.
[decisions/2026-08-29-ban-dynamic-function-styles.md](../decisions/2026-08-29-ban-dynamic-function-styles.md)
carries the full mechanism, verified against `react-native-unistyles`'s own
source, and the incident that exposed it (issue #68).

A future component that genuinely needs an open runtime value MUST NOT reach
for a dynamic function to get it, and an `eslint-disable` comment for this
rule is not a sanctioned way around the ban. It MUST instead keep every
theme-derived property in a plain (non-function) `StyleSheet.create` entry —
whose `uni__dependencies` are read at create time like any other style in
this codebase — and apply the runtime value as a separate, non-Unistyles
style at the call site, exactly as
[`src/core/navigation/tab-bar.tsx`](../../src/core/navigation/tab-bar.tsx)
now does for its inset-derived `paddingBottom`.

No issue was opened on [`axross/skills`](https://github.com/axross/skills)
for this. The gap is recorded here so the finding does not depend on an
upstream change landing; the decision record's own position is that whether
the skill's rule should be narrowed or corrected upstream is not this
project's determination to make unilaterally, so that stays open as separate
work.

### Deviation — `component-styling.md` exempts three cases from the root-placement prohibition

`react-component-styling`'s style-composition reference states, as a MUST
rule
(`.claude/skills/react-component-styling/references/style-composition.md:37`):
"MUST NOT set `position`, `margin`, `width`/`inline-size`, or
`height`/`block-size` on a component's own root element. On mobile native
the equivalent prohibition covers `position`, `margin`,
`top`/`left`/`right`/`bottom`, `flex`, `alignSelf`, and fixed
`width`/`height`."

[docs/conventions/component-styling.md](../conventions/component-styling.md)
exempts three cases on a component's own root from that prohibition: a
design-fixed intrinsic dimension (that document's "A Design-Fixed Intrinsic
Dimension Stays With the Component" — `Button`'s 44, `SegmentedTabs`'s
`TRACK_HEIGHT`, and the rest), a positioning context for the component's own
children ("A Positioning Context for a Component's Own Children Is Not
Placement" — `position: 'relative'` anchoring an absolutely-positioned
child the component draws itself), and a portal-rendered overlay's own
placement ("Placement Is the Caller's" own stated exception —
`BottomSheet`'s `position: 'absolute'` and its four insets, since no caller
can place a component that paints outside its own layout in the first
place).

None of the three is the hazard the capability's rule is aimed at. A fixed
intrinsic dimension is not a placement choice at all — it is part of what
the component *is*, and the caller's own `style` still merges last over it,
so nothing about the exemption stops a caller that genuinely needs a
different size from winning. A positioning context is not self-placement
either — `position: 'relative'` here establishes a coordinate space for the
component's own children, never where the component itself sits among its
siblings. And a portal-rendered component has no caller in a position to
place it at all, which is exactly the condition the capability's own rule
presupposes. The capability is silent on all three cases — its examples are
all a component drawing its own interior, never a component with no placing
caller, a component establishing its own children's coordinate space, or a
fixed design constant a caller can still override.

Two alternatives were weighed for the fixed-dimension case and rejected:
exporting each constant and making every call site pass it in, which
scatters a single design fact across every caller that happens to need it
and turns a design change into a repository-wide edit instead of a one-line
one at the component that owns the fact; and dropping the fixed value
entirely in favour of a caller-supplied size on every call, which would
require every caller of `Button`, `NavBar`, and the rest to already know a
dimension the design fixes once, for the component itself, independent of
where any particular caller places it.

**The full-fill case — `flex: 1` and `width: '100%'` on a root
(`component-styling.md`'s "Claiming the Space You Were Given Is Not
Choosing an Amount") — is not part of this deviation.** The same reference's
very next bullet permits exactly this: a full-fill value on the root because
it claims the space the consumer gave rather than choosing an amount. This
project's own roots that carry `flex: 1` or `width: '100%'` are that case,
so they are compliance with the capability's own rule, not a departure from
it.

No issue was opened on [`axross/skills`](https://github.com/axross/skills)
for this. The maintainer declined it at the plan gate; the finding is
recorded here so it does not depend on an upstream change landing.

### Deviation — a text role carries its weight in its face name, not in a `fontWeight`

`react-component-styling`'s theming reference states, as a MUST rule, that a
project "declare typography as named text roles that bundle family, size, line
height, and weight". This project's roles bundle family, size, and line height
only. None carries a `fontWeight`, and
[`src/core/theme/tokens.test.ts`](../../src/core/theme/tokens.test.ts) fails any
role that grows one.

The typeface is why. Innovator Grotesk groups its eighteen styles the classic
four-style way: in the legacy family record — the one iOS resolves `fontFamily`
against — only Regular, Regular Italic, Bold, and Bold Italic read `Innovator
Grotesk`, while Medium reads `Innovator Grotesk Medium`, Semi Bold reads
`Innovator Grotesk Semi Bold`, and so on. A role that named the shared family
and a numeric weight would therefore have nothing to resolve to on iOS for two
of the four weights this project uses. Each role names one face by its
PostScript name instead, so the weight it wants is the face it gets — and
pairing that face with a numeric weight on top would invite the platform to
synthesise a heavier style from one that is already heavy, which is a rendering
defect rather than a redundancy.

The rule's substance survives intact: a role still bundles every axis of its
own type, still resolves to exactly one weight, and is still applied whole
rather than picked apart by a caller. What changes is only which field carries
the weight. The capability's own examples are all CSS custom properties on the
web, where a family name and a numeric weight are independent axes and a font
whose weights are separate families has no equivalent — so the rule does not
appear to anticipate this case rather than to rule against it.

The one place a face is paired with a numeric weight is
[`src/core/navigation/navigation-theme.ts`](../../src/core/navigation/navigation-theme.ts),
because React Navigation's own `FontStyle` type makes `fontWeight` non-optional
and leaves no way to omit it. Each value there is the weight its paired face
already carries, so nothing is asked to synthesise. That is a constraint of a
third-party type, not a second departure.

A session working in `src/core/theme/` or on any component's text styles MUST
give a role exactly one of the four `fontFaces` tokens as its `fontFamily` and
MUST NOT add a numeric `fontWeight` beside it. The rest of the theming rule —
one role per pairing, applied whole — stands unchanged. See
[`docs/decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md`](../decisions/2026-09-02-bundle-innovator-grotesk-and-diverge-from-figmas-inter.md)
for the fuller record of the constraint, and
[`docs/conventions/design-system.md`](../conventions/design-system.md) for the
faces themselves.

No issue has been opened on [`axross/skills`](https://github.com/axross/skills)
for this yet. The maintainer accepted the departure at the plan gate for
[#109](https://github.com/axross/juicio/issues/109), where it was stated in the
system design and its alternative was weighed and rejected; the gap is recorded
here so the finding does not depend on an upstream change landing, and
proposing the carve-out upstream stays open as separate work.
