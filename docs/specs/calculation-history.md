# Calculation History

This document describes what the design specifies for the History screen.
**As of issue #180**, the populated screen described in History Entries below
is built and shipped, alongside the Empty State section's own unchanged
behaviour — **as of issue #178**, a History Entry is saved automatically when
a calculation completes, with no explicit save action of the player's own.

## History Entries

The History screen groups **history entries** by calculation date first
(`Today`, `Yesterday`, or a short calendar date for anything older, most
recent first), then under the **board** each was calculated against within
that date, with the group's board shown as a small thumbnail, most recently
calculated board first. Boards of three, four, and five cards are all
observed, as is a board with no cards at all (drawn as three dashed slots —
the design does not distinguish a pre-flop board from an unset one); a
no-board group is rendered the same way as any other, not treated as a
special case.

Within a board group, each history entry is a condensed row — narrower and
shorter than an Analyze player row (356×72, against 393×96) — carrying one
representative player's own preview icon (a 13×13 dot-matrix grid for a hand
range, or a two-card preview for an exact hole-cards holding — the same two
preview shapes an Analyze player row's own `PlayerRowContent` composes from,
via `RankPairGrid`/`HoleCardsPreview` directly rather than that component
itself, which is fixed at Analyze's own taller row with a chevron column and
a result figure neither of which this row has), that player's own name (e.g.
`Player 1`), and a truncated holding subtitle (`Hole cards`, or a card-pair
count for a hand range — never the `Position, # of Players, Depth, Action`
tag-axis format `docs/conventions/copy-conventions.md` otherwise settles for
this project, which does not apply here since a History Entry carries no
position or stack-depth data of its own). A saved entry can hold two or
three players
(`src/features/history/model/history-entry.ts`'s own `HistoryEntry.players`),
but each row renders only its first seat — neither the design frame nor the
domain model marks a player as an entry's own "primary" one, and one row
stays one saved calculation, never one row per player within it. Tapping a
row does nothing; a history entry is swipe-to-delete, reusing the same
dismissal states, thresholds, and haptics as an Analyze player row's own
swipe-to-delete, minus that row's own long-press-to-drag reorder gesture,
which is Analyze-specific and does not apply here.

## Empty State

With no history entries, the screen shows an hourglass-with-poker-chips
illustration (`src/shared/ui/empty-state/hourglass-illustration.tsx`, issue
#263 — Analyze and Presets keep the shark-and-fish illustration), the
heading `Nothing to look back on`, and the description `Run an analysis and
it'll show up here.`, with no button — built and shipped. The exact copy is
settled in
[conventions/copy-conventions.md](../conventions/copy-conventions.md).
