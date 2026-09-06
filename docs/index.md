# Documentation

This project's own documentation, alongside its README. Which body answers
which question: **what does the design specify?** → `specs/`, defined further
in [glossary.md](./glossary.md). **What must a change satisfy?** →
`conventions/`. **How is something run or operated?** → `operations/`.
`decisions/` holds why a constraint exists, for the constraints whose
reasoning cannot be recovered from the code.

Documents under `conventions/` and `operations/` use MUST, MUST NOT, SHOULD,
SHOULD NOT, and MAY as [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html)
describes. A `specs/` document describes rather than instructs, and uses none
of them.

## Specifications

- [specs/equity-analysis.md](./specs/equity-analysis.md) — the board, the
  players, and the Analyze screen's states.
- [specs/equity-breakdown.md](./specs/equity-breakdown.md) — the Equity
  Breakdown sheet a hand-range player's row opens, and the Blocker Score.
- [specs/hand-ranges.md](./specs/hand-ranges.md) — hand ranges, presets, the
  preset list and editor, and the card/range input sheet.
- [specs/calculation-history.md](./specs/calculation-history.md) — history
  entries, how they group under a board, and the empty state.
- [specs/settings.md](./specs/settings.md) — language, theme, About
  (feedback and analytics), and the technical information block.
- [specs/navigation.md](./specs/navigation.md) — the four-tab shell, the nav
  bar, and drill-down destinations.

## Conventions

- [conventions/directory-structure.md](./conventions/directory-structure.md) —
  where a file goes, what it is called, and which module may import which.
- [conventions/testing.md](./conventions/testing.md) — the unit-test and
  end-to-end runners, where a test lives, and what the scenario catalog owes
  the suite.
- [conventions/documentation.md](./conventions/documentation.md) — how this
  project's own documentation is kept true: correcting what a change
  invalidated, making a new document reachable, and the checks a documentation
  change owes.
- [conventions/design-system.md](./conventions/design-system.md) — the
  design's colour, effects, type, spacing, and icon tokens.
- [conventions/motion.md](./conventions/motion.md) — the "Soft" character
  every animated surface reads, where it applies, where it does not, and
  how reduced motion collapses it.
- [conventions/copy-conventions.md](./conventions/copy-conventions.md) —
  the app-wide copy rules the design specifies, this project's own
  corrections to it, and the Japanese translation shipped alongside it.
- [conventions/accessibility.md](./conventions/accessibility.md) — how a
  form field's hint and error reach assistive technology given React
  Native's lack of a cross-platform `aria-describedby` equivalent, via
  `accessibilityHint` and a form-level `announceForAccessibility` call.
- [conventions/component-contracts.md](./conventions/component-contracts.md) —
  a component's, a use case's, or a hook's input as arguments and output
  through a passed-in callback: naming a callback for the outcome rather
  than the mechanism, firing exactly one outcome per completed
  interaction, and the reason enum an unsuccessful path owes its caller.
- [conventions/component-styling.md](./conventions/component-styling.md) —
  which styles a component's own root may set and which belong to its
  caller: the three cases this project exempts from that prohibition, and
  the order every caller's `style` prop merges through once it reaches a
  component's root.
- [conventions/component-memoization.md](./conventions/component-memoization.md) —
  where a shared component's `React.memo` re-render protection is applied:
  at the place the component is rendered, never inside the component's own
  file, and where a custom comparator that goes with it belongs.
- [conventions/haptics.md](./conventions/haptics.md) — the event-to-platform
  haptic feedback mapping every touch interaction goes through, and why the
  Android side uses `performAndroidHapticsAsync` rather than `Vibrator`.
- [conventions/product-analytics.md](./conventions/product-analytics.md) —
  the one wrapper a change reaches Amplitude through, the Title Case
  event/property naming convention it enforces, and the on-device opt-out
  preference.
- [conventions/security.md](./conventions/security.md) — the CI supply-chain
  convention: how a third-party GitHub Action is pinned, why the exposure is
  assessed per job, and the exceptions this project has recorded.
- [conventions/continuous-integration.md](./conventions/continuous-integration.md) —
  the fixed ladder a CI job's `timeout-minutes` must land on, how a value is
  derived from measurement, and why the evidence behind it lives in a
  decision record rather than beside the value.
- [conventions/comments.md](./conventions/comments.md) — the line between a
  comment stating why the code is shaped this way now and one carrying the
  history of how that shape was reached, and where the excluded history
  belongs instead.

## Operations

- [operations/development-workflow.md](./operations/development-workflow.md) —
  how a change gets from a stated intent to a merged pull request, and what
  catches a loop that stalls mid-flight within a single session.
- [operations/agent-skills.md](./operations/agent-skills.md) — installing and
  refreshing the agent skills, and the register of deviations and gaps.
- [operations/agent-sessions.md](./operations/agent-sessions.md) — how a
  session starts, the hooks that run during one, the subagents it can spawn,
  and its telemetry tagging.
- [operations/preview-deployment.md](./operations/preview-deployment.md) —
  the Android and iOS preview build and Firebase App Distribution pipelines:
  their stages, their preflight gates, and every secret and variable each
  needs.
- [operations/google-play-release.md](./operations/google-play-release.md) —
  the Android release pipeline that builds a signed Android App Bundle and
  uploads it to Google Play's internal testing track: its stages, the
  one-time Google Play Console and service-account setup, both first-upload
  routes, and which parts have never run against Google Play.
- [operations/ios-testflight-release.md](./operations/ios-testflight-release.md) —
  the iOS release pipeline that builds a signed, App Store-exported IPA and
  uploads it to Apple TestFlight: its stages, the one-time App Store Connect
  API key and provisioning-profile setup, and which parts have never run
  against App Store Connect.
- [operations/store-listing.md](./operations/store-listing.md) — the public
  store listing: the display-name rules on each store, how a trademark
  complaint reaches a maintainer, the in-app purchase prerequisites, and the
  Japanese rendering of the name.
- [operations/native-module-artifacts.md](./operations/native-module-artifacts.md) —
  how a native module's committed artifacts — its Android and iOS binaries and
  its generated Nitro bindings — are produced and committed: the one workflow
  that produces all three, the NDK version, and the 16 KB page-alignment
  requirement.
- [operations/secrets.md](./operations/secrets.md) — every secret and
  variable this project's automation reads, by exact name: what reads it,
  whether it is required, and what happens while it is absent.
- [operations/design-source.md](./operations/design-source.md) — where the
  design file is, how to read it without being misled by its own frame
  naming, and which frames are authoritative for what.
- [operations/claude-code-cloud-session-toolchain.md](./operations/claude-code-cloud-session-toolchain.md) —
  the Claude Code cloud environment's setup script, measured provisioning
  costs and failure behavior, and why an Android emulator does not run there.
- [operations/amp-orb-toolchain.md](./operations/amp-orb-toolchain.md) — the
  repository-owned Amp orb setup for Node/npm, Java, Android, Rust, and locked
  JavaScript dependencies, including its lifecycle and operational limits.

## Decisions

[decisions/](./decisions) holds every decision this project has recorded,
each as its own dated, append-only file.

For what this project is, how to start it, and the commands it has, see
[`README.md`](../README.md). [`AGENTS.md`](../AGENTS.md) is the working
agreement for agent sessions.
