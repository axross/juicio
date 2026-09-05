---
status: accepted
---

# Read Live Equity Results Inside the `GestureDetector`, Not Above It

`PlayerRowLiveContent` (`src/features/evaluations/ui/player-row/
live-content.tsx`) reads a player's own live equity result directly, through
`usePlayerEquityResult`, rather than receiving it as a prop from
`PlayerRow`. `PlayerRow` itself renders `PlayerRowLiveContent` inside its own
`GestureDetector`, and no longer reads the live result anywhere in its own
render body.

`react-native-gesture-handler`'s `GestureDetector` re-syncs its gesture
configuration to the native side on every render of whatever renders it,
regardless of whether the gesture's own configuration actually changed — its
own native re-sync effect depends on its entire incoming `props` object,
not on any one prop's own identity. With `PlayerRow` itself reading the live
result and passing it down as a prop, every live progress tick for that
player re-rendered `PlayerRow`, and with it the `GestureDetector` it
renders, re-syncing that gesture to the native side on every tick — for
nothing the gesture itself needed to know about.

Moving the subscription one level inside the `GestureDetector`, into
`PlayerRowLiveContent`, is what fixes this: `PlayerRow`'s own render body no
longer reads the live result at all, so it has no reason to re-render on a
tick, and neither does the `GestureDetector` it renders — only
`PlayerRowLiveContent` does, since it is the one thing `usePlayerEquityResult`
is actually called from. `PlayerRowLiveContent` renders the exact same JSX
`PlayerRow` used to render directly; nothing about what the row shows
changed, only which component re-renders on a live tick.

This is a distinct defect and fix from the one that moved
`EquityProgressBar`'s own subscription down to itself (see
docs/decisions/2026-09-05-subscribe-equityprogressbar-directly-to-the-equity-store.md):
that fix avoided re-rendering the whole player list to save an expensive
React render; this one avoids a `GestureDetector`'s own native re-sync
firing on every tick, a cost that exists independent of how expensive the
render itself is.

Alternative considered: leaving the subscription in `PlayerRow` and relying
on memoization to stop the re-render from propagating further down the
tree. Rejected — the re-sync this fix targets is `GestureDetector`'s own
reaction to `PlayerRow` itself re-rendering, so memoizing what is beneath
`PlayerRow` does nothing to stop the re-sync `PlayerRow`'s own re-render
already triggered.
