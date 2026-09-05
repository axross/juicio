---
status: accepted
---

# Drive the Equity-Evaluation Store as a Plain Module-Scope Store

The equity engine's own application-global state — the running or settled
evaluation's status, progress, and per-player results — is a Zustand store
created at module scope in `src/features/evaluations/adapter/
use-equity-evaluation.ts`, not a value threaded through React Context.

A module-scope store needs no provider mounted anywhere in the component
tree to be reachable. That is what lets `useBoardStore.subscribe` and
`usePlayersStore.subscribe`, registered at the top of the same module, drive
`startEquityEvaluation` automatically the moment the module is first
imported — starting, restarting, or cancelling an evaluation as the board
or players list changes, with zero React tree involvement. A Context
value has no equivalent: it exists only once a provider mounts it, so
nothing outside a rendered component tree carrying that provider could
subscribe to it, and the automatic reactive path this store's whole design
turns on would have nowhere to attach.

The store, and the actions that drive it (`startEquityEvaluation`,
`cancelEquityEvaluation`), are exported directly from the module rather than
wrapped behind only the selector hooks a component would use
(`useEquityEvaluationStatus`, `usePlayerEquityResult`). A unit test resets
the store to a known state between cases by calling `useEquityEvaluationStore
.setState(...)` directly, and drives the reactive path by calling
`startEquityEvaluation`/`cancelEquityEvaluation` without rendering any
component at all — the same shape `useBoardStore`/`usePlayersStore` already
use, and the reason this store follows it too.

Alternative considered: a React Context provider, mounted once near the
Analyze screen's own root, carrying the same state. Rejected — the
automatic reactive path is this store's central mechanism, and a Context
value read only by whatever subtree mounts its provider cannot drive
anything outside that subtree, or before it mounts.
